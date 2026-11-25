"""Bounded multipart upload reader to prevent unbounded memory buffering."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile


async def read_upload_bounded(
    file: UploadFile,
    *,
    max_bytes: int,
    too_large_detail: str,
    status_code: int,
    chunk_size: int = 64 * 1024,
) -> bytes:
    """Read an UploadFile in chunks up to max_bytes, aborting immediately if exceeded."""
    chunks: list[bytes] = []
    total = 0
    while True:
        remaining = max_bytes - total
        to_read = min(chunk_size, remaining + 1)
        chunk = await file.read(to_read)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=status_code, detail=too_large_detail)
        chunks.append(chunk)
    return b"".join(chunks)
