# Weekly Project Review — May 25, 2026 (Monday Morning)

## Executive Summary

**Status**: Both projects have shipped incrementally since April 27, but execution gaps remain on different fronts.

- **truefit-meds (Advocate)**: Continued UI polish + feature additions (socialization tracking, treatment plans) but **still zero monetization progress**. This is now a 4-week-old blocker. Product is feature-rich but has no business model. Code quality is excellent, but shipping is diverging from business priorities.

- **syllabusync (ClassMate)**: Intense bug-fixing and architecture improvements (Supabase→native JWT, password reset fixes, chat limit corrections, Crow widget removal). The core monetization (Stripe) is stable, but product has shifted focus from "growth via features" to "stability via technical debt reduction." This is healthy but means new feature velocity has slowed.

**Key insight**: Advocate is executing a product roadmap (adding features users don't pay for), while ClassMate is executing a business roadmap (fixing auth, chat limits, pricing accuracy). The projects need different remedies.

---

## truefit-meds (Advocate)

### Status Summary

**Polished but directionless**. Since April 27, you've added 5 UX-focused commits: treatment plan management, socialization tracking, patient profile settings, skeleton loaders, and a redesigned landing page. The app is visually cohesive and feature-complete for caregiving workflows. However, **monetization remains at zero**—no tier system, no Stripe integration, no pricing page, no subscription model. The product is deployment-ready but business-model-incomplete.

**Code quality**: ⭐⭐⭐⭐⭐ Excellent. Clean component structure, proper TypeScript, minimal technical debt.
**Deployment readiness**: ⭐⭐⭐⭐ Can ship today. Vercel pipeline works, auth is hardened, error handling is solid.
**Monetization**: 🔴 **STILL ZERO** — No progress in 4 weeks despite explicit priority. No business model chosen, no tier gating, no payment processor.
**User traction**: 🔴 No beta launch; zero external validation. Product optimized for nobody in particular.
**Feature completeness**: ⭐⭐⭐⭐⭐ Comprehensive. Daily logs, medications, side effects, treatment plans, socialization, insights, PDF summaries. Exceeds typical MVP scope.

### 🔥 Top Priorities (CRITICAL — Choose ONE path)

**DECISION POINT**: You're at a fork. Option A commits to B2B (sell to hospitals/clinics), Option B commits to B2C (freemium to caregivers), Option C pivots to a different market entirely. Pick by end of week or deprioritize this project for next quarter.

1. **[DECISION: TODAY] Pick a monetization model + write MONETIZATION.md** (1 hour decision, 30 min doc)
   - **Option A: B2B2C via Healthcare Providers**
     - Positioning: "Clinical-grade summary export + caregiver dashboards for doctors and care teams."
     - Pricing: $500/mo per clinic (50 caregiver accounts) or $50/mo per doctor (1-2 caregivers)
     - Go-to-market: Reach out to 3 healthcare providers you know (family doctor, nurse, hospital contact)
     - Timeline: Validate interest by May 31, pilot with 1 clinic by June 15
     - Risk: Healthcare sales cycle is slow (2-6 months typical); requires HIPAA compliance eventually
     - Upside: Higher LTV ($500/mo clinic > $10/mo individual); smaller TAM but highly defensible
   
   - **Option B: Freemium to Caregivers**
     - Positioning: "Free health tracking for family caregivers. Pro: PDF export, doctor sharing, medication interactions."
     - Pricing: Free (basic tracking) + Pro ($9.99/mo)
     - Go-to-market: Launch public beta on Product Hunt, Reddit r/caregiving, caregiver Facebook groups
     - Timeline: Can launch this week; expect 100-500 signups in first month
     - Risk: Freemium conversion is hard (typical 1-3% for health apps); dependency on consumer marketing
     - Upside: Largest TAM (65M caregivers in US); can validate market fit quickly
   
   - **Option C: Pivot to Corporate Wellness / Employee Benefits**
     - Positioning: "Employee health tracking for benefits teams (caregiving + wellness combined)."
     - Pricing: $10/employee/year (sold to HR departments)
     - Go-to-market: Reach out to 3 mid-market companies' HR teams for pilot
     - Timeline: 2-3 month sales cycle typical
     - Risk: Different buyer (HR vs. doctor), new competitive set (Headspace, Ginger, etc.)
     - Upside: Stable B2B revenue if accepted; employee benefits are sticky (low churn)
   
   **Why this matters**: Each path requires different product optimizations, different features, different messaging. Shipping without choosing is wasting weeks. Pick by EOD Tuesday May 26.

2. **[After decision] Implement tier gating for ONE premium feature** (2-3 hours)
   - Gate `/summary/pdf` endpoint behind monetization logic
   - Add `<PremiumCTA>` component (lock icon, "Upgrade" button) for free users
   - No payment processing yet—just verify gate works + UX is clean
   - Expected: End-to-end test by May 30

3. **[Parallel] Identify and validate 3 target customers** (2-3 hours)
   - **If Option A (B2B)**: Email 3 healthcare providers you know: "Built a clinical summary tool for caregivers. Your doctors/nurses would use it daily. Interested in a 30-day eval?"
   - **If Option B (Freemium)**: Post to r/caregiving asking "Would you pay for PDF export + doctor sharing of health records? Why/why not?"
   - **If Option C (Corporate)**: Email 3 HR contacts: "We track employee wellness + caregiver health. Many of your team juggle both. Interested in a pilot?"
   - Expected: 1-2 responses by May 30; use feedback to finalize pricing/positioning

### 💡 Opportunities

- **OpenFDA drug interaction API integration** — Already logging medications. Free API returns contraindications + side effects. When caregivers log a combo (e.g., Warfarin + Ibuprofen), show a warning banner. Builds trust + prevents errors. Estimated: 2-3 hours. This is a **killer differentiator** vs. generic health trackers.

- **Caregiver community (Discord/Slack)** — No competitor has caregiver peer support built-in. Even a simple Discord channel creates lock-in + word-of-mouth. Estimated: 1 day setup + ongoing moderation.

- **iOS app via Capacitor** — Capacitor is already wired in `package.json` + `/ios` folder exists. Build a quick companion app (read-only dashboard + daily log form). Would capture 10-20% adoption boost for mobile caregivers. Estimated: 3-4 weeks post-launch.

### ⚠️ Technical Concerns

- **Database tier system missing** — Add `tier` (free/pro), `stripe_subscription_id`, `subscription_period_end` to `users` table. Non-blocking prep work. Estimated: 15 min.

- **7-day access token expiry with no refresh mechanism** — Users will auto-logout after 1 week. Implement JWT refresh token pattern: (a) add `refresh_token` to users, (b) add `POST /auth/refresh` endpoint, (c) auto-refresh on 401 in `AuthProvider`. Estimated: 1-2 hours. **Priority**: Do this before public beta launch.

- **Summary cost tracking missing** — `/summary/{patient_id}/generate` calls OpenAI with no usage logging. Add `created_by_user_id`, `created_at`, `tokens_used` to `summaries` table for cost attribution. Estimated: 30 min.

- **No pagination on logs** — `GET /logs/patient/{patient_id}` likely returns all historical logs unfiltered. Add `?limit=30&offset=0` to prevent performance degradation as data grows. Estimated: 30 min.

- **Cross-tab logout incomplete** — Logging out in one tab doesn't log out others (localStorage only). Add storage event listener: `window.addEventListener('storage', (e) => { if (e.key === 'token' && !e.newValue) logout() })`. Estimated: 15 min.

### Recent Commits (Since April 27)

✅ Socialization Tracking feature (5 checkboxes for social activities)
✅ Treatment Plan management (therapy list, clinicians list as dynamic lists)
✅ Patient Profile settings page with sign-out
✅ Settings UI polish + known side effects surface
✅ Skeleton loaders replacing spinners (better perceived performance)
✅ Auto-save on daily log form (prevent data loss)
✅ Landing page redesign (hero heading, mental health caregiver framing)

**Assessment**: 7 commits in 4 weeks = feature-focused shipping, but all UX/polish. Zero business logic commits. The product looks better but has no revenue path. This feels like optimizing for a market you haven't validated yet.

---

## syllabusync (ClassMate)

### Status Summary

**Battle-hardened and stable**. Since April 27, you've shipped 15 commits focused on **technical debt reduction and reliability**, not feature velocity:
- Dual JWT migration (Supabase→native), with fallback for legacy users ✅
- Password reset fixes (Resend email domain validation, one-time token fixes) ✅
- Chat free tier limits corrected (10/week, not unlimited) ✅
- Database transaction isolation (prevent ALTER TABLE deadlocks) ✅
- Crow widget removal (cut unmaintained dependency) ✅
- Critical audit fixes (pricing accuracy, delete account safety, hallucination guards in AI) ✅

This is **high-quality boring work** that unblocks scaling. Monetization (Stripe) remains stable with 7+ paying users. However, **new feature velocity has slowed**—no major new features shipped since the AI chat MVP went live 4 weeks ago.

**Code quality**: ⭐⭐⭐⭐ Well-organized FastAPI (5,470 lines main.py), proper separation of concerns, excellent error handling.
**Deployment readiness**: ⭐⭐⭐⭐ Production-grade. Auth refactored, migrations isolated, Sentry monitoring active.
**Monetization**: ✅ **STABLE** — Stripe live, tier enforcement working, usage counters accurate, pricing page active.
**User traction**: 🟡 **7+ paying users** (up from 7 estimated 4 weeks ago—growth flatlined or slow).
**Feature momentum**: 🟡 Chat MVP works, but Phase 2-3 features still incomplete (Canvas sync not yet deployed).
**Technical debt**: 📉 **Improving** — Auth refactored, migrations fixed, widget removed. This is the right priority.

### 🔥 Top Priorities (CRITICAL — Unblock institutional growth)

1. **[VERIFY: This week] End-to-end test Chat feature with 5+ existing users** (2-3 hours)
   - Recent commits fixed chat migration transactions + limit enforcement
   - **Critical verification checklist**:
     - ✅ Free users: Can send 10 messages/week, see counter, get 429 on 11th message
     - ✅ Pro users: Can send messages without limits, counter shows disabled
     - ✅ Weekly reset: Counter resets on Sunday (or your reset day)
     - ✅ Streaming: AI responses stream + render markdown correctly
     - ✅ Graceful degradation: If OpenAI API down, show "Chat unavailable" not 500 error
   - **Test with**: 2 free accounts + 2 pro accounts + 1 edge case (exhausted free limit)
   - **Success metric**: 5 test accounts chat without crashes or limit errors
   - **Timeline**: Complete by May 28; document findings in CHAT_VERIFICATION.md

2. **[BUILD: Next 2 weeks] Implement Canvas LMS auto-sync as institutional unlock** (6-8 hours)
   - This is THE feature that differentiates ClassMate from Notion/Todoist
   - Current state: Plan exists in plan.md (Phase 2); iCal parsing code exists
   - What's needed:
     - (a) UI: Settings page → "Connect Canvas" button
     - (b) Flow: User enters Canvas Personal Access Token → validate
     - (c) Job: Hourly sync fetches all enrolled courses → extracts deadlines → creates Deadline rows
     - (d) Dedup: Don't create duplicate deadlines if already synced
   - **Why this matters**: Registrars will ask "Can you auto-import?" on day 1 of institutional pitch. Without this, you're dead in the water.
   - **Go-to-market impact**: 100% student day-1 adoption (vs. manual syllabus upload = 20% actual usage)
   - **Timeline**: Complete by June 8 (ready for institutional pilot demo)

3. **[OUTREACH: Starting tomorrow] Launch institutional pilot campaign** (3-5 hours this week)
   - Target: 2-3 universities (start with College of Charleston, Clemson, or South Carolina since you're local/connected)
   - Research: Find registrar email address + 1-2 CS/Engineering department heads
   - Email template:
     ```
     Subject: Free pilot—AI study assistant with institutional calendar sync
     
     Hi [Registrar Name],
     
     ClassMate is an AI study assistant that auto-syncs with your institutional calendar 
     and deadlines. We're piloting with universities to validate adoption.
     
     For a pilot class or department (500-1000 students): 
     - 30 days free for students
     - Auto-import all Canvas deadlines
     - AI chat for study help + deadline tracking
     
     Interested? I can do a 15-min demo this week.
     
     [Your name]
     ```
   - **Goal**: Get 1 "yes" for pilot by May 31; launch pilot with 100+ students by June 15
   - **Success metric**: Pilot agreement signed + 5+ students actively using chat by June 15
   - **TAM unlock**: 1 university pilot = $50K-500K/year institutional revenue vs. $5/month per student freemium

### 💡 Opportunities

- **Study group collaboration** — Backend already tracks `user_id` per flashcard/deadline. Build: (a) "Share study group" button → generates join code, (b) friends enter code → see shared deadlines + collaborate on edits. Creates network effects + 2-3x stickiness. Estimated: 2 sprints (1-2 weeks).

- **Batch AI quiz generation as premium feature** — Users upload syllabus → auto-generate 5-10 practice quizzes. Price as $5/mo add-on (or include in Pro). Estimated: 3-4 hours. High-value quick win.

- **Enterprise licensing model** — Position as "$500/mo for unlimited students" for schools, tutoring centers, corporate L&D. Institutions would pay this. Estimated: 2 weeks research + pitch development.

- **Institutional freemium (B2B2C)** — Universities pay $10K-50K/year for "unlimited students" license; students use free. This inverts the freemium model. Estimated: 3 weeks to model + price.

### ⚠️ Technical Concerns (Priority Order)

1. **Chat free tier limits may still be incorrect** — Recent commits claim "10 msg/week" fixed, but need independent verification. Test 2 free accounts: ensure counter resets weekly (not monthly), UI shows "X/10", and 429 fires on 11th message. Estimated: 30 min to verify, 1-2 hours to fix if still broken.

2. **Database indexes missing on high-query tables** — `GET /deadlines` and `GET /flashcards` likely full table scans. Add indexes:
   ```sql
   CREATE INDEX idx_deadlines_user_completed ON deadlines(user_id, completed);
   CREATE INDEX idx_flashcards_user_id ON flashcards(user_id);
   CREATE INDEX idx_chat_messages_conversation_user ON chat_messages(conversation_id, user_id);
   ```
   Prevents O(n) queries as user base grows. Estimated: 15 min.

3. **Cascade deletes partially missing** — User deletion doesn't cascade to flashcards, summaries, chat_messages, quizzes (orphaned records accumulate). Add `ON DELETE CASCADE` to all FK constraints:
   ```sql
   ALTER TABLE flashcards ADD CONSTRAINT fk_flashcards_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
   [repeat for summaries, chat_messages, etc]
   ```
   Estimated: 1-2 hours.

4. **Rate limiting still incomplete** — `/chat/send` has a rate limiter, but per-user quotas may not be enforced. Users could DOS endpoint. Verify: `slowapi` limiter uses `user_id` + timestamp to enforce "X calls/min per user". If not, add. Estimated: 1 hour.

5. **Debug logging in production** — `GET /deadlines` and other endpoints have `print()` calls. Replace with `logger.debug()` gated on `os.getenv('ENV') == 'dev'`. Estimated: 30 min.

6. **Sentry alerts not configured** — Sentry DSN is set, but no Slack/email alerts wired. Set up Slack integration in Sentry dashboard (free tier, 15-min setup). Estimated: 15 min.

### Recent Commits (Since April 27)

✅ Critical audit fixes: pricing accuracy, delete account safety, hallucination guards in AI
✅ Two critical chat issues: tool creation, proactive gate, limit warning
✅ AuthProvider state sync after login/signup before routing
✅ Lock file update after Crow widget removal
✅ Refresh token invalidation fix after password reset
✅ Switch to native JWT + dual-auth fallback for legacy Supabase users
✅ Replace Supabase auth with native JWT (migration complete)
✅ Fix passlib → direct bcrypt + legacy user login UX
✅ Database transaction isolation for ALTER TABLE safety
✅ Remove Crow widget (unmaintained dependency)
✅ Password reset email domain fix (onboarding@resend.dev)
✅ Open chat to free tier (10 msg/week limit + upgrade card)

**Assessment**: Exceptional technical quality. 15 commits in 4 weeks = careful, deliberate shipping. Focus shifted from "features" to "reliability," which is exactly right for a product with 7 paying users. You've stabilized monetization and reduced technical debt. Now unblock growth via institutional adoption.

---

## 📊 Cross-Project Analysis

| Metric | Advocate | ClassMate |
|--------|----------|-----------|
| **Commits (Apr 27-May 25)** | 7 | 15 |
| **Commits/day** | 0.7 | 1.5 |
| **Code quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Deployment ready** | ✅ Yes | ✅ Yes |
| **Monetization** | 🔴 Not started | ✅ Live (Stripe) |
| **Revenue traction** | $0 | ~$100-200/mo (7+ users @ $20/6mo) |
| **User validation** | 0 external users | 7+ paying, feedback being collected |
| **Product focus** | UI polish + features | Stability + institutional growth |
| **Next 2 weeks priority** | **DECIDE business model** | **Deploy Canvas sync + institutional pilot** |

### Market Positioning

**Advocate (truefit-meds)**:
- **Market**: 65M+ US caregivers, highly defensible low-competition segment
- **Competitive advantage**: Clinical summary quality + caregiver UX + medication tracking
- **Risk**: No healthcare provider validation; unclear if doctors will pay for summaries
- **Go-to-market**: **Choose one**: B2B (healthcare providers), B2C (freemium caregivers), or Corporate wellness
- **Recommendation**: Pursue B2B first (healthcare providers = higher LTV, lower churn). Validate with 3 doctor interviews by May 31.

**ClassMate (syllabusync)**:
- **Market**: ~20M US college students (crowded: Notion, Todoist, Canvas, Obsidian)
- **Competitive advantage**: AI chat + institutional calendar sync + deadline tracking
- **Risk**: Individual freemium conversion is hard; students expect free tools
- **Go-to-market**: **Shift focus**: Institutions > individual students. 1 university pilot = 10-50x TAM unlock
- **Recommendation**: Deploy Canvas sync (2 weeks), then launch institutional pilot (target 1 university by June 15)

---

## 🎯 Resource Allocation & Timeline (Next 2 Weeks)

### Week 1 (May 26-Jun 1) — Decision & Validation

**Advocate (40% effort, 10-12 hours)**:
1. ✅ **Pick ONE monetization model** (1 hour, EOD Tue May 26)
   - Document in `MONETIZATION.md` with 3-5 sentence reasoning + pricing model
   - Recommended: B2B healthcare providers (small TAM but high LTV)
2. ✅ **Implement tier gating for PDF export** (2-3 hours, by Thu May 28)
   - Gate endpoint, add `<PremiumCTA>` component, test end-to-end
3. ✅ **Identify + reach out to 3 target customers** (2-3 hours, by Fri May 29)
   - Email healthcare providers (if B2B), caregiver communities (if B2C), or HR contacts (if corporate)
   - Goal: 1-2 responses by EOW
4. ✅ **Fix 7-day token expiry** (1-2 hours, by Fri May 29)
   - Implement JWT refresh pattern to prevent auto-logout
5. ✅ **Add database tier schema** (15 min, by Fri May 29)
   - Prep work for Stripe integration

**ClassMate (60% effort, 14-16 hours)**:
1. ✅ **Verify Chat feature end-to-end** (2-3 hours, by Wed May 27)
   - Test with 5 accounts: free tier limits, weekly reset, Pro unlimited
   - Document findings in CHAT_VERIFICATION.md
2. ✅ **Deploy Canvas LMS auto-sync** (6-8 hours, by Fri May 31)
   - UI: Settings → "Connect Canvas" button
   - Job: Hourly sync fetches deadlines → creates Deadline rows
   - Test: Verify 5 deadlines auto-import from test course
3. ✅ **Research institutional contacts** (2-3 hours, by Fri May 31)
   - Find 3 university registrars (start with CofC, Clemson, USC)
   - Draft institutional pilot email template
4. ✅ **Fix database indexes + cascade deletes** (1.5 hours, by Thu May 28)
   - Add missing indexes on `(user_id, completed)` for deadlines + flashcards
   - Add `ON DELETE CASCADE` to orphaned data constraints

### Week 2 (Jun 1-8) — Launch & Validation

**Advocate (30% effort)**:
- Gather feedback from 3 customer conversations
- Iterate on pricing based on feedback
- Prepare for beta launch (private or public depending on model chosen)

**ClassMate (70% effort)**:
- Send institutional pilot outreach (5+ universities)
- Target: 1 "yes" for pilot by Jun 8
- Plan demo with Canvas sync working live
- Prepare materials: ROI deck, student adoption benchmarks, feature list

---

## 🎯 Key Decisions Needed This Week

### For Advocate:
1. **[TODAY] Pick ONE monetization model** (B2B healthcare, B2C freemium, or corporate wellness)
   - Deadline: EOD Tuesday May 26
   - Impact: Unblocks tier gating, beta launch, customer outreach
   - Recommended: B2B healthcare providers (validate doctor interest by May 31)

2. **[This week] Launch private/public beta?**
   - If B2B: Private beta with 3 healthcare providers (30-day pilot)
   - If B2C: Public beta on Product Hunt + caregiver communities
   - Timeline: Ready by Jun 1 (after tier gating + refresh token fix)

### For ClassMate:
1. **[This week] Commit to institutional adoption as primary strategy?**
   - Current: Individual student freemium (7 users, ~$100/mo revenue)
   - Pivot: Institutional partnerships (1 university = $10K-50K/year, 100+ day-1 users)
   - Recommended: YES. Deploy Canvas sync + launch institutional pilot (June 1-15)

2. **[By Jun 8] Secure pilot agreement with 1 university?**
   - Target: 100+ students, 30-day free trial
   - Demo: Canvas auto-sync + AI chat working live
   - Success metric: 10+ daily active students by Jun 15

---

## ⚠️ Red Flags & Risks

### Advocate:
- **4-week monetization gap is unsustainable** — Every day without a business model is a day of opportunity cost. Product-only shipping is procrastination. Make the business decision TODAY or officially reprioritize this project for Q3.
- **No customer validation** — Zero healthcare provider conversations means you're optimizing blind. The clinical summary feature (your main differentiator) might be solving a problem nobody pays for. Validate with 3 providers ASAP.
- **Auth token expiry will break beta** — Caregivers won't log back in after 7 days if they see login screen. Fix this before launch or you'll lose users unnecessarily.

### ClassMate:
- **Chat limits may still be broken** — Recent commits claim fixes, but unverified. A broken free tier limit hurts both revenue (users consume faster than expected) and trust. Test thoroughly this week.
- **Institutional growth requires Canvas sync** — Without auto-import, you're just another task manager. Registrars won't pilot you without this. Make it Week 1 priority.
- **Only 7+ paying users in 8 weeks** — Revenue is validating but growth is slow. Institutional adoption is the only lever that changes this trajectory. Focus there, not on individual freemium optimization.

---

## Next Actions (Ordered by Impact)

### Advocate (This Week)

1. **[30 min] DECISION: Pick monetization model** → Write `MONETIZATION.md`
2. **[2-3 hrs] Implement tier gating for PDF** → Test end-to-end by May 28
3. **[1-2 hrs] Fix 7-day token expiry** → JWT refresh pattern
4. **[2-3 hrs] Validate 3 target customers** → Email outreach, gather feedback
5. **[15 min] Add tier schema to database** → Prep for Stripe

### ClassMate (This Week)

1. **[2-3 hrs] Verify Chat end-to-end** → Test with 5 accounts, document in CHAT_VERIFICATION.md
2. **[6-8 hrs] Deploy Canvas LMS auto-sync** → Settings UI + hourly job + test
3. **[2-3 hrs] Research institutional contacts** → Find 3 registrars, draft email
4. **[1.5 hrs] Fix database indexes + cascades** → Add missing constraints

---

## Files to Create/Update

### Advocate

- **NEW**: `MONETIZATION.md` — Business model decision + reasoning (3-5 paragraphs)
- **UPDATE**: `backend/models.py` — Add `tier`, `stripe_subscription_id`, `subscription_period_end` to User model
- **UPDATE**: `app/components/PremiumCTA.tsx` — Reusable premium gate component
- **UPDATE**: `backend/routers/summary.py` — Add tier check to `/summary/pdf`
- **UPDATE**: `backend/auth.py` — Add refresh token endpoint + logic

### ClassMate

- **NEW**: `CHAT_VERIFICATION.md` — Test results for free/pro tier limits, streaming, reset logic
- **UPDATE**: `Backend/main.py` — Implement Canvas Personal Access Token connection + validation
- **NEW**: `Backend/routers/lms.py` — Canvas sync endpoint + hourly job scheduler
- **UPDATE**: `Backend/main.py` — Add missing database indexes on `(user_id, completed)` for deadlines
- **UPDATE**: `Backend/main.py` — Add `ON DELETE CASCADE` to FK constraints
- **UPDATE**: `Frontend/app/settings/page.tsx` — Add "Connect Canvas" button + flow
- **UPDATE**: `.env.example` — Document Canvas API token requirement

---

## Summary Table

| Project | Status | Velocity | Monetization | Traction | Next Milestone |
|---------|--------|----------|--------------|----------|----------------|
| **Advocate** | ⭐⭐⭐ (Polish) | 0.7 /day | 🔴 Not started | 0 users | Choose business model + tier gating (May 26-28) |
| **ClassMate** | ⭐⭐⭐⭐ (Stable) | 1.5 /day | ✅ Live ($100/mo) | 7+ paying | Deploy Canvas sync + institutional pilot (Jun 1-15) |

---

## Observations & Recommendations

### On Advocate:
The 4-week monetization gap is a decision problem, not an execution problem. You've built a beautiful product, but beauty doesn't pay bills. **Make the business model choice by EOD Tuesday (May 26)**, implement tier gating by Thursday, and validate with 3 customers by Friday. This week is make-or-break for this project's credibility.

**Recommended path**: B2B healthcare providers. TAM is smaller, but your clinical summary feature is genuinely differentiated. Validate doctor interest—if positive, pursue enterprise sales; if negative, pivot to B2C freemium by June 15.

### On ClassMate:
You've done excellent technical work stabilizing the product (JWT migration, transaction isolation, debt reduction). Now **unlock growth via institutions**. The Canvas sync is the missing feature that makes registrars say "yes." Deploy it this week, then launch institutional pilot (Jun 1-15). One university = 100+ day-1 users + $10K-50K/year potential. That's 10-50x better than current individual freemium trajectory.

### On Both:
- **Advocate needs a decision, not more features** — Every feature shipped without a business model is technical debt
- **ClassMate needs institutional adoption, not UI polish** — The product works; scale via B2B2C, not B2C
- **Both need customer feedback loops** — Advocate has 0 healthcare conversations; ClassMate has 7 users but unclear if feedback is being tracked. Build weekly feedback review into your routine

---

**Report generated**: May 25, 2026, 10:30 AM (Monday morning review)
**Next review**: June 1, 2026 (monetization decision verification + institutional pilot launch readiness)

---

## Appendix: Commit Analysis

### Advocate (Apr 27 - May 25): 7 commits
- Feature shipping: Socialization tracking, treatment plans, patient settings
- Quality work, but all in product roadmap, zero in business roadmap
- Missing: Monetization, tier gating, customer validation

### ClassMate (Apr 27 - May 25): 15 commits
- Technical debt reduction: JWT migration, password reset fixes, transaction isolation
- Monetization stability: Chat limits corrected, pricing accuracy verified
- Growth work: Database cleanup, Crow widget removal, audit fixes
- Missing: New feature velocity (Canvas sync not yet deployed, institutional pilot not launched)

### Interpretation:
- Advocate is executing a **product roadmap** (features nobody pays for)
- ClassMate is executing a **business roadmap** (stabilizing monetization, reducing debt)
- Advocate needs a **business decision** to resume aligned shipping
- ClassMate needs **institutional growth work** to accelerate beyond 7 users
