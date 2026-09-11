"""Demo-only seed for the clinician timeline build (Radial pilot conversation).

Marcus R., Jul 12 - Sep 10 2026, 53 of 61 days logged. Every value below
comes verbatim from the source dataset this script was built from — nothing
here is invented. See the module docstring on models.Patient.is_demo for why
this can exist without triggering a BAA: it is fake data, gated by is_demo,
and this script is the only thing that ever sets that flag true.

Rebased from an earlier Dec 2025/Jan 2026 version to a rolling window ending
"yesterday" relative to whenever this is next re-run before a demo — Sep 11
(today, as of the version this was rebased to) is deliberately NOT seeded:
that is the day a caregiver logs live during the Phase 2 demo. Do not seed
it here, and do not backfill it by any other means (in particular, never
use the caregiver app's "mark all missed days as nothing notable" button on
this account — that is what produced 30 junk rows the last time this
dataset went stale under a live demo).

Idempotent — safe to re-run. Clears and re-inserts this one patient's daily
logs and timeline events every run; never touches any other patient.

Usage:
    cd backend
    SEED_CONFIRM=1 python scripts/seed_demo_patient.py

The patient is created with a fixed, reserved ID (see MARCUS_PATIENT_ID
below) rather than letting Postgres auto-assign one: the clinician timeline's
frontend route is a true dynamic segment (app/clinician/[patientId]/page.tsx)
under output: "export", which requires generateStaticParams() to know the
ID at build time. On Postgres, the sequence is bumped past the reserved ID
immediately after insert so future ordinary patients never collide with it.
"""
import csv
import io
import os
import sys
from datetime import date, datetime
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Reserved so the frontend's generateStaticParams() can hardcode the same
# value — see app/clinician/[patientId]/page.tsx. Comfortably clear of any ID
# normal patient creation will reach for a very long time.
MARCUS_PATIENT_ID = 999999


def _guard_local_or_confirmed() -> None:
    """Same safety shape as scripts/seed_glance_demo.py: refuses to write at
    all unless SEED_CONFIRM=1, regardless of target — this script is meant to
    be run deliberately (locally, or once against a real deploy via
    `railway run`), never accidentally."""
    if not DATABASE_URL:
        print("DATABASE_URL is not set. Aborting.")
        sys.exit(1)
    parsed = urlparse(DATABASE_URL)
    print(f"Target database: host={parsed.hostname!r} db={(parsed.path or '').lstrip('/')!r}")
    if os.getenv("SEED_CONFIRM") != "1":
        print("Dry run only — SEED_CONFIRM=1 is not set. Nothing was written. "
              "Re-run with SEED_CONFIRM=1 to actually seed.")
        sys.exit(0)


_guard_local_or_confirmed()

from database import SessionLocal  # noqa: E402
import models  # noqa: E402
from auth import get_password_hash  # noqa: E402

# Phase 2: the two accounts for the live demo path (caregiver logs a real
# entry in the real app; clinician watches it land in the timeline). "mom" is
# both Marcus's DailyLog.logged_by author on most rows AND this account —
# she already IS the CSV's primary logger, so this names her real identity
# rather than bolting on a disconnected fifth account. dad/brother stay
# demo.internal placeholders: nobody needs to log in as them.
DEMO_CAREGIVER_EMAIL = "demo.caregiver@advocate.health"
DEMO_CLINICIAN_EMAIL = "demo.clinician@advocate.health"
DEMO_PASSWORD = "MarcusDemo2026!"
PATIENT_NAME = "Marcus R."
MED_CHANGE_DATE = date(2026, 8, 24)

# ── Source data, verbatim ────────────────────────────────────────────────────
#
# Rebased from an earlier Dec 2025/Jan 2026 version to Jul 12 - Sep 10 2026 —
# same story, same shape, same values, only the dates (and four in-note
# references that depend on them: the backfill note's weekdays, "next month"
# instead of a named month, the corrected weight-delta number, and the
# backstory moving to "the spring") moved. Sep 11 (today, as of this version)
# is deliberately absent — that is the day a caregiver logs live during the
# Phase 2 demo.

