from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import re
from dotenv import load_dotenv

from sqlalchemy import text
from database import engine, Base
import models  # noqa: F401 — ensures models are registered before create_all
from routers import auth, patients, medications, logs, summary, onboarding, saved_summaries, social_contacts, assessments, clinicians, clinician_timeline

load_dotenv()

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

# Safe column migrations — add new columns to existing tables without data loss
_MIGRATIONS = [
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS episode JSON",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS vitals JSON",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS photo TEXT",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS water_intake_oz FLOAT",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS activities JSON",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS medication_side_effects JSON",
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS dashboard_config JSON",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_config JSON",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS socialization JSONB",
    "ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS therapies JSONB",
    "ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS clinicians JSONB",
    "ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS log_type VARCHAR DEFAULT 'detailed'",
    "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'clinician'",
    "ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS last_appointment_date DATE",
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE",
]

_SEED_DEFAULT_CONTACTS = """
INSERT INTO social_contacts (user_id, name, created_at)
SELECT u.id, c.name, NOW()
FROM users u
CROSS JOIN (VALUES ('Family'), ('Friend'), ('Therapist / Provider')) AS c(name)
WHERE NOT EXISTS (
    SELECT 1 FROM social_contacts sc
    WHERE sc.user_id = u.id AND sc.name = c.name
)
"""

_BACKFILL_CONTACTS_CREATED_AT = """
UPDATE social_contacts SET created_at = NOW() WHERE created_at IS NULL
"""

# These patch *existing* Postgres deployments; a fresh database gets everything
# it needs from create_all above. The syntax is Postgres-specific throughout
# (ADD COLUMN IF NOT EXISTS, ALTER TYPE, NOW(), VALUES ... AS), so on any other
# dialect they are both unnecessary and unparseable — skip them rather than
# forcing local dev to stand up Postgres just to boot.
if engine.dialect.name == "postgresql":
    with engine.connect() as conn:
        for stmt in _MIGRATIONS:
            # Individually guarded: one unapplicable migration (a table that
            # doesn't exist yet on a fresh deploy, an enum value already added
            # outside this list) must not take down startup for all the others.
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as exc:  # noqa: BLE001 — best-effort by design
                conn.rollback()
                print(f"[migration skipped] {stmt} -> {type(exc).__name__}: {exc}")
        conn.execute(text(_SEED_DEFAULT_CONTACTS))
        conn.execute(text(_BACKFILL_CONTACTS_CREATED_AT))
        conn.commit()
else:
    print(f"[migrations] dialect is {engine.dialect.name!r}, not postgresql — "
          "skipping Postgres-only column migrations (create_all covers a fresh DB)")

app = FastAPI(title="TrueFit Meds API", version="1.0.0")

# ALLOWED_ORIGINS: comma-separated explicit origins
_origins_env = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,https://truefit-meds.vercel.app,capacitor://localhost",
)
allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

# Also allow all Vercel preview deployments via regex
_origin_regex = os.getenv(
    "ALLOWED_ORIGINS_REGEX",
    r"https://.*\.vercel\.app",
)

# Compile regex for use in exception handler
_origin_pattern = re.compile(_origin_regex) if _origin_regex else None


def _is_allowed_origin(origin: str | None) -> bool:
    """Check if origin is allowed."""
    if not origin:
        return False
    if origin in allowed_origins:
        return True
    if _origin_pattern and _origin_pattern.match(origin):
        return True
    return False


# Custom exception handlers to ensure CORS headers are included on ALL error responses
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    origin = request.headers.get("origin")
    headers = {}
    if _is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin")
    headers = {}
    if _is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(patients.router, prefix="/patients", tags=["patients"])
app.include_router(medications.router, prefix="/medications", tags=["medications"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])
app.include_router(summary.router, prefix="/summary", tags=["summary"])
app.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
app.include_router(saved_summaries.router, prefix="/summaries", tags=["summaries"])
app.include_router(social_contacts.router, prefix="/api/social-contacts", tags=["social-contacts"])
app.include_router(assessments.router, prefix="/assessments", tags=["assessments"])
app.include_router(clinicians.router, prefix="/clinicians", tags=["clinicians"])
app.include_router(clinician_timeline.router, prefix="/clinician", tags=["clinician-timeline"])


@app.get("/")
def root():
    return {"message": "TrueFit Meds API is running"}
