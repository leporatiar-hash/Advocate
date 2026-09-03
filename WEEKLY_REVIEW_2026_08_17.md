# Weekly Project Review — August 17, 2026 (Monday Morning)

*This covers the two weeks since the August 3 review. Advocate: 7 new commits (Aug 8–16), all building a full clinician portal for the Radial pilot. ClassMate: 2 new commits (Aug 11, Aug 17), both small user-facing fixes.*

## Executive Summary

- **truefit-meds (Advocate)**: The biggest single push in this review series — 7 commits, 37 files, ~3,977 insertions, all building a read-only clinician portal (glance layer, trajectory strip, ranked flags, notes-driven Clinical Summary, "What Went Well" surfacing) explicitly tied to "the Radial pilot." Authorization is done right (`ClinicianPatientLink`-scoped lookups in every route). But the four standing blockers — monetization, auth refresh, cascade deletes, and the correction-endpoint audit trail — are all still untouched, and the correction-endpoint gap is now more urgent given there's a real clinician audience about to look at this data.
- **syllabusync (ClassMate)**: Quiet two weeks — one UX tweak (Save All to Calendar) and one real bug fix today (DOCX table extraction, which was silently dropping the most common syllabus layout). The two confirmed revenue gaps (Canvas/course-limit enforcement) and the DB indexes/cascades debt are unchanged and now further overdue.
- **Key shift since Aug 3**: Advocate has visibly moved from "internal hardening" to "pilot-facing product" — this is the first review where a named external stakeholder (Radial) has a concrete built feature to look at. That raises the stakes on the still-open audit-trail and cascade-delete gaps. ClassMate stayed in maintenance mode.

---

## truefit-meds (Advocate)

### Status Summary

Seven commits since Aug 3 (`6eea1b5` → `f4becea`, Aug 8–16), all clinician-portal work for the Radial pilot: a new `/clinician` route tree, 13 new components, a 604-line aggregation service, a 385-line synthesis service, 357 new lines in `backend/routers/clinicians.py`, and three new demo/seed scripts. This is a real, scoped feature build, not refactoring — and the patient-data authorization is done correctly throughout.

### 🔥 Top Priorities

- **The medication-correction endpoint still has no audit trail — now two review cycles confirmed, and the stakes just went up.** `backend/routers/logs.py:288-332` (`PATCH /logs/{patient_id}/date/{date}/medication-taken`) still flips `taken: True` and commits with no `updated_at` bump or `corrected_by` field. With a clinician portal now surfacing this same log history (`GlanceLayer.tsx`, `TrajectoryStrip.tsx`, `RecentNotes.tsx`), a clinician has even less ability to tell a caregiver-corrected entry from an original one. This was cheap to fix two weeks ago; it's still cheap now.
- **The monetization decision is now 18 weeks old with zero code movement.** Fresh grep of `backend/models.py` still shows no `tier`, `stripe_customer_id`, or `subscription_*` columns, and there's still no `MONETIZATION.md`. The oldest open item across both projects, unchanged since Apr 13.
- **Auth token expiry is still 7 days with no refresh path.** `backend/auth.py:18` (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 10080) is unchanged, and there's no refresh endpoint in `backend/routers/auth.py`. Fifth review running on this gap.

### 💡 Opportunities

- **The clinician portal is the B2B pitch asset the last several reviews said was missing.** Previous reviews flagged that the assessments module (PHQ-9, CSI, Lawton IADL) was "the strongest B2B pitch asset in the repo" with no outreach to back it. That's no longer just an asset sitting idle — there's now a working clinician-facing product built around a named pilot (Radial). Worth using this review cycle to confirm what stage that pilot conversation is actually at.
- The scope and care in `backend/routers/clinicians.py` (every route re-verifies the clinician-patient link before returning data) is exactly the kind of groundwork that makes a HIPAA-adjacent pilot conversation credible — worth highlighting to Radial directly rather than just shipping quietly.

### ⚠️ Technical Concerns