DAILY_CSV = """date,sleep_hours,anxiety,cigarettes,socialization,meds_taken,weight_lb,logged_by
2026-07-12,9.5,3,none,medium,true,198,mom
2026-07-13,9.5,2,none,medium,true,,mom
2026-07-14,10.0,3,none,medium,true,,mom
2026-07-15,9.5,3,low,medium,true,,mom
2026-07-16,10.0,2,low,medium,true,,mom
2026-07-17,10.0,2,low,medium,true,,dad
2026-07-19,9.5,3,low,medium,true,203,mom
2026-07-20,10.0,3,low,medium,true,,mom
2026-07-21,9.5,4,medium,medium,true,,mom
2026-07-22,9.5,3,low,medium,true,,mom
2026-07-23,10.0,5,medium,medium,true,,mom
2026-07-24,10.0,3,low,medium,true,,dad
2026-07-26,9.0,5,medium,medium,true,208,mom
2026-07-27,8.5,5,medium,medium,true,,mom
2026-07-28,8.0,6,medium,medium,false,,mom
2026-07-29,8.0,6,medium,medium,true,,mom
2026-07-30,4.5,7,high,medium,true,,mom
2026-07-31,4.0,7,high,medium,false,,dad
2026-08-01,4.0,8,high,medium,false,,brother
2026-08-02,4.0,7,high,medium,false,212,mom
2026-08-05,4.0,8,high,medium,false,,mom
2026-08-06,3.5,8,high,low,false,,mom
2026-08-08,4.0,8,high,low,false,,mom
2026-08-09,3.5,9,high,low,false,214,mom
2026-08-10,4.0,8,high,low,false,,brother
2026-08-11,4.0,8,high,low,false,,mom
2026-08-12,4.0,8,high,low,false,,mom
2026-08-13,3.5,8,high,low,false,,mom
2026-08-14,4.0,8,high,low,false,,brother
2026-08-15,3.5,8,high,low,false,,mom
2026-08-16,3.5,9,high,low,false,216,mom
2026-08-17,3.0,9,high,low,false,,mom
2026-08-18,2.0,9,high,low,false,,mom
2026-08-19,1.0,10,high,low,false,,mom
2026-08-23,14.0,5,medium,low,false,,mom
2026-08-24,11.0,5,medium,low,true,,mom
2026-08-25,10.5,5,medium,low,true,,mom
2026-08-26,10.0,5,medium,low,true,,mom
2026-08-27,8.0,5,medium,low,true,,mom
2026-08-28,8.0,5,medium,medium,true,,dad
2026-08-29,8.5,5,medium,medium,true,,mom
2026-08-30,8.0,5,medium,medium,true,217,mom
2026-08-31,7.5,5,medium,medium,true,,mom
2026-09-01,4.5,6,medium,medium,true,,mom
2026-09-02,4.5,6,medium,medium,true,,mom
2026-09-03,4.0,7,high,low,true,,mom
2026-09-04,7.0,5,medium,medium,true,,brother
2026-09-05,7.5,5,medium,medium,true,,mom
2026-09-06,7.0,5,medium,medium,true,215,mom
2026-09-07,4.5,5,medium,medium,true,,mom
2026-09-08,4.5,5,medium,medium,true,,mom
2026-09-09,7.0,5,medium,medium,true,,mom
2026-09-10,7.5,5,medium,medium,true,,mom
"""

