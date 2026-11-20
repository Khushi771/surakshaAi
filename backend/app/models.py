from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(180), default="Unspecified")
    severity: Mapped[str] = mapped_column(String(20), default="medium", index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    assignee_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    assignee_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    actions: Mapped[list["Action"]] = relationship(back_populates="incident", cascade="all, delete-orphan")


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    owner: Mapped[str] = mapped_column(String(120), default="Unassigned")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    incident: Mapped[Incident] = relationship(back_populates="actions")
