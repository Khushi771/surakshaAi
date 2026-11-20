import asyncio
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas import ContactRequest
from app.services.mailer import EmailConfigurationError, send_email_message

router = APIRouter(prefix="/api", tags=["contact"])


def _send_message(payload: ContactRequest) -> None:
    settings = get_settings()
    recipient = settings.contact_to_email or settings.smtp_username
    if not recipient:
        raise HTTPException(status_code=503, detail="Contact email is not configured yet.")

    message = EmailMessage()
    message["Subject"] = "New message from the SurakshaAI website"
    message["To"] = recipient
    message["Reply-To"] = str(payload.email)
    message.set_content(
        f"Name: {payload.name}\n"
        f"Email: {payload.email}\n\n"
        f"{payload.message}"
    )

    send_email_message(message)


@router.post("/contact", status_code=202)
async def send_contact_message(payload: ContactRequest):
    # Quietly accept bot submissions without sending email.
    if payload.website.strip():
        return {"message": "Your message has been sent."}

    try:
        await asyncio.to_thread(_send_message, payload)
    except HTTPException:
        raise
    except EmailConfigurationError:
        raise HTTPException(status_code=503, detail="Contact email is not configured yet.") from None
    except (OSError, smtplib.SMTPException):
        raise HTTPException(status_code=502, detail="We could not send your message. Please try again later.") from None
    return {"message": "Your message has been sent."}
