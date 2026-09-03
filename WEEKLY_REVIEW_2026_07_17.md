# Weekly Project Review — July 17, 2026 (Monday Morning)

*Note: last saved review was May 25 — 7 weeks ago. This covers all commits since then (37 for Advocate, 18 for ClassMate).*

## Executive Summary

- **truefit-meds (Advocate)**: Shipped a real clinical feature (PHQ-9/CSI/Lawton IADL assessments) and fixed the log-performance issue flagged last time, but **monetization is still at zero** — no tier column, no Stripe, no MONETIZATION.md, three review cycles running. Most of this week's effort went into a landing-page redesign that's still being debugged on mobile.
- **syllabusync (ClassMate)**: Delivered the two things flagged as blocking last time — Canvas LMS auto-sync is live, and chat is fully built out with file uploads and calendar tools. Pricing changed (now $4.99/mo, $39.99/yr, $15 founding-member). A same-week production incident (new v2 landing page caused a stuck loading screen) was caught and fixed within hours.
- **Key shift since May 25**: ClassMate closed both of its top priorities from last review. Advocate closed its technical-debt items but not its business-model decision — that gap is now 12 weeks old.

---

## truefit-meds (Advocate)

### Status Summary

Feature and performance work landed well; the assessments module is a legitimate clinical-credibility feature. The business-model decision flagged in the last two reviews still hasn't been made — no tier schema, no payment processor, no pricing page exists anywhere in the code.

### 🔥 Top Priorities

- **Make the monetization decision — it's now a 12-week-old blocker.** The May 25 review recommended B2B healthcare providers and asked for a decision by May 26. `backend/models.py` still has no `tier`, `stripe_subscription_id`, or `subscription_period_end` field anywhere, and there's no `MONETIZATION.md` in the repo. Notably, this week's work (PHQ-9, Caregiver Strain Index, Lawton IADL — all standard clinical instruments) is a *de facto* vote for the B2B/clinical path even though no one wrote that down. Recommend: write a one-page decision doc this week, even retroactively, and let it drive what gets built next.
- **Fix the 7-day auth expiry before any beta.** `backend/auth.py` still only has `create_access_token` with no refresh endpoint — flagged in the May 25 review, unchanged. Any external user (clinician or caregiver) will get logged out mid-week with no way back in except re-login. This is a one-to-two-hour fix and should happen before anyone outside you touches the app.
- **Close out the mobile landing-page bug before touching it further.** Commits `2e8...` through `a401d0a` (9 commits, July 8–10) show repeated attempts to fix mobile hero clipping, including two rounds of adding/removing debug badges. It looks resolved (`2e42f04`: "Drop monitor stand/base on mobile, fall back to plain bordered card") but this was clearly a multi-day fight with viewport-height CSS — worth a real device test (not just simulator) before calling it done.

### 💡 Opportunities

- The assessments module (PHQ-9, CSI, Lawton IADL) is your strongest B2B pitch asset yet — these are instruments clinicians already recognize. Pair it with a one-pager and send it to the 3 healthcare contacts the May 25 review suggested reaching out to; there's no evidence in the repo of that outreach having happened yet.
- Log pagination and photo-column deferral (`48babde`, `a8bdcf5`) fixed a real scaling risk before it bit you — good instinct to do that proactively. Same treatment is worth applying to the assessments table now that it exists.

### ⚠️ Technical Concerns

- No refresh-token mechanism (see above) — was flagged as "priority: before public beta" 7 weeks ago.
- No usage/cost tracking on the OpenAI summary endpoint (`/summary/{patient_id}/generate`) — still no `tokens_used` or `created_by_user_id` fields, so you have no visibility into API spend per user if this scales.
- `SocialContact` uses `ON DELETE CASCADE` correctly, but core tables (`Patient`, `Medication`, `DailyLog`) don't — a deleted user still leaves orphaned patient/medication/log rows.

---

## syllabusync (ClassMate)

### Status Summary

Both top priorities from the last review — Canvas auto-sync and chat verification — are done. Canvas sync (`sync_canvas()`, encrypted PAT storage via Fernet, dedup by `canvas_{assignment_id}`) is real and shipped, and chat now supports file uploads, deadline-aware context, and calendar read/write tools. Pricing was restructured mid-cycle. One production incident this week was self-caught and fixed same-day.

