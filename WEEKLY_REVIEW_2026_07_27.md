# Weekly Project Review — July 27, 2026 (Monday Morning)

*This covers the 7 days since the July 20 review. Advocate: 1 new commit (Jul 21). ClassMate: 0 new commits.*

## Executive Summary

- **truefit-meds (Advocate)**: The 10-day dead streak flagged last week broke — one commit landed Jul 21 (`219e533`), adding a real caregiver-facing feature: a "fact-check review" on the summary page that flags mis-logged doses and lets a caregiver confirm "he took it" to correct the record. That's genuine feature work, not cosmetic. But the two long-standing blockers — the monetization decision and the missing auth-refresh path — are both untouched and now even older.
- **syllabusync (ClassMate)**: Zero commits since Jul 19, an 8-day quiet stretch — the first pause after a run of five straight fixes closing out the Jul 15 pricing audit. One audit item did get fully resolved in that streak that last week's review hadn't yet re-confirmed: the semester plan's recurring-vs-one-time mismatch is now moot because the semester plan literal has been removed from the codebase entirely (only `monthly` and `founding` remain).
- **Key shift since Jul 20**: Roles reversed from last week — Advocate moved (a little), ClassMate went quiet (for the first time in weeks). Neither project touched its respective oldest debt: Advocate's monetization decision and ClassMate's missing DB indexes/cascades.

---

## truefit-meds (Advocate)

### Status Summary

One commit since last review (`219e533`, Jul 21): a "fact-check review" feature on the summary page — the AI-generated summary now surfaces specific flagged facts (e.g., a dose that may have been mis-logged) and lets the caregiver confirm it was actually taken, correcting the underlying log via a new `PATCH /logs/{patientId}/date/{date}/medication-taken` endpoint. Real, scoped feature work across both frontend and backend (6 files, 214 lines).

### 🔥 Top Priorities

- **The monetization decision is now 14 weeks old with zero code movement.** Fresh grep of `backend/models.py` confirms still no `tier`, `stripe_customer_id`, or `subscription_*` columns anywhere, and no `MONETIZATION.md` in the repo. First flagged May 25, repeated every review since, unchanged again this week. This is the single oldest open item across both projects — even a rough one-page decision doc would unstick it.
- **Auth token expiry is still 7 days with no refresh path.** `backend/auth.py:17` still sets `ACCESS_TOKEN_EXPIRE_MINUTES = 10080`, and the file has no token-refresh endpoint. Same gap flagged three reviews running, still a 1-2 hour fix, still the thing standing between this app and a stable multi-week clinician/caregiver session.
- **The new fact-check feature is a good caregiver-trust signal — worth a real-device sanity check before calling it done.** It touches the DB (correcting logged doses) via a new PATCH endpoint with no visible audit trail on who/when a correction was made — worth confirming there's at least a `updated_at` bump on the log row so a clinician reviewing history later can tell a dose was caregiver-corrected rather than originally logged that way.

### 💡 Opportunities

- The assessments module (PHQ-9, CSI, Lawton IADL) remains the strongest B2B pitch asset in the repo, and there's still no evidence of outreach to the healthcare contacts suggested back in May — that's now a 9-week-old open opportunity sitting next to a 14-week-old blocker on the same underlying question (is this a consumer app or a clinician-facing product?).
- The fact-check feature is a differentiator worth featuring in any outreach material — "catches mis-logged doses" is a concrete, demoable trust feature that's rare in consumer med-tracking apps.

### ⚠️ Technical Concerns

