from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import get_settings

router = APIRouter(prefix="/api/media", tags=["media"])
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"}
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "audio/webm": ".webm", "audio/wav": ".wav", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/ogg": ".ogg"}


@router.post("")
async def upload_media(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Upload a supported image or audio file")
    settings = get_settings()
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    path = settings.media_dir / f"{uuid4().hex}{EXTENSIONS[file.content_type]}"
    limit = settings.max_upload_mb * 1024 * 1024
    total = 0
    with path.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                output.close()
                path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB limit")
            output.write(chunk)
    return {"url": f"/media/{path.name}", "content_type": file.content_type, "size": total}
