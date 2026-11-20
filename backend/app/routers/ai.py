from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import get_settings
from app.schemas import HazardAnalysis
from app.services.gemini import analyze_site_image

router = APIRouter(prefix="/api/ai", tags=["AI assistance"])
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 7 * 1024 * 1024


@router.post("/image-analysis", response_model=HazardAnalysis)
async def image_analysis(file: UploadFile = File(...)):
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Choose a JPEG, PNG, or WebP image.")
    image = await file.read(MAX_IMAGE_BYTES + 1)
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Photo analysis supports images up to 7 MB.")
    if not image:
        raise HTTPException(status_code=400, detail="The selected image is empty.")

    analysis = await analyze_site_image(image, file.content_type)
    settings = get_settings()
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{IMAGE_TYPES[file.content_type]}"
    (settings.media_dir / filename).write_bytes(image)
    analysis.media_url = f"/media/{filename}"
    return analysis
