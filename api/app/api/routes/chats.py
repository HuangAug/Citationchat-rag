from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.db.models.chat import Chat
from app.db.models.chat_message import ChatMessage


router = APIRouter(prefix="/chats")


class ChatListItem(BaseModel):
    id: UUID
    createdAt: datetime
    lastMessage: str | None = None


class ChatDetail(BaseModel):
    id: UUID
    createdAt: datetime
    messages: list[dict]


@router.get("", response_model=list[ChatListItem])
async def list_chats(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).where(Chat.user_id == user.id).order_by(Chat.created_at.desc()))
    chats = result.scalars().all()

    items: list[ChatListItem] = []
    for c in chats:
        result = await db.execute(
            select(ChatMessage).where(ChatMessage.chat_id == c.id).order_by(ChatMessage.created_at.desc()).limit(1)
        )
        last = result.scalar_one_or_none()
        items.append(
            ChatListItem(
                id=c.id,
                createdAt=c.created_at,
                lastMessage=(last.content[:120] if last else None),
            )
        )
    return items


@router.get("/{chat_id}", response_model=ChatDetail)
async def get_chat(chat_id: UUID, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    result = await db.execute(select(ChatMessage).where(ChatMessage.chat_id == chat.id).order_by(ChatMessage.created_at.asc()))
    msgs = result.scalars().all()

    return {
        "id": chat.id,
        "createdAt": chat.created_at,
        "messages": [{"id": m.id, "role": m.role, "content": m.content, "createdAt": m.created_at} for m in msgs],
    }