- No refresh-token mechanism (see above).
- No usage/cost tracking on the OpenAI summary endpoint — still no `tokens_used` or `created_by_user_id` fields; the new `services/synthesis.py` (385 lines) adds more OpenAI-backed generation without addressing this.
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` — only `SocialContact.user_id` has it (`backend/models.py:147`). Unchanged for five-plus review cycles.
- Medication-correction endpoint's missing audit trail (see above) — the one item in this review that got more urgent rather than staying flat.

---

## syllabusync (ClassMate)

### Status Summary

Two commits since Aug 3: a UX addition (Save All to Calendar button on the Deadline Timeline card, Aug 11) and a real fix today (Aug 17) — DOCX syllabus extraction only read `doc.paragraphs`, silently dropping any text inside Word tables, which is the most common way a syllabus lays out its weekly schedule. Now walks the document body in order, matching how the PDF path already handles tables; also maps opaque browser-level upload failures to actionable error messages.

### 🔥 Top Priorities

- **Database indexes and cascade deletes are still missing — now six review cycles running (May 25, Jul 17, Jul 20, Jul 27, Aug 3, now Aug 17).** Fresh grep of `Backend/main.py` for `ondelete=` and `Index(` still returns zero matches. This remains the single most-overdue item across either project's backlog.
- **Canvas/iCal sync and the "3 free courses" cap are still advertised as Pro-gated with zero enforcement.** Confirmed again via the standing `PRICING_AUDIT.md` (dated Jul 15, still accurate): `connect_canvas` has no tier check, and `/me/subscription` still hardcodes `courses_max: None` for every tier (`main.py:2782`, comment: "Courses are unlimited on all tiers"). This is real, quantifiable revenue leakage against what `/upgrade` and the FAQ promise.
- **`plan.md` (the AI chat tab plan, dated Feb 23) is still sitting in the repo root, fully implemented.** Flagged for archiving three reviews ago now. Low-effort cleanup.

### 💡 Opportunities

- Today's DOCX table-extraction fix directly protects a top-of-funnel step: if a syllabus upload silently drops the weekly schedule, the deadline-extraction feature that drives the whole product looks broken to a brand-new user on their very first upload. Worth spot-checking a few real DOCX syllabi that came in before this fix to see if anyone hit it.
- `SCALE_CHECKLIST.md` (dated Feb 4) is now badly stale — the `user_id = "default"/"legacy"` data-integrity issue it flags as 🔴 no longer appears anywhere in `Backend/main.py`, and the missing onboarding→profile endpoints it flagged (`/me/profile`, `/me/complete-onboarding`) now exist. Worth either archiving this file or replacing it with a fresh snapshot — as written it will mislead anyone who reads it as current state.
- The chat-entitlements inconsistency flagged in earlier reviews (`list_chat_conversations` 403-blocking free users while `create_chat_conversation` allowed them) is confirmed fixed — the docstring and behavior are now consistent, free users get their weekly cap and can see their conversation list. Good closed loop, no action needed.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — six-review-cycle-old debt, unchanged.
- Canvas/iCal/course-limit enforcement gap (see above) — still contradicts paid-tier marketing copy, now documented precisely in `PRICING_AUDIT.md` for over a month with no follow-up commit.
- `[DEBUG]` print statements in file-extraction code are growing rather than shrinking — the Aug 17 DOCX fix added two more (`main.py:1089-1090`) alongside the three already flagged in the PDF path and in `SCALE_CHECKLIST.md` item 8.1. Small, but worth a single cleanup pass rather than letting it accumulate further.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Aug 3 | 7 | 2 |
| Last commit | Aug 16 | Aug 17 (today) |
| Review-cycle-old blockers still open | Monetization (18 wks), auth refresh (5 cycles), cascade deletes, correction-endpoint audit trail (now higher stakes) | DB indexes/cascades (6 cycles), Canvas/course-limit enforcement (5+ weeks documented, unaddressed) |
| This week's movement | Full clinician portal v1 shipped for a named pilot (Radial) | One UX tweak, one real upload-reliability fix |
| Resolved since last review | — | Chat-entitlements inconsistency (confirmed fixed, was flagged in earlier reviews) |

**Which has stronger market potential right now**: Advocate, decisively this cycle. Shipping a full clinician-facing portal tied to a named pilot is the most concrete business signal in this review series to date — it's the difference between "has a good B2B asset" and "has a live pilot conversation with a built product behind it." ClassMate had a normal maintenance week; nothing changed its trajectory in either direction.

**Resource allocation**: Given the Radial pilot is now real enough to have shipped code, the medication-correction audit trail stops being a nice-to-have and becomes pre-pilot due diligence — a clinician or auditor looking at corrected entries with no trail is a credibility risk in exactly the context where credibility matters most. That's the single highest-leverage move available right now. Second: ClassMate's DB indexes/cascades, six cycles overdue and still a half-day fix. Third: the monetization decision on Advocate — 18 weeks in, the cost of not deciding now clearly exceeds the cost of either directional choice.

**Timeline suggestion**: This week — add `corrected_by`/`updated_at` to the medication-taken correction endpoint before the Radial pilot goes further (small change, closes a real trust gap at the right time). On ClassMate, finally close the indexes/cascades gap or make an explicit call to deprioritize it — six silent cycles is itself a signal. Separately, either enforce the Canvas/course-limit gate or adjust the marketing copy to match reality; the mismatch has been documented and unaddressed for over a month now.

---

**Report generated**: August 17, 2026 (Monday morning review)