NOTES_CSV = '''date,author,note
2026-07-12,mom,"First night home. Slept in his own bed. Took his meds without being asked."
2026-07-15,mom,"He asked when he can go back to school. I said we would talk to the doctor. He didn't push it. Saw him smoking on the back steps, first time since before the hospital."
2026-07-17,dad,"Good day. Watched the game with his brother. Ate a lot. Two or three cigarettes."
2026-07-19,mom,"Up five pounds in a week. He got on the scale and didn't say anything."
2026-07-21,mom,"He's hungry constantly. Eating at 11pm. Out on the steps more today, maybe six or seven."
2026-07-23,mom,"Wouldn't come to his cousin's thing. Said he didn't want anyone to see him. Smoked through most of the afternoon."
2026-07-26,mom,"Ten pounds. He had to buy new pants today and he was quiet the whole ride home."
2026-07-28,mom,"He told me the pills are why he's getting fat and he's done. I told him to call Dr. Ellison. He said the appointment isn't until next month and he's not waiting."
2026-07-29,mom,"Took them today. I asked and he said fine."
2026-07-30,mom,"He asked me to buy him a carton. I said no. He got a ride from someone."
2026-07-31,dad,"Said he took them. I didn't see it. Marking no because I don't know."
2026-08-01,brother,"He was up when I got home at 1. Said he couldn't sleep. There were probably fifteen butts in the coffee can on the steps. He didn't take anything today, I checked the bottle count."
2026-08-02,mom,"Still gaining even though he stopped. He said it's not working, so what's the point."
2026-08-05,mom,"He's pacing. Not talking much. Different than last week. Goes out to smoke every twenty minutes."
2026-08-06,mom,"Up at 2am. I found him in the kitchen just standing there with the light off. He said he was getting water. The whole coat smells like smoke now."
2026-08-08,mom,"Sixteen pounds since he came home. He won't get on the scale, I had to ask three times."
2026-08-09,mom,"He's talking faster. I've seen this before. He went through most of a pack today."
2026-08-10,brother,"He didn't go out. I stayed in with him. He's fine but he's not fine, if that makes sense. I don't want to overreact but I'm writing it down."
2026-08-11,mom,"He didn't come down for anything today. I left a plate outside the door."
2026-08-13,mom,"Third day he hasn't left the house. Not the yard, the house. He's smoking in his room with the window open and I'm not going to fight him about it right now."
2026-08-14,brother,"I asked if he wanted to get food and he said no. He hasn't said no to that before. Told him I'd be around if he wanted to talk. He didn't."
2026-08-15,mom,"Still going up even though he hasn't taken anything in over two weeks. He said that proves the doctor was lying."
2026-08-16,mom,"He hasn't left the house in six days. Nine if you count going outside as leaving."
2026-08-18,mom,"He was up all night. I heard him moving around at 3 and again at 5. When I came down he was already talking, fast, about school and about a professor he had for one week back in the spring."
2026-08-19,mom,"Something is wrong. He thinks the neighbor's car is there for him. He asked me twice if I told anyone he was home. He hasn't slept."
2026-08-23,mom,"I'm writing this down now because I couldn't then. Wednesday the 19th he stopped sleeping entirely. Thursday he was up the whole night and most of Friday, talking the whole time, going from one thing to the next without finishing. He was convinced someone had been in the house. Friday night his dad wanted to call 911. I said no because the last time they took him it was three months and he came home a different person. I called the crisis line instead and they talked me through it and stayed on with me for an hour. Saturday he slept fourteen hours. Today he's flat. Not scared anymore, just gone. I did not log those days. I want that on the record. I wasn't going to be on my phone."
2026-08-24,mom,"Appointment. Dr. Ellison went through the whole thing on his screen before he even asked us anything. He said the weight gain was real and he should have heard about it in July. He's stopping the olanzapine and starting him on something else. Marcus agreed to it. I think he agreed because someone finally said the weight was the drug's fault and not his."
2026-08-26,mom,"Third day taking it. He asks me every morning if it's going to make him gain more."
2026-08-28,dad,"He came to dinner. Sat there for maybe twenty minutes but he came."
2026-09-01,mom,"Sleeping worse again. I don't know if that's the new one or if it's just him."
2026-09-03,mom,"Bad day. Wouldn't come out of his room, back to a pack. His dad said something at breakfast about him getting a job and it went badly."
2026-09-04,brother,"Took him to get food and he actually ate. He asked about going back to school in the spring. I didn't say anything either way."
2026-09-06,mom,"Down two pounds. First time the number has gone the other way since he came home. He got on the scale on his own."
2026-09-08,mom,"Up at 4 again. He's not upset, he just isn't sleeping."
2026-09-10,mom,"Two and a half weeks on it now, no missed doses. He's better than he was. He's not what he was in January."
'''

# Cigarette band -> a representative count consistent with both
# CIGARETTE_THRESHOLDS in services/aggregation.py and the counts actually
# named in the notes above ("two or three" -> low, "six or seven" -> medium,
# "fifteen" / "most of a pack" -> high).
CIGARETTE_COUNT_BY_BAND = {"none": 0, "low": 3, "medium": 7, "high": 15}

