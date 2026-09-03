import logging
import os
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta

import resend
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from database import get_db
import models
import schemas
from auth import get_password_hash, verify_password, create_access_token, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

resend.api_key = os.getenv("RESEND_API_KEY", "")

# Rate limiting: max 3 reset attempts per email per 15 minutes (in-memory, resets on restart)
_reset_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 900
_RATE_LIMIT_MAX = 3


def _rate_limit_ok(email: str) -> bool:
    now = time.time()
    cutoff = now - _RATE_LIMIT_WINDOW
    recent = [t for t in _reset_attempts[email] if t > cutoff]
    _reset_attempts[email] = recent
    if len(recent) >= _RATE_LIMIT_MAX:
        return False
    recent.append(now)
    return True


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=86400,
    )


@router.post("/register", response_model=schemas.AuthResponse)
def register(user_data: schemas.UserCreate, response: Response, db: Session = Depends(get_db)):
    # Clinicians may self-register. Registering grants no access to anything:
    # a clinician sees only patients whose caregiver has explicitly given them a
    # share code. There is no clinician-initiated path to a patient, so an
    # unsolicited signup is inert by construction.

    email = user_data.email.strip().lower()
    existing = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=email,
        password_hash=get_password_hash(user_data.password),
        name=user_data.name,
        role=user_data.role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email})
    _set_auth_cookie(response, token)
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.post("/login", response_model=schemas.AuthResponse)
def login(credentials: schemas.UserLogin, response: Response, db: Session = Depends(get_db)):
    email = credentials.email.strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token({"sub": user.email})
    _set_auth_cookie(response, token)
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token", httponly=True, secure=True, samesite="none")
    return {"message": "Logged out"}


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
def forgot_password(body: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()

    # Rate limit silently — always return 200 to avoid leaking info
    if not _rate_limit_ok(email):
        return {"message": "If that email is registered, a reset link has been sent."}

    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if not user:
        return {"message": "If that email is registered, a reset link has been sent."}

    # Invalidate any existing unused tokens for this user
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used == False,  # noqa: E712
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    reset_token = models.PasswordResetToken(
        token=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(reset_token)
    db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend_url}/reset-password/?token={token}"
    from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    try:
        resend.Emails.send({
            "from": from_email,
            "to": user.email,
            "subject": "Reset your Advocate password",
            "html": f"""
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <h2 style="color: #2d4f38;">Reset your password</h2>
              <p style="color: #1a2420;">Hi {user.name},</p>
              <p style="color: #6b7d74;">We received a request to reset your Advocate password. Click the button below — this link expires in 1 hour.</p>
              <a href="{reset_link}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#4a7c59;color:#fff;border-radius:50px;text-decoration:none;font-weight:600;">
                Reset password
              </a>
              <p style="color: #6b7d74; font-size: 0.85rem;">If you didn't request this, you can safely ignore this email.</p>
            </div>
            """,
        })
    except Exception:
        logger.error("Failed to send password reset email to %s", user.email, exc_info=True)

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == body.token,
        models.PasswordResetToken.used == False,  # noqa: E712
    ).first()

    if not reset_token or reset_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    user = db.query(models.User).filter(models.User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    user.password_hash = get_password_hash(body.new_password)
    reset_token.used = True
    db.commit()

    return {"message": "Password updated successfully."}


@router.patch("/config", response_model=schemas.UserResponse)
def update_config(
    patch: schemas.UserConfigPatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = dict(current_user.user_config or {})
    existing.update(patch.updates)
    current_user.user_config = existing
    flag_modified(current_user, "user_config")
    db.commit()
    db.refresh(current_user)
    return current_user
