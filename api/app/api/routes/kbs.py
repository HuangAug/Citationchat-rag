from __future__ import annotations

import asyncio
import os
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.core.config import settings
from app.db.models.document import Document
from app.db.models.kb import KnowledgeBase
from app.rag.indexer import index_document
from app.storage.upload import remove_if_exists, save_upload


router = APIRouter(prefix="/kbs")


class KbOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    createdAt: datetime
    updatedAt: datetime


class CreateKbRequest(BaseModel):
    name: str
    description: str | None = None


class CreateKbWithDocumentsResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    documentIds: list[UUID]
    createdAt: datetime
    updatedAt: datetime


class UpdateKbRequest(BaseModel):
    name: str | None = None
    description: str | None = None


@router.get("", response_model=list[KbOut])
async def list_kbs(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).order_by(KnowledgeBase.updated_at.desc()))
    kbs = result.scalars().all()
    return [
        {
            "id": kb.id,
            "name": kb.name,
            "description": kb.description,
            "createdAt": kb.created_at,
            "updatedAt": kb.updated_at,
        }
        for kb in kbs
    ]


@router.post("", response_model=KbOut, status_code=status.HTTP_201_CREATED)
async def create_kb(req: CreateKbRequest, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kb = KnowledgeBase(name=req.name, description=req.description)
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description, "createdAt": kb.created_at, "updatedAt": kb.updated_at}


@router.post("/with-documents", response_model=CreateKbWithDocumentsResponse, status_code=status.HTTP_201_CREATED)
async def create_kb_with_documents(
    name: str = Form(...),
    description: str | None = Form(None),
    files: list[UploadFile] = File(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not name.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is required")
    if not files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="files is required")

    kb = KnowledgeBase(name=name.strip(), description=description.strip() if description and description.strip() else None)
    db.add(kb)
    await db.flush()

    doc_ids: list[UUID] = []
    docs_to_index: list[UUID] = []
    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    for f in files:
        doc = Document(kb_id=kb.id, filename=f.filename or "file", storage_path="", status="uploading")
        db.add(doc)
        await db.flush()

        safe_name = os.path.basename(doc.filename)
        dest_path = os.path.join(settings.storage_dir, "kbs", str(kb.id), f"{doc.id}_{safe_name}")
        doc.storage_path = dest_path
        doc_ids.append(doc.id)

        try:
            await save_upload(f, dest_path, max_bytes=max_bytes)
            doc.status = "uploaded"
            doc.error_message = None
            docs_to_index.append(doc.id)
        except HTTPException as e:
            doc.status = "failed"
            doc.error_message = str(e.detail)
            await remove_if_exists(dest_path)
        except Exception:
            doc.status = "failed"
            doc.error_message = "Upload failed"
            await remove_if_exists(dest_path)

    await db.commit()
    await db.refresh(kb)

    for doc_id in docs_to_index:
        asyncio.create_task(index_document(doc_id))

    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "documentIds": doc_ids,
        "createdAt": kb.created_at,
        "updatedAt": kb.updated_at,
    }


@router.patch("/{kb_id}", response_model=KbOut)
async def update_kb(kb_id: UUID, req: UpdateKbRequest, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if kb is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KB not found")

    if req.name is not None:
        kb.name = req.name
    if req.description is not None:
        kb.description = req.description

    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description, "createdAt": kb.created_at, "updatedAt": kb.updated_at}
