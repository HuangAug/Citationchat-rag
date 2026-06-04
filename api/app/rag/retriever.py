from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.chunk import Chunk
from app.db.models.document import Document
from app.llm.client import LlmError, OpenAICompatClient


@dataclass(frozen=True)
class SearchHit:
    chunk_id: UUID
    document_id: UUID
    kb_id: UUID
    filename: str
    page: int | None
    content: str
    score: float


async def search_chunks(
    db: AsyncSession,
    *,
    kb_id: UUID,
    query: str,
    top_k: int | None = None,
) -> list[SearchHit]:
    q = query.strip()
    if not q:
        return []

    client = OpenAICompatClient()
    try:
        vectors = await client.embed([q])
    except LlmError:
        return []

    query_vec = vectors[0]
    if len(query_vec) != settings.embedding_dimensions:
        return []

    distance = Chunk.embedding.cosine_distance(query_vec).label("distance")
    stmt = (
        select(Chunk, Document.filename, distance)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.kb_id == kb_id)
        .order_by(distance.asc())
        .limit(top_k or settings.rag_top_k)
    )
    result = await db.execute(stmt)

    hits: list[SearchHit] = []
    for chunk, filename, dist in result.all():
        d = float(dist) if dist is not None else 1.0
        score = 1.0 - d
        hits.append(
            SearchHit(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                kb_id=chunk.kb_id,
                filename=str(filename),
                page=chunk.page,
                content=chunk.content,
                score=score,
            )
        )
    return hits
