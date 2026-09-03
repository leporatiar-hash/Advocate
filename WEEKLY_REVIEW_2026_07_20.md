# Weekly Project Review — July 20, 2026 (Monday Morning)

*This covers the 3 days since the July 17 review. Advocate: 0 new commits. ClassMate: 1 new commit (Jul 19).*

## Executive Summary

- **truefit-meds (Advocate)**: No commits since July 10 — this is a dead week, not a progress week. The monetization decision flagged as a blocker in three straight reviews (May 25, Jul 17, and now) is still undecided, and it's now a 13-week-old open item with zero movement.
- **syllabusync (ClassMate)**: One commit landed — PostHog instrumentation across the full pricing/checkout funnel (`pricing_page_viewed`, `upgrade_clicked`, `checkout_started`, `checkout_completed`, `founding_checkout_completed`), directly closing a gap flagged in the July 15 pricing audit. The chat-entitlement bug from that same audit was already fixed (Jul 15, `a9c7329`) and the founding-member lifetime tier is live (`0dd0794`) — both confirmed still in place in the current code.
- **Key shift since Jul 17**: ClassMate keeps closing audit findings one at a time (funnel analytics this week). Advocate went completely idle — worth checking in on whether that's an intentional pause or something's blocking progress.

---

## truefit-meds (Advocate)

### Status Summary

Zero commits since July 10 (10 days). The codebase is unchanged from last week's review: `backend/models.py` still has no `tier`, `stripe_customer_id`, or `subscription_*` fields anywhere, and no `MONETIZATION.md` exists in the repo.

### 🔥 Top Priorities

- **The monetization decision is now 13 weeks old with zero code movement.** First flagged May 25, repeated Jul 17, unchanged today — confirmed via a fresh grep of `backend/models.py`, which has no tier/subscription/stripe columns at all. This has stopped being a "what should we build" question and become a "did this project stall" question. If Advocate is intentionally paused in favor of ClassMate this week, that's a legitimate call — but it should be a decision, not a drift.
- **Auth token expiry is still 7 days with no refresh path.** `backend/auth.py:17` sets `ACCESS_TOKEN_EXPIRE_MINUTES = 10080` (7 days) and the only `refresh` references in the file are SQLAlchemy `db.refresh()` calls, not a token-refresh endpoint. Same gap flagged twice before, still a 1-2 hour fix, still blocking any external user (clinician/caregiver) from a stable multi-week session.
- **Confirm the mobile landing-page fix actually holds on a real device.** `2e42f04` ("Drop monitor stand/base on mobile, fall back to plain bordered card") is the last commit on the repo, from Jul 10. No commits since means no evidence this got a real-device check as recommended last week — worth 10 minutes on an actual phone before considering it closed.

### 💡 Opportunities

- No new commits this week means no new opportunities emerged — the same one stands: the assessments module (PHQ-9, CSI, Lawton IADL) is still the strongest B2B pitch asset in the repo, and there's still no evidence of outreach to the 3 healthcare contacts suggested back in May.

### ⚠️ Technical Concerns

- No refresh-token mechanism (see above).
- No usage/cost tracking on the OpenAI summary endpoint — still no `tokens_used` or `created_by_user_id` fields.
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` (only `SocialContact` has it, confirmed again this week) — a deleted user still leaves orphaned rows.

---

## syllabusync (ClassMate)

### Status Summary

One commit since last review: full PostHog instrumentation of the pricing/checkout funnel, closing the analytics gap identified in the July 15 pricing audit. Two other audit findings — the half-gated chat sidebar and the missing founding-member tier — were already fixed the same week as the audit (Jul 15) and are confirmed still correct in the current codebase.

### 🔥 Top Priorities

- **Database indexes and cascade deletes are still missing — flagged three review cycles running (May 25, Jul 17, now).** A fresh grep of `Backend/main.py` (now 6,201 lines) for `ondelete=` and `Index(` returns zero matches, same as last week. This is a half-day fix that keeps getting bumped for feature work; with Canvas sync now live and pulling real deadline volume, `GET /deadlines` and `GET /flashcards` remain exposed to full table scans and orphaned rows on user deletion.
- **Canvas/iCal sync and the "3 free courses" cap are advertised as Pro-gated but have zero enforcement, confirmed unchanged.** Verified directly in `connect_canvas` (`Backend/main.py:4737`) — no tier check anywhere in the function — and `courses_max` is still hardcoded to `None` for all tiers with an explicit comment "Courses are unlimited on all tiers" (line 2754). Every free user can use both features without limit today despite the `/upgrade` page and FAQ copy saying otherwise. This is a real revenue leak, not a cosmetic gap.
- **You now have funnel data — use it.** The new PostHog events (`pricing_page_viewed`, `upgrade_clicked`, `checkout_started`, `checkout_completed`, `founding_checkout_completed`) are live across `/upgrade`, `/founding`, the landing page pricing section, and the Stripe success redirect. Worth checking the PostHog dashboard in a week to see if there's a drop-off point between "clicked upgrade" and "completed checkout" — that's the one thing you couldn't see before this commit.

### 💡 Opportunities

- The founding-member lifetime tier ($15 one-time, `founding_member` boolean on `UserProfile`, confirmed live at `Backend/main.py:612-613`) combined with the new checkout-funnel tracking means you can now actually measure whether that tier is converting — worth a quick look once a few days of data accumulate.
- The chat entitlement fix (free tier raised from 10 to 20 msgs/week, sidebar bug resolved) removed a real point of user-facing confusion — worth confirming in analytics that free-tier chat engagement ticked up post-fix.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — three-review-old debt, still open.
- Canvas/iCal/course-limit enforcement gap (see above) — real, not cosmetic, and directly contradicts paid-tier marketing copy.
- The semester plan is still wired as a recurring Stripe subscription with a bundled 10-day trial rather than the one-time charge its own UI copy claims (per the Jul 15 pricing audit) — not re-verified this week since it wasn't touched, but still an open item worth a deliberate decision (true one-time charge vs. just fixing the copy to say "recurring").

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Jul 17 | 0 | 1 |
| Last commit | Jul 10 | Jul 19 |
| Review-cycle-old blockers still open | Monetization decision (13 wks), auth refresh (13 wks), cascade deletes | DB indexes/cascades (3 cycles), Canvas/course tier enforcement |
| This week's movement | None | Closed the analytics-funnel gap from the Jul 15 audit |

**Which has stronger market potential right now**: ClassMate, by a wider margin than last week. It's shipping real fixes against a self-generated audit (chat entitlements, founding tier, funnel analytics all landed within the last 5 days), while Advocate has gone fully quiet for 10 days on top of an already-stalled monetization decision.

**Resource allocation**: If you only have time for one project this week, ClassMate has the higher-leverage, cheaper fix available: the Canvas/iCal/course-limit enforcement gap is a real product-marketing mismatch (you're advertising limits you don't enforce) and is probably a few hours of work given the tier-check pattern already exists elsewhere in the same file. Advocate's monetization decision is still the single biggest lever sitting untouched — even a rough one-page decision doc this week would unstick three review cycles' worth of carried-over priorities.

**Timeline suggestion**: Give the Canvas/course tier-enforcement gap a this-week fix on ClassMate — it's cheap and closes a real gap between what you're charging for and what you're delivering. On Advocate, either write the monetization decision doc this week or consciously deprioritize the project for a defined period — the current state (flagged 3 times, untouched, no explicit deprioritization) is worse than either outcome.

---

**Report generated**: July 20, 2026 (Monday morning review)
