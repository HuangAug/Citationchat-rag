from __future__ import annotations

import os
from datetime import datetime
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.core.config import settings
from app.db.models.document import Document
from app.db.models.kb import KnowledgeBase


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


async def _save_upload(file: UploadFile, dest_path: str, *, max_bytes: int) -> int:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    written = 0
    async with await anyio.open_file(dest_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
            await f.write(chunk)
    return written


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
        await _save_upload(file, dest_path, max_bytes=max_bytes)
        doc.status = "uploaded"
        doc.error_message = None
        await db.commit()
    except HTTPException as e:
        doc.status = "failed"
        doc.error_message = str(e.detail)
        await db.commit()

        def cleanup():
            if os.path.exists(dest_path):
                os.remove(dest_path)

        await anyio.to_thread.run_sync(cleanup)
        raise
    except Exception:
        doc.status = "failed"
        doc.error_message = "Upload failed"
        await db.commit()

        def cleanup():
            if os.path.exists(dest_path):
                os.remove(dest_path)

        await anyio.to_thread.run_sync(cleanup)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")

    return {"documentId": doc.id, "status": doc.status}
