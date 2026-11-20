import base64
import asyncio
import json
import random

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.schemas import HazardAnalysis


SYSTEM_PROMPT = """You are a construction-site safety assistant. Review the supplied site photo for visible hazards only. Do not claim certainty when the image is unclear and do not infer facts outside the image. Never state that a site is safe based on one photo. Return only the requested JSON fields: summary (short string describing the concern), severity (critical, high, medium, or low), risk_score (integer 1-100), findings (array of objects with title, details, severity, immediate_action, confidence where confidence is low, medium, or high), recommended_actions (array of short strings). If no clear hazard is visible, say so in summary, use low severity and score at most 20, and state that this does not establish the site is safe. Base severity on plausible consequence and visible exposure; risk_score is a triage aid, not a formal risk calculation."""

HAZARD_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
        "risk_score": {"type": "integer", "minimum": 1, "maximum": 100},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "details": {"type": "string"},
                    "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                    "immediate_action": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["title", "details", "severity", "immediate_action", "confidence"],
                "additionalProperties": False,
            },
        },
        "recommended_actions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "severity", "risk_score", "findings", "recommended_actions"],
    "additionalProperties": False,
}


async def analyze_site_image(image: bytes, media_type: str) -> HazardAnalysis:
    settings = get_settings()
    api_key = settings.gemini_api_key or settings.anthropic_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini is not configured. Add GEMINI_API_KEY or replace the existing ANTHROPIC_API_KEY value in backend/.env, then restart the backend.")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [
            {"text": "Assess this construction-site image for immediate safety concerns. Return the required structured hazard assessment."},
            {"inline_data": {"mime_type": media_type, "data": base64.b64encode(image).decode("ascii")}},
        ]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": HAZARD_SCHEMA,
            "maxOutputTokens": 1200,
            "temperature": 0.2,
        },
    }
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            for attempt in range(3):
                response = await client.post(
                    endpoint,
                    headers={"x-goog-api-key": api_key, "content-type": "application/json"},
                    json=payload,
                )
                if response.status_code != 503 or attempt == 2:
                    break
                await asyncio.sleep((2 ** attempt) + random.uniform(0, 0.25))
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Gemini image analysis timed out. Please try again.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach Gemini. Check the backend network connection.") from exc

    if response.status_code >= 400:
        if response.status_code in (401, 403):
            detail = "Gemini rejected the API key. Check GEMINI_API_KEY or the value stored under ANTHROPIC_API_KEY, and confirm the Gemini API is enabled for that key."
        elif response.status_code == 429:
            detail = "Gemini quota or rate limit reached. Check the Google AI Studio project quota."
        elif response.status_code == 404:
            detail = "The configured Gemini model was not found. Check GEMINI_MODEL in backend/.env."
        elif response.status_code == 503:
            try:
                provider_message = response.json().get("error", {}).get("message", "")
            except (ValueError, AttributeError):
                provider_message = ""
            detail = "Gemini is temporarily unavailable after retries. Please try again shortly."
            if provider_message:
                detail = f"Gemini is temporarily unavailable after retries: {provider_message[:240]}"
        else:
            detail = f"Gemini returned an API error ({response.status_code}). Check the backend configuration and logs."
        raise HTTPException(status_code=response.status_code if response.status_code == 429 else 502, detail=detail)

    try:
        body = response.json()
        parts = body["candidates"][0]["content"]["parts"]
        text = "".join(part["text"] for part in parts if "text" in part)
        result = HazardAnalysis.model_validate_json(text)
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Gemini returned an unreadable hazard assessment. Please retry the image.") from exc
    return result
