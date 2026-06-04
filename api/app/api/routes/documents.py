from __future__ import annotations

import asyncio
import os
from datetime import datetime
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.core.config import settings
from app.db.models.chunk import Chunk
from app.db.models.document import Document
from app.db.models.kb import KnowledgeBase
from app.rag.indexer import index_document
from app.storage.upload import remove_if_exists, save_upload


router = APIRouter(prefix="/kbs")


class DocumentOut(BaseModel):
    id: UUID
    kbId: UUID
    filename: str
    status: str
    errorMessage: str | None = None
    createdAt: datetime


class UploadDocumentResponse(BaseModel):
    documentId: UUID
    status: str


@router.get("/{kb_id}/documents", response_model=list[DocumentOut])
async def list_documents(kb_id: UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.kb_id == kb_id).order_by(Document.created_at.desc()))
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "kbId": d.kb_id,
            "filename": d.filename,
            "status": d.status,
            "errorMessage": d.error_message,
            "createdAt": d.created_at,
        }
        for d in docs
    ]


@router.post("/{kb_id}/documents", response_model=UploadDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    kb_id: UUID,
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if kb is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KB not found")

    doc = Document(kb_id=kb_id, filename=file.filename or "file", storage_path="", status="uploading")
    db.add(doc)
    await db.flush()

    safe_name = os.path.basename(doc.filename)
    dest_path = os.path.join(settings.storage_dir, "kbs", str(kb_id), f"{doc.id}_{safe_name}")
    doc.storage_path = dest_path

    try:
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        await save_upload(file, dest_path, max_bytes=max_bytes)
        doc.status = "uploaded"
        doc.error_message = None
        await db.commit()
    except HTTPException as e:
        doc.status = "failed"
        doc.error_message = str(e.detail)
        await db.commit()
        await remove_if_exists(dest_path)
        raise
    except Exception:
        doc.status = "failed"
        doc.error_message = "Upload failed"
        await db.commit()
        await remove_if_exists(dest_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")

    asyncio.create_task(index_document(doc.id))
    return {"documentId": doc.id, "status": doc.status}


@router.delete("/{kb_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    kb_id: UUID,
    document_id: UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == document_id, Document.kb_id == kb_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_path = doc.storage_path
    doc.status = "deleting"
    await db.commit()

    await db.execute(delete(Chunk).where(Chunk.document_id == doc.id))
    await db.delete(doc)
    await db.commit()

    if storage_path:
        await remove_if_exists(storage_path)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
