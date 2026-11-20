import smtplib
import ssl
from email.message import EmailMessage

from app.config import get_settings


class EmailConfigurationError(RuntimeError):
    pass


def send_email_message(message: EmailMessage) -> None:
    settings = get_settings()
    sender = settings.smtp_from_email or settings.smtp_username
    if not all((settings.smtp_host, settings.smtp_username, settings.smtp_password, sender)):
        raise EmailConfigurationError("SMTP mailbox settings are incomplete")

    message["From"] = sender
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=15) as server:
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


def send_incident_assignment_email(
    *,
    incident_id: int,
    title: str,
    description: str,
    location: str,
    severity: str,
    assignee_name: str,
    assignee_email: str,
    action_items: list[dict[str, str | None]],
) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["Subject"] = "A new safety incident has been assigned to you"
    message["To"] = assignee_email
    if action_items:
        action_lines = []
        for item in action_items:
            status = (item.get("status") or "pending").replace("_", " ").capitalize()
            due_date = f"; Due: {item['due_date']}" if item.get("due_date") else ""
            action_lines.append(
                f"- {item['title']} (Owner: {item.get('owner') or 'Unassigned'}; "
                f"Status: {status}{due_date})"
            )
        actions_text = "\n".join(action_lines)
    else:
        actions_text = "No follow-up actions were attached when this incident was logged."
    message.set_content(
        f"Hello {assignee_name},\n\n"
        "A new construction-site safety incident has been assigned to you.\n\n"
        f"Incident: #{incident_id} — {title}\n"
        f"Severity: {severity.capitalize()}\n"
        f"Location: {location}\n\n"
        f"Details:\n{description or 'No additional details were provided.'}\n\n"
        f"Action items:\n{actions_text}\n\n"
        f"Review incidents: {settings.app_url.rstrip('/')}/#incidents\n"
    )
    send_email_message(message)


def send_action_status_email(
    *,
    incident_id: int,
    incident_title: str,
    action_title: str,
    old_status: str,
    new_status: str,
    assignee_name: str,
    assignee_email: str,
) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["Subject"] = f"Action status updated for incident #{incident_id}"
    message["To"] = assignee_email
    message.set_content(
        f"Hello {assignee_name},\n\n"
        "A follow-up action assigned to you has changed status.\n\n"
        f"Incident: #{incident_id} — {incident_title}\n"
        f"Action: {action_title}\n"
        f"Status: {old_status.replace('_', ' ').capitalize()} → "
        f"{new_status.replace('_', ' ').capitalize()}\n\n"
        f"Review incidents: {settings.app_url.rstrip('/')}/#incidents\n"
    )
    send_email_message(message)
