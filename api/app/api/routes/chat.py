from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.llm.client import LlmError, OpenAICompatClient


router = APIRouter(prefix="/chat")


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str | None = None
    messages: list[ChatMessage] | None = None


class ChatResponse(BaseModel):
    answer: str


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, _user=Depends(get_current_user)):
    messages = req.messages
    if not messages:
        if not req.message:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="message is required")
        messages = [ChatMessage(role="user", content=req.message)]

    client = OpenAICompatClient()
    try:
        answer = await client.chat(messages=[m.model_dump() for m in messages])
    except LlmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return {"answer": answer}

