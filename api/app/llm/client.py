from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class LlmError(RuntimeError):
    status_code: int | None
    body: Any

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class OpenAICompatClient:
    def __init__(self) -> None:
        self._base_url = settings.llm_base_url.rstrip("/")
        self._api_key = settings.llm_api_key
        self._model = settings.llm_model

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        if not self._api_key:
            raise LlmError("LLM_API_KEY is empty")

        url = f"{self._base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        payload: dict[str, Any] = {"model": self._model, "messages": messages, "stream": False}
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            try:
                res = await client.post(url, json=payload, headers=headers)
            except httpx.HTTPError as e:
                raise LlmError("LLM request failed") from e

        content_type = res.headers.get("content-type", "")
        body: Any = None
        if "application/json" in content_type:
            try:
                body = res.json()
            except ValueError:
                body = None
        else:
            body = res.text

        if res.status_code >= 400:
            msg = "LLM error"
            if isinstance(body, dict):
                err = body.get("error")
                if isinstance(err, dict) and isinstance(err.get("message"), str):
                    msg = err["message"]
            raise LlmError(msg, status_code=res.status_code, body=body)

        if not isinstance(body, dict):
            raise LlmError("Unexpected LLM response format", status_code=res.status_code, body=body)

        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise LlmError("LLM response missing choices", status_code=res.status_code, body=body)

        message = choices[0].get("message")
        if not isinstance(message, dict) or not isinstance(message.get("content"), str):
            raise LlmError("LLM response missing message content", status_code=res.status_code, body=body)

        return message["content"]