### 🔥 Top Priorities

- **Verify the July 12 production incident didn't cost you users.** Commit `c605543` describes a real outage: the new `/v2` landing page got statically prerendered despite depending on client-side auth state, so real visitors landing on the homepage saw a stuck "ClassMate is loading..." screen that never resolved — "confirmed live in production" per the commit message. It's fixed, but if this was live for any length of time before being caught, it's worth checking analytics/Sentry for a traffic or signup dip around July 12.
- **Add database indexes and cascade deletes — flagged 7 weeks ago, still not in the codebase.** A search of `Backend/main.py` for `ondelete=` or `Index(` turns up nothing. As Canvas sync brings in real deadline volume per user, `GET /deadlines` and `GET /flashcards` are exposed to full table scans, and deleting a user still leaves orphaned flashcards/summaries/chat_messages behind.
- **Confirm institutional outreach actually happened.** The May 25 review's #1 recommendation was emailing 2-3 university registrars (CofC, Clemson, USC) to book a pilot. There's no artifact in the repo (no CHAT_VERIFICATION.md, no outreach tracking) confirming this happened — worth a quick gut-check on whether that got deprioritized in favor of the Canvas/chat build-out, which is a reasonable trade but should be a conscious one, not a drift.

### 💡 Opportunities

- Pricing has shifted to $4.99/mo, $39.99/yr, and a $15 one-time "Founding Member" tier — a meaningfully different model than the $20/6mo assumed in the last review. Worth confirming this was a deliberate pricing test and not multiple experiments left half-finished; the founding-member tier in particular is a good urgency lever for the institutional pilot outreach above.
- Canvas sync is now your strongest registrar-facing demo asset. Pair it with the chat feature (which now has calendar read/write tools per `be5cf83`) for a "syllabus in, deadlines out, ask-it-anything" demo — that's a genuinely different pitch than "another task app."

### ⚠️ Technical Concerns

- `mise.toml` was added to disable Python attestation verification on Railway (`fe54f43`) because "mise 2026.6.10 fails to verify GitHub artifact attestations for any Python version." This bypasses a supply-chain integrity check rather than fixing the underlying issue — reasonable as a short-term unblock, but worth revisiting once mise ships a fix, since it's currently a standing security exception.
- Rate limiting (`slowapi`) is only applied to 4 endpoints in a 6,099-line `main.py`. Chat and file-upload endpoints are covered; check whether Canvas sync and other write-heavy endpoints need the same treatment.
- Local dev databases (`syllabusync.db`, `classmate.db`) are out of sync with the current schema (missing `subscription_tier` column in one, missing `user_profiles` table entirely in the other) — not a production risk, but a sign local dev environments have drifted from what's actually deployed, which will eventually cause a confusing bug.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|---|---|---|
| Commits since May 25 | 37 | 18 |
| Last commit | Jul 10 | Jul 15 |
| Top priorities from last review closed | 0 of 3 (business model, tier gating, customer outreach) | 2 of 3 (chat verified, Canvas sync shipped); outreach unconfirmed |
| Monetization | Still none | Live, pricing revised |
| New risk introduced this week | Mobile CSS regression (now fixed) | Production hydration outage (now fixed) |

**Which has stronger market potential right now**: ClassMate, on execution — it closed its structural gaps (Canvas sync, chat) and has live payments processing real pricing experiments. Advocate has the stronger differentiated asset (clinical assessment instruments), but a feature nobody can pay for isn't market traction yet.

**Resource allocation**: Advocate needs one focused session to write the monetization decision doc and wire up even the simplest tier gate — this has been carried across three review cycles and is now the single biggest thing blocking the project's credibility, not a technical problem. ClassMate needs a short institutional-outreach push to convert the now-complete Canvas sync into an actual pilot conversation, plus the overdue indexes/cascades before deadline volume grows further.

**Timeline suggestion**: Give Advocate's monetization decision a hard deadline this week — it's cheap to decide and expensive to keep deferring. ClassMate's technical debt (indexes, cascades) is a half-day task that should happen before the next round of Canvas-driven data growth, not after.

---

**Report generated**: July 17, 2026 (Monday morning review)
