from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./suraksha.db"
    media_dir: Path = Path("./media")
    max_upload_mb: int = 15
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    # Backward-compatible name for the existing deployment environment file.
    anthropic_api_key: str = ""
    sarvam_api_key: str = ""
    sarvam_model: str = "saaras:v4"
    smtp_host: str = "smtpout.secureserver.net"
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    contact_to_email: str = ""
    app_url: str = "https://surakshasafety.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
