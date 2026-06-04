from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.rag.retriever import search_chunks


router = APIRouter(prefix="/kbs")


class SearchHitOut(BaseModel):
    chunkId: UUID
    documentId: UUID
    filename: str
    page: int | None = None
    content: str
    score: float


@router.get("/{kb_id}/search", response_model=list[SearchHitOut])
async def search_kb(
    kb_id: UUID,
    q: str = Query(..., min_length=1),
    topK: int = Query(5, ge=1, le=20),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    hits = await search_chunks(db, kb_id=kb_id, query=q, top_k=topK)
    return [
        {
            "chunkId": h.chunk_id,
            "documentId": h.document_id,
            "filename": h.filename,
            "page": h.page,
            "content": h.content,
            "score": h.score,
        }
        for h in hits
    ]

