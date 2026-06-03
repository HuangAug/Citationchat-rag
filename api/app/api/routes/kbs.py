from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.db.models.kb import KnowledgeBase


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
