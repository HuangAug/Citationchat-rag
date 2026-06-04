from __future__ import annotations

import json
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
        self._embedding_model = settings.embedding_model

    def _check_api_key(self) -> None:
        if not self._api_key:
            raise LlmError("LLM_API_KEY is empty")

    async def embed(self, inputs: list[str]) -> list[list[float]]:
        self._check_api_key()

        url = f"{self._base_url}/embeddings"
        headers = {"Authorization": f"Bearer {self._api_key}"}
        payload: dict[str, Any] = {
            "model": self._embedding_model,
            "input": inputs,
            "dimensions": settings.embedding_dimensions,
        }

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

        data = body.get("data")
        if not isinstance(data, list) or not data:
            raise LlmError("LLM response missing data", status_code=res.status_code, body=body)

        embeddings: list[list[float]] = []
        for item in data:
            if not isinstance(item, dict) or not isinstance(item.get("embedding"), list):
                raise LlmError("LLM response missing embedding", status_code=res.status_code, body=body)
            embedding = item["embedding"]
            if not all(isinstance(x, (int, float)) for x in embedding):
                raise LlmError("LLM response invalid embedding", status_code=res.status_code, body=body)
            embeddings.append([float(x) for x in embedding])

        if len(embeddings) != len(inputs):
            raise LlmError("LLM response embedding count mismatch", status_code=res.status_code, body=body)

        return embeddings

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        self._check_api_key()

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

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ):
        self._check_api_key()

        url = f"{self._base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        payload: dict[str, Any] = {"model": self._model, "messages": messages, "stream": True}
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            try:
                async with client.stream("POST", url, json=payload, headers=headers) as res:
                    if res.status_code >= 400:
                        body: Any = None
                        content_type = res.headers.get("content-type", "")
                        if "application/json" in content_type:
                            try:
                                body = await res.aread()
                                body = json.loads(body.decode("utf-8", errors="ignore"))
                            except Exception:
                                body = None
                        else:
                            try:
                                body = (await res.aread()).decode("utf-8", errors="ignore")
                            except Exception:
                                body = None
                        raise LlmError("LLM error", status_code=res.status_code, body=body)

                    async for line in res.aiter_lines():
                        if not line:
                            continue
                        if not line.startswith("data:"):
                            continue
                        data = line[len("data:") :].strip()
                        if not data or data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                        except json.JSONDecodeError:
                            continue

                        choices = obj.get("choices")
                        if not isinstance(choices, list) or not choices:
                            continue
                        delta = choices[0].get("delta")
                        if not isinstance(delta, dict):
                            continue
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            yield content
            except httpx.HTTPError as e:
                raise LlmError("LLM request failed") from e
