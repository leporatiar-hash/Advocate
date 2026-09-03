# Weekly Project Review — August 24, 2026 (Monday Morning)

*This covers the week since the August 17 review. Advocate: 1 commit (Aug 19), adding analytics only. ClassMate: 2 commits (Aug 19), one analytics addition and one production bug fix. The quietest week in this review series to date.*

## Executive Summary

- **truefit-meds (Advocate)**: Only one commit since last week — `f2bfdf2`, adding Vercel Analytics to `app/layout.tsx`. No product code changed. All four standing blockers (medication-correction audit trail, monetization, auth refresh, cascade deletes) are unchanged, verified again by direct grep this morning.
- **syllabusync (ClassMate)**: Two commits — Vercel Analytics/Speed Insights, and a real fix (`0cbddaa`) for a 500 error on `/courses` when a course's `semester` field was null. The three standing blockers (DB indexes/cascades, Canvas/course-limit enforcement, stale `plan.md`) are unchanged.
- **Key shift since Aug 17**: Both projects effectively paused product work this week — the only non-analytics change anywhere was a one-line null-check bug fix. This is worth noting as a data point rather than a concern on its own (finals/exam weeks, pilot conversations, or other demands could explain it), but it means every open item flagged last week is now one cycle more overdue with zero new information to act on.

---

## truefit-meds (Advocate)

### Status Summary

One commit since Aug 17 (`f2bfdf2`, Aug 19): adds Vercel Analytics to the root layout. No routes, models, or components changed. Re-verified this morning: `backend/models.py` still has no `tier`/`stripe_customer_id`/`subscription_*` columns and no `ON DELETE CASCADE` beyond `SocialContact.user_id`; `backend/auth.py:18` still sets `ACCESS_TOKEN_EXPIRE_MINUTES=10080` with no refresh endpoint in `backend/routers/auth.py`; and `backend/routers/logs.py:288-332` (`correct_medication_taken`) still does a bare `db.commit()` with no `updated_at` or `corrected_by` field.

### 🔥 Top Priorities

- **Medication-correction audit trail — sixth review cycle unaddressed, and still the highest-stakes open item given the Radial pilot.** `backend/routers/logs.py:307` (`log.medications_taken = updated_entries; db.commit()`) has had zero movement since it was first flagged. Last week's review noted the stakes rose once the clinician portal shipped and started surfacing this same log history — that portal has now sat live for a week with the gap still open.
- **Monetization decision — now 19 weeks with zero code movement.** Still no `MONETIZATION.md`, still no schema fields. This is the single oldest open item across both projects.
- **Auth token refresh — sixth review running on this gap.** 7-day tokens, no refresh path.

### 💡 Opportunities

- Worth a direct check-in on where the Radial pilot conversation actually stands — last week's portal ship was described as the strongest business signal in this review series, but a full week of near-zero commits since then makes it unclear whether that's "pilot feedback being incorporated" or "stalled." Either answer changes what should happen next.
- Adding Vercel Analytics is a reasonable low-cost addition, but it's observability for traffic, not for the two things that actually matter pre-pilot: who's using the clinician portal, and whether any corrected log entries have occurred since it shipped.

### ⚠️ Technical Concerns

- No refresh-token mechanism (unchanged).
- No usage/cost tracking on the OpenAI summary/synthesis endpoints (unchanged).
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` (unchanged).
- Medication-correction endpoint's missing audit trail — now the most stakes-relevant unaddressed item in either repo (see above).

---

## syllabusync (ClassMate)

### Status Summary

Two commits since Aug 17: Vercel Analytics/Speed Insights (`56f4426`), and a genuine production fix (`0cbddaa`) — courses with a null `semester` field were causing a 500 on `/courses` in both the list and detail views; now handled as nullable end-to-end (backend response model, `CoursesClient.tsx`, `[id]/page.tsx`). Small, correct, and the kind of fix that directly prevents a broken page for real users.

### 🔥 Top Priorities

- **Database indexes and cascade deletes — seventh review cycle running (May 25, Jul 17, Jul 20, Jul 27, Aug 3, Aug 17, now Aug 24).** Fresh grep of `Backend/main.py` for `ondelete=` and `Index(` still returns zero matches. This is now the single most-overdue item across either project's backlog by a wide margin.
- **Canvas/iCal sync and the "3 free courses" cap remain advertised as Pro-gated with zero enforcement.** `connect_canvas` (`main.py:4765`) still has no tier check; `/me/subscription` still hardcodes `courses_max: None` for every tier (`main.py:2782`). Real, quantifiable revenue leakage, unaddressed for over five weeks now.
- **`plan.md` is still sitting in the repo root, fully implemented, flagged for archiving four reviews ago.** Trivial cleanup, still not done.

### 💡 Opportunities

- The null-semester fix is a good instance of a broader pattern worth watching: nullable fields from the AI-extraction pipeline reaching the frontend unguarded. Worth a quick audit of other optional fields (credits, instructor, meeting times) for the same class of bug before they surface as their own 500s.
- `SCALE_CHECKLIST.md` and `PRICING_AUDIT.md` are both still present and, per last week's review, `SCALE_CHECKLIST.md` is already stale (its flagged issues are resolved but the doc doesn't reflect that). Neither has been touched. If nobody is actively using these as living documents, archiving or refreshing them takes ten minutes and prevents them misleading a future reader.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — seven-cycle-old debt, unchanged.
- Canvas/course-limit enforcement gap (see above) — still contradicts paid-tier marketing copy.
- `[DEBUG]` print statements: a repo-wide count today shows 55 across `Backend/main.py` (extraction, summarization, quiz generation, and metadata parsing paths). Prior reviews scoped this narrowly to the file-extraction code (5 instances); the wider count suggests this is a broader pattern worth a single structured-logging pass rather than a spot fix, if/when there's a slow week to spend on it.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Aug 17 | 1 | 2 |
| Last commit | Aug 19 | Aug 19 |
| Review-cycle-old blockers still open | Monetization (19 wks), auth refresh (6 cycles), cascade deletes, correction-endpoint audit trail (6 cycles) | DB indexes/cascades (7 cycles), Canvas/course-limit enforcement (5+ weeks) |
| This week's movement | Analytics only, no product code | Analytics + one real bug fix (null-semester 500) |
| Resolved since last review | — | Null-semester `/courses` 500 error |

**Which has stronger market potential right now**: Unchanged from last week — Advocate, on the strength of the Radial-pilot-facing clinician portal shipped Aug 16. But this week added no new evidence either way; the pilot's actual trajectory is now the open question, not the product.

**Resource allocation**: The medication-correction audit trail remains the highest-leverage single change available on Advocate — it's a half-day fix sitting directly in the path of an active pilot, and it's now been open for six review cycles. On ClassMate, the indexes/cascades gap is the equivalent overdue item — seven cycles, also a half-day fix, with no external stakeholder forcing urgency, which may be exactly why it keeps slipping. The monetization decision on Advocate (19 weeks) remains the largest single piece of undecided strategy across both projects.

**Timeline suggestion**: Given both projects had a genuinely quiet week, this is a good moment to close out at least one long-standing item rather than let a slow week become a slow month. Suggest picking one: either the Advocate correction-endpoint audit trail (highest stakes, smallest fix) or ClassMate's indexes/cascades (most overdue by cycle count). Separately, worth a direct check on Radial pilot status — the answer changes whether next week's priorities should be pilot-support work or a return to the standing backlog.

---

**Report generated**: August 24, 2026 (Monday morning review)
