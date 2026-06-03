from __future__ import annotations

import os
from uuid import UUID

import anyio
from docx import Document as DocxDocument
from pypdf import PdfReader
from sqlalchemy import delete, select

from app.core.config import settings
from app.db.models.chunk import Chunk
from app.db.models.document import Document
from app.db.session import SessionLocal
from app.llm.client import LlmError, OpenAICompatClient


def _split_text(text: str, *, chunk_size: int, chunk_overlap: int) -> list[str]:
    t = text.strip()
    if not t:
        return []
    if chunk_size <= 0:
        return [t]
    overlap = max(0, min(chunk_overlap, chunk_size - 1))
    out: list[str] = []
    start = 0
    while start < len(t):
        end = min(len(t), start + chunk_size)
        out.append(t[start:end])
        if end >= len(t):
            break
        start = max(0, end - overlap)
    return out


async def _read_text_file(storage_path: str) -> str:
    async with await anyio.open_file(storage_path, "rb") as f:
        data = await f.read()
    return data.decode("utf-8", errors="ignore")


async def _read_docx(storage_path: str) -> str:
    def read():
        doc = DocxDocument(storage_path)
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        return "\n".join(parts)

    return await anyio.to_thread.run_sync(read)


async def _read_pdf_pages(storage_path: str) -> list[tuple[int, str]]:
    def read():
        reader = PdfReader(storage_path)
        pages: list[tuple[int, str]] = []
        for i, page in enumerate(reader.pages, start=1):
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            t = t.strip()
            if t:
                pages.append((i, t))
        return pages

    return await anyio.to_thread.run_sync(read)


async def _read_document_pages(storage_path: str) -> list[tuple[int | None, str]]:
    _, ext = os.path.splitext(storage_path)
    ext = ext.lower()
    if ext in {".txt", ".md", ".markdown", ".json", ".csv"}:
        return [(None, await _read_text_file(storage_path))]
    if ext == ".docx":
        return [(None, await _read_docx(storage_path))]
    if ext == ".pdf":
        return [(page, text) for page, text in await _read_pdf_pages(storage_path)]
    if ext == ".doc":
        raise ValueError("Unsupported .doc file. Please convert to .docx or .pdf")
    raise ValueError("Unsupported file type")


async def index_document(document_id: UUID) -> None:
    async with SessionLocal() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        doc = result.scalar_one_or_none()
        if doc is None:
            return

        doc.status = "indexing"
        doc.error_message = None
        await db.commit()

        try:
            if not doc.storage_path or not os.path.exists(doc.storage_path):
                raise ValueError("File not found")

            pages = await _read_document_pages(doc.storage_path)
            if not pages:
                raise ValueError("Empty document")

            await db.execute(delete(Chunk).where(Chunk.document_id == doc.id))

            client = OpenAICompatClient()
            batch_size = max(1, settings.rag_embedding_batch_size)
            chunk_id = 0
            for page, page_text in pages:
                page_chunks = _split_text(
                    page_text,
                    chunk_size=settings.rag_chunk_size,
                    chunk_overlap=settings.rag_chunk_overlap,
                )
                if not page_chunks:
                    continue
                for i in range(0, len(page_chunks), batch_size):
                    batch = page_chunks[i : i + batch_size]
                    embeddings = await client.embed(batch)
                    for content, embedding in zip(batch, embeddings, strict=True):
                        if len(embedding) != settings.embedding_dimensions:
                            raise ValueError("Embedding dimensions mismatch")
                        db.add(
                            Chunk(
                                document_id=doc.id,
                                kb_id=doc.kb_id,
                                page=page,
                                content=content,
                                metadata={"chunkIndex": chunk_id, "filename": doc.filename},
                                embedding=embedding,
                            )
                        )
                        chunk_id += 1

            if chunk_id == 0:
                raise ValueError("Empty document")

            doc.status = "indexed"
            await db.commit()
        except (LlmError, ValueError) as e:
            doc.status = "failed"
            doc.error_message = str(e)
            await db.commit()
        except Exception:
            doc.status = "failed"
            doc.error_message = "Indexing failed"
            await db.commit()
