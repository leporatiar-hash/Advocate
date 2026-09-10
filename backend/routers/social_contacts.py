from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from typing import List

from database import get_db
import models
import schemas
from auth import get_current_user, require_not_clinician

router = APIRouter()

MAX_CONTACTS = 20


@router.get("/", response_model=List[schemas.SocialContactResponse])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.SocialContact)
        .filter(models.SocialContact.user_id == current_user.id)
        .order_by(models.SocialContact.name)
        .all()
    )


@router.post("/", response_model=schemas.SocialContactResponse, status_code=201)
def create_contact(
    data: schemas.SocialContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_not_clinician),
):
    count = (
        db.query(models.SocialContact)
        .filter(models.SocialContact.user_id == current_user.id)
        .count()
    )
    if count >= MAX_CONTACTS:
        raise HTTPException(status_code=400, detail="Contact limit reached")

    name = data.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status_code=400, detail="Name must be between 1 and 100 characters")

    contact = models.SocialContact(user_id=current_user.id, name=name)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_not_clinician),
):
    contact = (
        db.query(models.SocialContact)
        .filter(
            models.SocialContact.id == contact_id,
            models.SocialContact.user_id == current_user.id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Remove deleted contact_id from any existing daily_log socialization entries
    patient_ids = [
        p.id
        for p in db.query(models.Patient)
        .filter(models.Patient.caregiver_id == current_user.id)
        .all()
    ]
    if patient_ids:
        logs = (
            db.query(models.DailyLog)
            .filter(
                models.DailyLog.patient_id.in_(patient_ids),
                models.DailyLog.socialization.isnot(None),
            )
            .all()
        )
        for log in logs:
            soc = log.socialization
            if not soc:
                continue
            ids = soc.get("contact_ids") or []
            if contact_id in ids:
                log.socialization = {
                    **soc,
                    "contact_ids": [cid for cid in ids if cid != contact_id],
                }
                flag_modified(log, "socialization")

    db.delete(contact)
    db.commit()
    return None
