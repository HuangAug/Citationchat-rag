from __future__ import annotations

import asyncio
import os
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.core.config import settings
from app.db.models.document import Document
from app.db.models.kb import KnowledgeBase
from app.rag.indexer import index_document
from app.storage.upload import remove_if_exists, remove_tree_if_exists, save_upload


router = APIRouter(prefix="/kbs")


class KbOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    isDefault: bool
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
            "isDefault": kb.is_default,
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
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "isDefault": kb.is_default,
        "createdAt": kb.created_at,
        "updatedAt": kb.updated_at,
    }


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
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "isDefault": kb.is_default,
        "createdAt": kb.created_at,
        "updatedAt": kb.updated_at,
    }


@router.post("/{kb_id}/default", response_model=KbOut)
async def set_default_kb(kb_id: UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if kb is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KB not found")

    result = await db.execute(select(KnowledgeBase))
    kbs = result.scalars().all()
    for it in kbs:
        it.is_default = it.id == kb.id
    await db.commit()
    await db.refresh(kb)
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "isDefault": kb.is_default,
        "createdAt": kb.created_at,
        "updatedAt": kb.updated_at,
    }


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb(
    kb_id: UUID,
    newDefaultKbId: UUID | None = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await db.execute(select(func.count()).select_from(KnowledgeBase))
    if int(total.scalar_one() or 0) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot delete the only KB")

    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if kb is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KB not found")

    if kb.is_default:
        if newDefaultKbId is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="newDefaultKbId is required when deleting default KB",
            )
        if newDefaultKbId == kb.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="newDefaultKbId must be different from kb_id",
            )

        result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == newDefaultKbId))
        new_default = result.scalar_one_or_none()
        if new_default is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="newDefaultKbId not found")

        result = await db.execute(select(KnowledgeBase))
        kbs = result.scalars().all()
        for it in kbs:
            it.is_default = it.id == new_default.id
        await db.commit()

    kb_dir = os.path.join(settings.storage_dir, "kbs", str(kb.id))
    await db.delete(kb)
    await db.commit()
    await remove_tree_if_exists(kb_dir)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
