from __future__ import annotations

import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.routes.auth import get_current_user
from app.db.models.chat import Chat
from app.db.models.chat_message import ChatMessage as ChatMessageModel
from app.db.models.kb import KnowledgeBase
from app.llm.client import LlmError, OpenAICompatClient
from app.rag.retriever import search_chunks


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
    citations: list[dict] = []


def _build_rag_prompt(hits: list, *, question: str) -> tuple[list[dict], list[dict]]:
    if not hits:
        return [], []

    citations: list[dict] = []
    lines: list[str] = []
    for i, h in enumerate(hits, start=1):
        page = f" p.{h.page}" if h.page else ""
        snippet = h.content.strip().replace("\r\n", "\n").replace("\r", "\n")
        if len(snippet) > 800:
            snippet = snippet[:800]
        lines.append(f"[{i}] {h.filename}{page}\n{snippet}")
        citations.append(
            {
                "index": i,
                "chunkId": str(h.chunk_id),
                "documentId": str(h.document_id),
                "filename": h.filename,
                "page": h.page,
                "score": h.score,
            }
        )

    system = (
        "你是企业知识库助手。回答必须优先基于提供的 Sources。\n"
        "如果 Sources 不包含答案所需信息，请明确说明“知识库中未找到相关信息”。\n"
        "在回答中用 [数字] 标注引用来源，例如：xxx[1][2]。\n\n"
        "Sources:\n"
        + "\n\n".join(lines)
    )
    return [{"role": "system", "content": system}], citations


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
        result = await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.is_default.is_(True)).order_by(KnowledgeBase.created_at.asc())
        )
        kb = result.scalars().first()
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

    hits = await search_chunks(db, kb_id=chat.kb_id, query=new_user_content)
    rag_msgs, citations = _build_rag_prompt(hits, question=new_user_content)
    llm_messages = rag_msgs + llm_messages

    client = OpenAICompatClient()
    try:
        answer = await client.chat(messages=llm_messages)
    except LlmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    db.add(ChatMessageModel(chat_id=chat.id, role="assistant", content=answer, citations=citations))
    await db.commit()

    return {"answer": answer, "chatId": chat.id, "citations": citations}


@router.post("/stream")
async def chat_stream(req: ChatRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
        result = await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.is_default.is_(True)).order_by(KnowledgeBase.created_at.asc())
        )
        kb = result.scalars().first()
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

    hits = await search_chunks(db, kb_id=chat.kb_id, query=new_user_content)
    rag_msgs, citations = _build_rag_prompt(hits, question=new_user_content)
    llm_messages = rag_msgs + llm_messages

    client = OpenAICompatClient()

    async def gen():
        yield f"data: {json.dumps({'type': 'meta', 'chatId': str(chat.id), 'citations': citations}, ensure_ascii=False)}\n\n"
        collected: list[str] = []
        try:
            async for token in client.stream_chat(messages=llm_messages):
                collected.append(token)
                yield f"data: {json.dumps({'type': 'token', 'value': token}, ensure_ascii=False)}\n\n"
        except LlmError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
            return

        answer = "".join(collected)
        db.add(ChatMessageModel(chat_id=chat.id, role="assistant", content=answer, citations=citations))
        await db.commit()
        yield f"data: {json.dumps({'type': 'final', 'answer': answer, 'chatId': str(chat.id), 'citations': citations}, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
