from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    message: str = Field(min_length=10, max_length=3000)
    website: str = Field(default="", max_length=200)


class ActionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    owner: str = Field(default="Unassigned", max_length=120)
    status: Literal["pending", "in_progress", "done"] = "pending"
    due_date: str | None = None


class ActionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    owner: str | None = Field(default=None, max_length=120)
    status: Literal["pending", "in_progress", "done"] | None = None
    due_date: str | None = None


class ActionRead(ActionCreate):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class IncidentFields(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = ""
    location: str = "Unspecified"
    severity: str = "medium"
    status: str = "open"
    media_url: str | None = None
    assignee_name: str = Field(min_length=2, max_length=120)
    assignee_email: EmailStr


class IncidentCreate(IncidentFields):
    action_items: list[Annotated[str, Field(min_length=2, max_length=180)]] = Field(default_factory=list, max_length=30)


class IncidentRead(IncidentFields):
    id: int
    created_at: datetime
    assignee_name: str | None = None
    assignee_email: EmailStr | None = None
    actions: list[ActionRead] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class IncidentUpdate(BaseModel):
    status: str | None = None
    severity: str | None = None


class HazardFinding(BaseModel):
    title: str
    details: str
    severity: Literal["critical", "high", "medium", "low"]
    immediate_action: str
    confidence: Literal["low", "medium", "high"]


class HazardAnalysis(BaseModel):
    summary: str
    severity: Literal["critical", "high", "medium", "low"]
    risk_score: int = Field(ge=1, le=100)
    findings: list[HazardFinding]
    recommended_actions: list[str]
    media_url: str | None = None
