# Weekly Project Review — August 31, 2026 (Monday Morning)

*This covers the week since the August 24 review. Advocate: 0 commits — the first fully silent week in this review series. ClassMate: 17 commits (Aug 25–27), the largest single week in this series by commit count, built around a three-tier Stripe billing overhaul.*

## Executive Summary

- **truefit-meds (Advocate)**: Zero commits since Aug 19 — last week's `f2bfdf2` (analytics) is still the most recent commit on the branch, meaning this is now 12 days and two consecutive review cycles with no product movement at all. All four standing blockers (medication-correction audit trail, monetization, auth refresh, cascade deletes) are unchanged, re-verified again this morning by direct grep. The only local change is an uncommitted, non-product dev-tooling diff (Omnara phone-preview workflow in `README.md`/`package.json`).
- **syllabusync (ClassMate)**: The biggest week in this review series for either project — 17 commits, headlined by a three-tier billing rebuild (`82330cf`) that root-caused and fixed a **live checkout failure** (an archived Stripe price behind a stale lookup key), added a webhook idempotency ledger, changed founding-member access from permanent to a 365-day grant, and shipped tests alongside each change. Also shipped course colors, deadline-title naming styles with a bulk-regenerate endpoint, and a persistent chat-promotion FAB. The three standing blockers (indexes/cascades, Canvas/course-limit enforcement, stale `plan.md`) are all unchanged.
- **Key shift since Aug 24**: The gap between the two projects' momentum, which has fluctuated all series, is now at its widest — 0 commits vs. 17. More notably, Advocate's silence has gone from "one quiet week" to "two quiet weeks in a row" immediately after the Radial-pilot-facing clinician portal shipped Aug 16. That combination (big pilot-facing ship, then two weeks of total silence) is the single most important open question in this review, not any individual code item.

---

## truefit-meds (Advocate)

### Status Summary

