from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.db.models.chat import Chat
from app.db.models.chat_message import ChatMessage as ChatMessageModel
from app.db.models.kb import KnowledgeBase
from app.llm.client import LlmError, OpenAICompatClient


router = APIRouter(prefix="/chat")


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    chatId: UUID | None = None
    message: str | None = None
    messages: list[ChatMessage] | None = None


class ChatResponse(BaseModel):
    answer: str
    chatId: UUID


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    new_user_content = req.message
    if not new_user_content and req.messages:
        new_user_content = req.messages[-1].content
    if not new_user_content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="message is required")

    chat_id = req.chatId
    if chat_id is not None:
        result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id))
        chat = result.scalar_one_or_none()
        if chat is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

        result = await db.execute(
            select(ChatMessageModel).where(ChatMessageModel.chat_id == chat.id).order_by(ChatMessageModel.created_at.asc())
        )
        history = result.scalars().all()
        llm_messages = [{"role": m.role, "content": m.content} for m in history] + [
            {"role": "user", "content": new_user_content}
        ]
    else:
        result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.name == "default"))
        kb = result.scalar_one_or_none()
        if kb is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Default KB missing")
        chat = Chat(user_id=user.id, kb_id=kb.id)
        db.add(chat)
        await db.commit()
        await db.refresh(chat)
        llm_messages = (
            [m.model_dump() for m in req.messages] if req.messages else [{"role": "user", "content": new_user_content}]
        )

    db.add(ChatMessageModel(chat_id=chat.id, role="user", content=new_user_content))
    await db.commit()

    client = OpenAICompatClient()
    try:
        answer = await client.chat(messages=llm_messages)
    except LlmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    db.add(ChatMessageModel(chat_id=chat.id, role="assistant", content=answer))
    await db.commit()

    return {"answer": answer, "chatId": chat.id}
