from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import Base, engine, migrate_schema
from app.routers import ai, contact, incidents, media, transcription


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    get_settings().media_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="SurakshaAI API", version="0.1.0", lifespan=lifespan)
app.include_router(incidents.router)
app.include_router(media.router)
app.include_router(ai.router)
app.include_router(transcription.router)
app.include_router(contact.router)
app.mount("/media", StaticFiles(directory=str(get_settings().media_dir), check_dir=False), name="media")


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "surakshaai-api"}
