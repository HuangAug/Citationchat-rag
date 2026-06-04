from __future__ import annotations

import os
import shutil

import anyio
from fastapi import HTTPException, UploadFile, status


async def save_upload(file: UploadFile, dest_path: str, *, max_bytes: int) -> int:
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


async def remove_if_exists(path: str) -> None:
    def cleanup():
        if os.path.exists(path):
            os.remove(path)

    await anyio.to_thread.run_sync(cleanup)


async def remove_tree_if_exists(path: str) -> None:
    def cleanup():
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)

    await anyio.to_thread.run_sync(cleanup)
