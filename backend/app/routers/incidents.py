import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Action, Incident
from app.schemas import ActionCreate, ActionRead, ActionUpdate, IncidentCreate, IncidentRead, IncidentUpdate
from app.services.mailer import send_action_status_email, send_incident_assignment_email

router = APIRouter(prefix="/api", tags=["incidents"])
logger = logging.getLogger(__name__)


@router.get("/incidents", response_model=list[IncidentRead])
def list_incidents(db: Session = Depends(get_db)):
    return db.query(Incident).order_by(Incident.created_at.desc()).all()


@router.post("/incidents", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate, response: Response, db: Session = Depends(get_db)):
    action_titles = payload.action_items
    incident = Incident(**payload.model_dump(exclude={"action_items"}))
    db.add(incident)
    db.flush()
    for title in action_titles:
        db.add(Action(incident_id=incident.id, title=title, owner=incident.assignee_name or "Unassigned"))
    db.commit()
    db.refresh(incident)
    try:
        send_incident_assignment_email(
            incident_id=incident.id,
            title=incident.title,
            description=incident.description,
            location=incident.location,
            severity=incident.severity,
            assignee_name=incident.assignee_name or "Site assignee",
            assignee_email=incident.assignee_email or "",
            action_items=[
                {"title": action.title, "owner": action.owner, "status": action.status, "due_date": action.due_date}
                for action in incident.actions
            ],
        )
        response.headers["X-Assignment-Email"] = "sent"
    except Exception:
        logger.exception("Assignment email failed for incident_id=%s", incident.id)
        response.headers["X-Assignment-Email"] = "failed"
    return incident


@router.patch("/incidents/{incident_id}", response_model=IncidentRead)
def update_incident(incident_id: int, payload: IncidentUpdate, db: Session = Depends(get_db)):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(incident, key, value)
    db.commit()
    db.refresh(incident)
    return incident


@router.post("/incidents/{incident_id}/actions", response_model=ActionRead, status_code=status.HTTP_201_CREATED)
def create_action(incident_id: int, payload: ActionCreate, db: Session = Depends(get_db)):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    action_data = payload.model_dump()
    # Follow-up actions inherit the incident assignee unless an owner was
    # explicitly selected in the action form.
    if action_data["owner"] == "Unassigned" and incident.assignee_name:
        action_data["owner"] = incident.assignee_name
    action = Action(incident_id=incident_id, **action_data)
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


@router.patch("/actions/{action_id}", response_model=ActionRead)
def update_action(action_id: int, payload: ActionUpdate, response: Response, db: Session = Depends(get_db)):
    action = db.get(Action, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    incident = action.incident
    previous_status = action.status
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(action, key, value)
    db.commit()
    db.refresh(action)
    if "status" in updates and action.status != previous_status:
        if incident.assignee_email:
            try:
                send_action_status_email(
                    incident_id=incident.id,
                    incident_title=incident.title,
                    action_title=action.title,
                    old_status=previous_status,
                    new_status=action.status,
                    assignee_name=incident.assignee_name or "Site assignee",
                    assignee_email=incident.assignee_email,
                )
                response.headers["X-Action-Email"] = "sent"
            except Exception:
                logger.exception("Action status email failed for action_id=%s", action.id)
                response.headers["X-Action-Email"] = "failed"
        else:
            response.headers["X-Action-Email"] = "skipped"
    return action
