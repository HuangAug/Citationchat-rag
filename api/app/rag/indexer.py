from __future__ import annotations

import os
from uuid import UUID

import anyio
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


async def _read_document_text(storage_path: str) -> str:
    _, ext = os.path.splitext(storage_path)
    ext = ext.lower()
    if ext not in {".txt", ".md", ".markdown", ".json", ".csv"}:
        raise ValueError("Unsupported file type")
    async with await anyio.open_file(storage_path, "rb") as f:
        data = await f.read()
    return data.decode("utf-8", errors="ignore")


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

            text = await _read_document_text(doc.storage_path)
            chunks = _split_text(text, chunk_size=settings.rag_chunk_size, chunk_overlap=settings.rag_chunk_overlap)
            if not chunks:
                raise ValueError("Empty document")

            await db.execute(delete(Chunk).where(Chunk.document_id == doc.id))

            client = OpenAICompatClient()
            batch_size = max(1, settings.rag_embedding_batch_size)
            chunk_id = 0
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i : i + batch_size]
                embeddings = await client.embed(batch)
                for content, embedding in zip(batch, embeddings, strict=True):
                    if len(embedding) != settings.embedding_dimensions:
                        raise ValueError("Embedding dimensions mismatch")
                    db.add(
                        Chunk(
                            document_id=doc.id,
                            kb_id=doc.kb_id,
                            page=None,
                            content=content,
                            metadata={"chunkIndex": chunk_id, "filename": doc.filename},
                            embedding=embedding,
                        )
                    )
                    chunk_id += 1

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