- No refresh-token mechanism (see above).
- No usage/cost tracking on the OpenAI summary endpoint — still no `tokens_used` or `created_by_user_id` fields, and the new fact-check logic adds another call path through that same summary generation code without cost visibility.
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` — confirmed again via `backend/models.py`, only `SocialContact` has it (line 146). A deleted user still leaves orphaned rows across the tables that matter most.

---

## syllabusync (ClassMate)

### Status Summary

Zero commits since Jul 19 — an 8-day pause after the five-commit streak (Jul 13-19) that closed out most of the Jul 15 pricing audit findings. Two items from that audit are now fully resolved rather than just "recently fixed": the semester plan is completely gone from the checkout code (`plan_must_be_valid` now only accepts `monthly`/`founding`), so the recurring-vs-one-time inconsistency flagged in the audit no longer applies at all.

### 🔥 Top Priorities

- **Database indexes and cascade deletes are still missing — now flagged four review cycles running (May 25, Jul 17, Jul 20, now).** Fresh grep of `Backend/main.py` (6,201 lines) for `ondelete=` and `Index(` still returns zero matches. This is a half-day fix that has now outlasted every other item in either project's backlog in terms of review cycles ignored. With Canvas sync live and pulling real deadline volume, `GET /deadlines` and `GET /flashcards` remain full-table-scan and orphan-row exposed.
- **Canvas/iCal sync and the "3 free courses" cap are still advertised as Pro-gated with zero enforcement.** Re-verified: `connect_canvas` (main.py:4737) has no tier check in its body, and `courses_max` is still hardcoded `None` for every tier (line 2754, comment: "Courses are unlimited on all tiers"). Free users can use both without limit today despite `/upgrade` and FAQ copy saying otherwise — a real revenue leak, unchanged for at least two review cycles.
- **You now have 8 days of funnel data sitting unreviewed.** The PostHog checkout-funnel events shipped Jul 19 (`pricing_page_viewed` through `checkout_completed`) have had over a week to accumulate — this quiet stretch is actually a good window to pull the dashboard and see if there's a drop-off point between "clicked upgrade" and "completed checkout," since no code changes since then means the data reflects a stable funnel.

### 💡 Opportunities

- The founding-member lifetime tier ($15 one-time) plus the new funnel tracking means you can now measure whether founding-member checkout is converting better or worse than monthly — worth pulling that comparison specifically, not just overall funnel health.
- `plan.md` (the AI chat tab implementation plan) is dated Feb 23 and fully implemented already — `ChatConversation`/`ChatMessage` models, `FREE_CHAT_MESSAGE_LIMIT`/`PRO_CHAT_MESSAGE_LIMIT`, and the chat UI all exist in the current codebase. Worth deleting or archiving this file so it doesn't get mistaken for a live roadmap item in a future review.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — four-review-cycle-old debt, now the most overdue single item across both projects.
- Canvas/iCal/course-limit enforcement gap (see above) — real, not cosmetic, still contradicts paid-tier marketing copy.
- No commits in 8 days is the longest ClassMate pause in the period covered by prior reviews — worth confirming this is a deliberate breather rather than something blocking, especially with two real product-marketing mismatches (course limits, Canvas gating) still sitting open.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Jul 20 | 1 | 0 |
| Last commit | Jul 21 | Jul 19 |
| Review-cycle-old blockers still open | Monetization decision (14 wks), auth refresh (3 cycles), cascade deletes | DB indexes/cascades (4 cycles), Canvas/course tier enforcement (2+ cycles) |
| This week's movement | Shipped fact-check review feature | None — first quiet week after a 5-commit fix streak |
| Resolved since last review | — | Semester-plan recurring/one-time mismatch fully closed (plan literal removed) |

**Which has stronger market potential right now**: Roughly even this week, a change from the last two reviews. Advocate broke its dead streak with a genuinely useful feature (fact-check review); ClassMate's quiet week means no new evidence either way, but it's sitting on two confirmed real revenue/product gaps (Canvas enforcement, course limits) that have now gone unaddressed for multiple cycles despite being cheap fixes.

**Resource allocation**: The single highest-leverage move available on either project is the ClassMate DB indexes/cascades fix — it's a half-day of work, now the most-overdue item in either backlog (4 review cycles), and directly de-risks the Canvas-sync feature that's already live and pulling real data. Second priority: the Canvas/course-limit enforcement gap on ClassMate, since it's an active mismatch between marketing and product. On Advocate, the monetization decision remains the biggest single lever untouched — 14 weeks and counting.

**Timeline suggestion**: This week, fix ClassMate's indexes/cascades — it's cheap, overdue, and lower-risk than more feature work while volume is still small. Use the funnel data that's now had over a week to accumulate before shipping anything else pricing-related. On Advocate, either write the monetization decision doc this week or make an explicit call to deprioritize the project for a defined period — continuing to carry it forward unresolved is worse than either real outcome.

---

**Report generated**: July 27, 2026 (Monday morning review)
