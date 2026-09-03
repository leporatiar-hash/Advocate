# Weekly Project Review — August 3, 2026 (Monday Morning)

*This covers the 7 days since the July 27 review. Advocate: 1 new commit (Jul 27, same day as last review). ClassMate: 0 new commits — still sitting at the Jul 19 commit, now 15 days quiet and a second straight silent review cycle.*

## Executive Summary

- **truefit-meds (Advocate)**: One commit landed the same afternoon as last week's review (`3677d36`, Jul 27) — a real bug fix, not cosmetic: login, register, forgot-password, and JWT session lookup all compared emails case-sensitively, so a user whose stored casing differed from what they typed got a generic "incorrect email or password" every time, including right after a successful password reset. Now normalized to `func.lower()` everywhere plus a password show/hide toggle. Good fix, but the three standing blockers — monetization decision, auth-refresh path, cascade deletes — are all untouched again.
- **syllabusync (ClassMate)**: Second consecutive review with zero commits. The Jul 19 commit is now 15 days old. The two confirmed revenue/product gaps (Canvas enforcement, course limits) and the four-review-old DB indexes/cascades issue are all still exactly as they were.
- **Key shift since Jul 27**: Advocate keeps shipping small, real fixes (fact-check review two weeks ago, now the email-casing bug) while its two biggest-leverage items sit frozen. ClassMate has now gone quiet for two full review cycles in a row — worth checking in on whether that's deliberate.

---

## truefit-meds (Advocate)

### Status Summary

One commit since last review (`3677d36`, Jul 27): fixed a case-sensitive email comparison bug across login, register, forgot-password, and JWT session lookup, plus added a password show/hide toggle on the login page. Scoped, verified fix (3 files, 37 insertions/16 deletions).

### 🔥 Top Priorities

- **The monetization decision is now 16 weeks old with zero code movement.** First flagged in the Apr 13 review ("app is completely free with no premium tier planned"), repeated at every review since. Fresh grep of `backend/models.py` still shows no `tier`, `stripe_customer_id`, or `subscription_*` columns, and there's still no `MONETIZATION.md` in the repo. This is the single oldest open item across both projects.
- **Auth token expiry is still 7 days with no refresh path.** `backend/auth.py:18` still sets `ACCESS_TOKEN_EXPIRE_MINUTES = 10080` (env-overridable but defaulting to 7 days), and there's still no refresh endpoint in `backend/routers/auth.py`. Same gap, fourth review running.
- **The fact-check correction endpoint (shipped Jul 21) still has no audit trail.** Re-checked `backend/routers/logs.py:288-332` (`PATCH /logs/{patient_id}/date/{date}/medication-taken`): it flips `taken: True` on a log entry and commits, with no `updated_at` bump, no `corrected_by`, no record that this was a caregiver correction rather than the original log. A clinician looking at history later can't tell the difference. This was flagged as "worth confirming" last week — now confirmed as a real gap, not just a risk.

### 💡 Opportunities

- The assessments module (PHQ-9, CSI, Lawton IADL) is still the strongest B2B pitch asset in the repo, and there's still no evidence of outreach to the healthcare contacts suggested back in May — now an 11-week-old open opportunity.
- The email-casing fix is a good sign of ordinary product-hardening work continuing even without a monetization plan — worth not losing that momentum while the bigger decision stays parked.

### ⚠️ Technical Concerns

- No refresh-token mechanism (see above).
- No usage/cost tracking on the OpenAI summary endpoint — still no `tokens_used` or `created_by_user_id` fields.
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` — only `SocialContact.user_id` has it (`backend/models.py:146`). Unchanged.
- New: the medication-correction endpoint's lack of an audit trail (see above) — small fix (one `updated_at`/`corrected_by` column) but matters for clinical trust.

---

## syllabusync (ClassMate)

### Status Summary

Zero commits since Jul 19 — the second review in a row with no activity (15 days quiet). No code changes to verify beyond re-confirming the standing issues.

### 🔥 Top Priorities

- **Database indexes and cascade deletes are still missing — now flagged five review cycles running (May 25, Jul 17, Jul 20, Jul 27, now Aug 3).** Fresh grep of `Backend/main.py` (6,201 lines) for `ondelete=` and `Index(` still returns zero matches. This is the most-overdue single item across either project's backlog.
- **Canvas/iCal sync and the "3 free courses" cap are still advertised as Pro-gated with zero enforcement.** Re-verified: `connect_canvas` (`main.py:4737`) still has no tier check, and `courses_max` is still hardcoded `None` for every tier (`main.py:2754`, comment: "Courses are unlimited on all tiers"). Free users can use both without limit despite `/upgrade` and FAQ copy saying otherwise.
- **Two weeks of checkout-funnel data (PostHog events shipped Jul 19) are still sitting unreviewed.** With zero code changes since, this is as clean a window as you'll get to pull `pricing_page_viewed` → `checkout_completed` and look for a drop-off point before the next round of pricing changes.

### 💡 Opportunities

- `plan.md` (the AI chat tab plan) is still sitting in the repo root, dated Feb 23, and still fully implemented — flagged for archiving last review, still there. Low-effort cleanup that prevents a future review (or a future collaborator) from mistaking it for a live roadmap item.
- The founding-member lifetime tier ($15 one-time) plus two weeks of funnel data now gives enough of a window to compare founding-member conversion against monthly — still worth pulling specifically.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — five-review-cycle-old debt, unchanged.
- Canvas/iCal/course-limit enforcement gap (see above) — still contradicts paid-tier marketing copy.
- Two full review cycles with no commits is the longest ClassMate pause on record in this review series. Worth a quick gut-check on whether this is a deliberate breather or something's blocking — the Canvas/course-limit gap in particular is real, unattended revenue leakage the longer it sits.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Jul 27 | 1 | 0 |
| Last commit | Jul 27 | Jul 19 (15 days) |
| Review-cycle-old blockers still open | Monetization decision (16 wks), auth refresh (4 cycles), cascade deletes, no audit trail on corrections (new) | DB indexes/cascades (5 cycles), Canvas/course tier enforcement (3+ cycles) |
| This week's movement | Shipped a real login bug fix | None — second consecutive quiet review |
| Resolved since last review | — | — |

**Which has stronger market potential right now**: Advocate, on the strength of consistent small hardening work (fact-check review, now the login fix) even without the monetization question resolved. ClassMate's two-cycle silence isn't itself damning, but it means its two confirmed revenue gaps (Canvas enforcement, course limits) have now gone unaddressed even longer with no offsetting new evidence of progress.

**Resource allocation**: ClassMate's DB indexes/cascades fix remains the single highest-leverage move available on either project — a half-day of work, now five review cycles overdue, directly de-risking the live Canvas-sync feature. Second priority: the Canvas/course-limit enforcement gap, since it's an active, quantifiable mismatch between what's marketed and what's shipped. On Advocate, the monetization decision remains the biggest lever untouched at 16 weeks — at this point the cost of *not deciding* is bigger than either directional choice would be.

**Timeline suggestion**: This week, either fix ClassMate's indexes/cascades or explicitly decide it's not a priority right now — five cycles of "still open" without either action is itself a signal. Pull the two weeks of funnel data before making further pricing changes. On Advocate, add a one-line `corrected_by`/`updated_at` bump to the medication-correction endpoint (cheap, closes a real trust gap), and either write the monetization decision doc or make an explicit, time-boxed call to deprioritize it.

---

**Report generated**: August 3, 2026 (Monday morning review)