No commits since `f2bfdf2` (Aug 19, already covered in last week's review). Working tree has one uncommitted, non-product change: dev-tooling support for previewing the app on a phone via Omnara (`README.md`, `package.json` — new `dev:web:phone`/`dev:proxy`/`omnara` scripts). Re-verified this morning: `backend/models.py` still has no `tier`/`stripe_customer_id`/`subscription_*` columns and cascade deletes are still limited to `SocialContact.user_id` (`backend/models.py:147`); `backend/auth.py:18` still sets `ACCESS_TOKEN_EXPIRE_MINUTES=10080` with no refresh endpoint anywhere in `backend/routers/auth.py`; and `backend/routers/logs.py:307` (`correct_medication_taken`) still does a bare `log.medications_taken = updated_entries; db.commit()` with no `updated_at` or `corrected_by` field.

### 🔥 Top Priorities

- **Radial pilot status is now the single most important open item — not any specific code gap.** Two straight weeks of zero commits, directly following the biggest pilot-facing ship in this series (the clinician portal, Aug 16), is a pattern worth resolving with a direct conversation rather than another cycle of code review. Either the pilot is progressing and engineering attention has shifted elsewhere for good reason, or it's stalled and that's worth knowing now rather than after a third silent week.
- **Medication-correction audit trail — seventh review cycle unaddressed, and the stakes haven't changed: a live clinician portal has been reading this same log history with no way to distinguish a corrected entry from an original one for two weeks now.** `backend/routers/logs.py:307` remains a half-day fix.
- **Monetization decision — now 20 weeks with zero code movement.** Still no `MONETIZATION.md`, still no schema fields. The oldest open item across both projects, and ClassMate's three-tier billing rebuild this week (shipped in three days, price-id-based, with an idempotency ledger and full test coverage) is a concrete existence proof that this doesn't have to stay a 20-week-old open question.

### 💡 Opportunities

- ClassMate's billing implementation this week (`Backend/main.py` `PLAN_CONFIG`/`_resolve_plan_price_id`/`StripeWebhookEvent` idempotency ledger) is a reasonable reference pattern if/when the monetization decision here finally gets made — no need to design that from scratch.
- The Omnara phone-preview tooling (uncommitted) suggests active interest in mobile testing/demo workflows, which could be relevant context for however the Radial conversation is going.

### ⚠️ Technical Concerns

- No refresh-token mechanism (unchanged).
- No usage/cost tracking on the OpenAI summary/synthesis endpoints (unchanged).
- Core tables (`Patient`, `Medication`, `DailyLog`) still lack `ON DELETE CASCADE` (unchanged).
- Medication-correction endpoint's missing audit trail — now the most stakes-relevant unaddressed item in either repo, and getting more overdue with each silent week rather than less.

---

## syllabusync (ClassMate)

### Status Summary

Seventeen commits since Aug 24 (`3f92b02` → `38b4b9f`, Aug 25–27), the largest single week in this review series by commit count. The headline is a billing overhaul: `82330cf` root-caused a real live-checkout failure (`classmate_pro_monthly`'s lookup key pointed at an archived $4.99 Stripe price, which Stripe rejected with "The price specified is inactive"), replaced lookup-key-based price resolution with direct Stripe Price-id resolution from env vars, and changed founding-member access from a permanent grant to a 365-day one (`founding_member_expires_at`, with a migration that backfills existing founding members rather than silently downgrading them). `47f9b7b` adds a webhook idempotency ledger (`StripeWebhookEvent`) so redelivered Stripe events are a no-op. All three of the billing commits (webhook, tier logic, price-fix) shipped with dedicated test scripts (`test_stripe_webhook.py`, `test_billing_tiers.py`, `test_free_tier_limits.py`) — a real practice improvement over this project's historical pattern. Beyond billing: course colors, two new deadline-title naming styles (simple/descriptive) plus a bulk-regenerate endpoint so the setting also applies retroactively, and a persistent "Talk to ClassMate" FAB to promote the underused chat feature. Working tree also has uncommitted WIP: manual deadline-title editing on the calendar page.

### 🔥 Top Priorities

- **Database indexes and cascade deletes — eighth review cycle running (May 25, Jul 17, Jul 20, Jul 27, Aug 3, Aug 17, Aug 24, now Aug 31).** Fresh grep of `Backend/main.py` for `ondelete=` and `Index(` still returns zero matches. This remains the single most-overdue item across either project's backlog, and this week's billing work (new `founding_member_expires_at` column, new `StripeWebhookEvent` table) added more unindexed surface without touching this gap.
- **Canvas/iCal sync and the "3 free courses" cap remain advertised as Pro-gated with zero enforcement — now approaching seven weeks since `PRICING_AUDIT.md` documented it (Jul 15), through the biggest billing week in this series.** `connect_canvas` (`main.py:5312`) still has no tier check; `/me/subscription` still hardcodes `courses_max: None` for every tier (`main.py:3109`, same comment as before: "Courses are unlimited on all tiers"). Notable that a week this focused on billing correctness didn't touch this — worth an explicit decision either to enforce it or drop it from the pricing copy.
- **`PRICING_AUDIT.md` is now stale in a new way, not just an old one.** It documents $4.99/$39.99 pricing; this week's `022a0d5` moved live prices to $5/$40. The document was already flagged as needing a refresh for the Canvas-enforcement gap — it's now also wrong about the numbers themselves.

### 💡 Opportunities

- The billing work this week is a genuine step up in engineering discipline for this codebase: root-causing the checkout failure instead of patching around it, an idempotency ledger instead of hoping Stripe doesn't redeliver, and tests shipped alongside each change rather than after. Worth treating this as the new bar for future backend changes here, not a one-off.
- `plan.md` (the AI chat feature plan) is fully implemented and now further reinforced by this week's chat-promotion FAB — the feature it planned is not just done but being actively marketed. Flagged for archiving five reviews ago now; genuinely trivial cleanup at this point.
- `SCALE_CHECKLIST.md` (Feb 4) remains stale per prior reviews and untouched again this week.

### ⚠️ Technical Concerns

- Indexes/cascades (see above) — eight-cycle-old debt, unchanged, and growing in surface area with each new table added.
- Canvas/course-limit enforcement gap (see above) — still contradicts paid-tier marketing copy, now nearly seven weeks documented with no follow-up commit.
- `[DEBUG]` print statements: still 55 across `Backend/main.py`, flat week-over-week — no regression, but also no cleanup despite substantial new code shipped.
- The new `founding_member_expires_at` / `StripeWebhookEvent` additions are exactly the kind of billing-critical state that benefits most from the indexing/constraints work that's been deferred for eight cycles — worth weighing whether this raises the cost of continuing to defer it.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since Aug 24 | 0 | 17 |
| Last commit | Aug 19 | Aug 27 |
| Review-cycle-old blockers still open | Monetization (20 wks), auth refresh (7 cycles), cascade deletes, correction-endpoint audit trail (7 cycles) | DB indexes/cascades (8 cycles), Canvas/course-limit enforcement (~7 weeks) |
| This week's movement | None (one uncommitted dev-tooling diff) | Three-tier billing overhaul + live checkout bug fix, course colors, deadline naming, chat-promotion FAB |
| Resolved since last review | — | Live Stripe checkout failure (archived-price lookup key); permanent founding-member grant corrected to 365 days |

**Which has stronger market potential right now**: ClassMate, clearly this cycle — this week is the first time either project has shipped real, tested, revenue-critical infrastructure (working three-tier billing, webhook idempotency) rather than a feature or a fix. Advocate still has the stronger pilot story on paper (a named, real-world stakeholder in Radial), but two silent weeks after shipping the pilot-facing portal means that story currently has no new evidence behind it, while ClassMate's monetization path just got materially more real.

**Resource allocation**: Two items are tied for highest leverage, for different reasons. On Advocate, resolving the Radial pilot's actual status is now more urgent than any single code fix — it determines whether the standing blockers should be closed this week or deprioritized honestly. On ClassMate, the indexes/cascades gap (eight cycles, still a half-day fix) is the most overdue item across either backlog and just got more expensive to keep deferring now that billing-critical tables depend on it. The monetization decision on Advocate (20 weeks) remains the largest single piece of undecided strategy across both projects — and ClassMate's billing rebuild this week is a working template for exactly that decision.

**Timeline suggestion**: This week, get a direct read on Radial before another cycle passes — that answer should drive whether Advocate's priorities are pilot support or a return to the standing backlog. On ClassMate, ride the momentum from this week's engineering-quality bar into closing the indexes/cascades gap while it's still a half-day job rather than letting an eighth cycle become a ninth. Separately, either enforce the Canvas/course-limit gate or drop it from marketing copy — it's now been documented and unaddressed through the project's biggest billing week to date, which is as strong a signal as any that it needs an explicit decision rather than further silence.

---

**Report generated**: August 31, 2026 (Monday morning review)