# The Aug 23 entry is a backfill: logged on the 23rd, describing Aug 19-22.
# It renders under Aug 23 (its own `date`); the episode window is carried
# separately in `episode`, not split into four fake daily rows.
EPISODE_START = "2026-08-19"
EPISODE_END = "2026-08-22"
EPISODE_OUTCOME = "held_at_home"
EPISODE_LOGGED_AT = "2026-08-23"
EPISODE_DESCRIPTION = (
    "Stopped sleeping starting the night of the 19th. Up through the night and most of "
    "the next day, talking continuously, convinced someone had been in the house. "
    "Family called the crisis line rather than 911. Logging stopped during this window."
)


def _get_or_create_author(db, name: str, email: str, password: str = None, role=models.UserRole.caregiver) -> models.User:
    """password=None gets a random, unusable one — fine for dad/brother, who
    exist only as DailyLog.logged_by identities, never as a login."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        # Idempotent re-run: keep the known password current in case a prior
        # run predates DEMO_PASSWORD or it changed since.
        if password:
            user.password_hash = get_password_hash(password)
            user.role = role
        return user
    user = models.User(
        email=email,
        password_hash=get_password_hash(password or os.urandom(16).hex()),
        name=name,
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def _reserve_patient_id(db) -> None:
    """Bumps the Postgres sequence past MARCUS_PATIENT_ID after an explicit-ID
    insert, so the next ordinary `INSERT ... RETURNING id` never collides with
    it. No-op on SQLite (local dev), which doesn't use a separate sequence
    object — an explicit PK insert there already just works."""
    if db.bind.dialect.name != "postgresql":
        return
    from sqlalchemy import text
    db.execute(text(
        "SELECT setval(pg_get_serial_sequence('patients', 'id'), "
        "GREATEST((SELECT MAX(id) FROM patients), :reserved))"
    ), {"reserved": MARCUS_PATIENT_ID})


def main() -> None:
    db = SessionLocal()
    try:
        mom = _get_or_create_author(db, "mom", DEMO_CAREGIVER_EMAIL, password=DEMO_PASSWORD, role=models.UserRole.caregiver)
        dad = _get_or_create_author(db, "dad", "marcus.dad@demo.internal")
        brother = _get_or_create_author(db, "brother", "marcus.brother@demo.internal")
        author_by_name = {"mom": mom, "dad": dad, "brother": brother}

        # The clinician's association to Marcus is hardcoded by construction,
        # not a linking table: this is the only clinician account this script
        # creates, and is_demo=True on exactly one patient (Marcus) is what
        # the timeline endpoint actually gates on (see models.Patient.is_demo
        # and routers/clinician_timeline.py) — no ClinicianPatientLink row is
        # created or needed. Any clinician-role account can see any is_demo
        # patient; access scoping beyond that filter is explicitly out of
        # scope for both phases.
        clinician = _get_or_create_author(db, "Demo Clinician", DEMO_CLINICIAN_EMAIL, password=DEMO_PASSWORD, role=models.UserRole.clinician)
        db.commit()

        patient = db.query(models.Patient).filter(models.Patient.id == MARCUS_PATIENT_ID).first()
        if patient:
            deleted = db.query(models.DailyLog).filter(models.DailyLog.patient_id == patient.id).delete()
            db.query(models.TimelineEvent).filter(models.TimelineEvent.patient_id == patient.id).delete()
            print(f"Reusing existing demo patient id={patient.id}; cleared {deleted} prior daily logs.")
        else:
            patient = models.Patient(
                id=MARCUS_PATIENT_ID,
                name=PATIENT_NAME,
                date_of_birth=date(2003, 6, 14),
                diagnosis="Schizoaffective disorder",
                caregiver_id=mom.id,
                is_demo=True,
            )
            db.add(patient)
            db.flush()
            _reserve_patient_id(db)
            print(f"Created demo patient id={patient.id}.")

        if not patient.is_demo:
            patient.is_demo = True
        if patient.caregiver_id != mom.id:
            patient.caregiver_id = mom.id
        db.commit()

        old_med = (
            db.query(models.Medication)
            .filter(models.Medication.patient_id == patient.id, models.Medication.name == "Olanzapine")
            .first()
        )
        if not old_med:
            old_med = models.Medication(
                patient_id=patient.id, name="Olanzapine", dose="15mg",
                frequency="daily", time_of_day="evening", active=False,
            )
            db.add(old_med)
            db.flush()

        new_med = (
            db.query(models.Medication)
            .filter(models.Medication.patient_id == patient.id, models.Medication.name == "Aripiprazole")
            .first()
        )
        if not new_med:
            new_med = models.Medication(
                patient_id=patient.id, name="Aripiprazole", dose="10mg",
                frequency="daily", time_of_day="evening", active=True,
            )
            db.add(new_med)
            db.flush()
        db.commit()

        notes_by_date = {}
        for row in csv.DictReader(io.StringIO(NOTES_CSV)):
            notes_by_date[row["date"]] = (row["author"], row["note"])

        daily_rows = list(csv.DictReader(io.StringIO(DAILY_CSV)))
        seeded = 0
        for row in daily_rows:
            log_date = date.fromisoformat(row["date"])
            author = author_by_name[row["logged_by"]]
            taken = row["meds_taken"] == "true"
            med_id = old_med.id if log_date < MED_CHANGE_DATE else new_med.id

            weight = row["weight_lb"].strip()
            vitals = {"cigarettes": str(CIGARETTE_COUNT_BY_BAND[row["cigarettes"]])}
            if weight:
                vitals["weight_lb"] = float(weight)

            socialization = (
                {"left_house": True, "had_contact": False, "contact_ids": [], "quality": None, "initiated_by": None}
                if row["socialization"] == "medium" else
                {"left_house": False, "had_contact": False, "contact_ids": [], "quality": None, "initiated_by": None}
            )

            episode = None
            note_text = None
            if row["date"] in notes_by_date:
                note_author, note_text = notes_by_date[row["date"]]
                assert author.name == note_author, f"author mismatch on {row['date']}"

            if row["date"] == EPISODE_LOGGED_AT:
                episode = {
                    "occurred": True,
                    "time": None,
                    "description": EPISODE_DESCRIPTION,
                    "outcome": EPISODE_OUTCOME,
                    "start": EPISODE_START,
                    "end": EPISODE_END,
                    "logged_at": EPISODE_LOGGED_AT,
                }

            db.add(models.DailyLog(
                patient_id=patient.id,
                logged_by=author.id,
                date=log_date,
                medications_taken=[{"medication_id": med_id, "taken": taken, "time_taken": "20:00" if taken else None}],
                symptoms=[{"name": "Anxiety", "severity": int(row["anxiety"])}],
                sleep_hours=float(row["sleep_hours"]),
                vitals=vitals,
                socialization=socialization,
                episode=episode,
                notes=note_text,
                log_type="detailed",
            ))
            seeded += 1

        db.add(models.TimelineEvent(
            patient_id=patient.id, type="med_change", date=MED_CHANGE_DATE, label="Med change",
        ))

        # Cache row starts empty/pending — the first real generation happens
        # via the same on-write hook a live log save uses (see
        # routers/logs.py), triggered explicitly below rather than waiting
        # for a request.
        cache = db.query(models.TimelineCache).filter(models.TimelineCache.patient_id == patient.id).first()
        if not cache:
            db.add(models.TimelineCache(patient_id=patient.id, content={}, pending=True))

        db.commit()
        print(f"Seeded {seeded} daily logs for {PATIENT_NAME} (id={patient.id}), spanning "
              f"{daily_rows[0]['date']} to {daily_rows[-1]['date']}.")
        print("Triggering initial AI generation (headline + domain summaries)...")

        print("\nDemo logins (password is the same for both):")
        print(f"  caregiver: {DEMO_CAREGIVER_EMAIL}  -> existing caregiver app, Marcus already loaded")
        print(f"  clinician: {DEMO_CLINICIAN_EMAIL}  -> /clinician/{MARCUS_PATIENT_ID}/ (Marcus's timeline)")
        print(f"  password:  {DEMO_PASSWORD}")
    finally:
        db.close()

    # Runs after the session above closes — regenerate_timeline_cache opens
    # its own session, same as it does from the BackgroundTasks hook.
    from services.timeline_ai import regenerate_timeline_cache
    regenerate_timeline_cache(MARCUS_PATIENT_ID)
    print("Done.")


if __name__ == "__main__":
    main()
