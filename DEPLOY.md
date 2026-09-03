# Deploying Advocate

Two services, deployed separately from this one repo:

| | Platform | Root | Serves |
|---|---|---|---|
| Frontend | Vercel | repo root | Next.js static export |
| Backend | Railway | `backend/` | FastAPI + Postgres |

**No secret belongs in this repo.** Every value below is set in the Railway or
Vercel dashboard. The only env files here are `.env.example` and
`backend/.env.example`, both placeholders.

---

## Backend — Railway

You already have a working Railway service and Postgres instance. Nothing about
this repo change touches them: Railway deploys from whatever repo you point the
service at, and the environment variables live on the service, not in git.

To move the existing service onto this repo: **Service → Settings → Source →
disconnect the old repo, connect this one, set root directory to `backend/`.**
The env vars, the database, and the public URL all survive that. Redeploy.

Variables the service needs (all already set on your existing service — this is
the checklist, not a list of things to create):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Railway injects this from the linked Postgres. Don't set it by hand. |
| `SECRET_KEY` | JWT signing key. See the rotation note below. |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) |
| `OPENAI_API_KEY` | Summaries. |
| `OPENAI_MODEL` | `gpt-4.1-mini` |
| `ALLOWED_ORIGINS` | **Needs editing — see below.** |
| `ALLOWED_ORIGINS_REGEX` | `https://.*\.vercel\.app` |
| `RESEND_API_KEY` | Password-reset email. |
| `RESEND_FROM_EMAIL` | |
| `FRONTEND_URL` | Used to build reset links. **Needs editing — see below.** |

### The two that will actually break

A new repo means a new Vercel project, which means a **new production domain**.
Two backend variables are pinned to the old one:

- `ALLOWED_ORIGINS` currently lists `https://truefit-meds.vercel.app`. Add the
  new production domain. Keep `http://localhost:3000` and
  `capacitor://localhost` (the iOS wrapper needs it).
- `FRONTEND_URL` points at the old domain, so password-reset emails would send
  people to the old deployment. Update it.

`ALLOWED_ORIGINS_REGEX` already covers `*.vercel.app`, so preview deployments
keep working, but the regex does not cover a custom domain if you add one later.

---

## Frontend — Vercel

New project → import this repo → framework preset Next.js → root directory `.`.

One environment variable:

- `NEXT_PUBLIC_API_URL` = your Railway backend URL
  (currently `https://truefit-meds-production.up.railway.app`)

Set it for Production, Preview, and Development. It is not a secret —
`NEXT_PUBLIC_*` gets inlined into the browser bundle by design — but it belongs
in the dashboard rather than in git so the three environments can differ.

`vercel.json` carries one redirect (`/reset-password` → `/reset-password/`),
needed because `trailingSlash: true` plus a static export otherwise 404s the
link in reset emails.

---

## After the first deploy: check the new table

The clinician merge added `patient_share_codes`. The startup block in
`backend/main.py` runs column-level migrations only (`ALTER TABLE ... ADD COLUMN
IF NOT EXISTS`); new tables come from `Base.metadata.create_all`, which does run
on boot and does create missing tables. It should appear on its own — but
confirm it did before you hand a share code to anyone:

```sql
select * from patient_share_codes limit 1;
```

If it's missing, the deploy didn't restart cleanly.

---

## Local development

```bash
cp .env.example .env.local          # then point it at localhost:8000
npm install
npm run dev:web                     # :3000
npm run dev:backend                 # :8000
```

Backend needs its own `backend/.env` from `backend/.env.example`.

Phone / Omnara preview, which routes everything through one port:

```bash
npm run dev:web:phone               # NEXT_PUBLIC_API_URL=/backend
npm run dev:backend
npm run dev:proxy                   # :3001
```

Note that `main.py`'s startup migrations use Postgres-only syntax
(`ADD COLUMN IF NOT EXISTS`), so the backend cannot boot against SQLite. Local
dev needs a real Postgres.

---

## Rotate these

The archive you handed me contained a `.env.local.example` holding live values:
an OpenAI project key, the Railway Postgres connection string including its
password, and the JWT `SECRET_KEY`.

I checked all 1,426 objects in the git history and **none of them were ever
committed** — the tracked version of that file only ever held
`NEXT_PUBLIC_API_URL=http://localhost:8000`, and the file was untracked in
February. So nothing leaked to GitHub.

They did still travel outside your machine in a file upload, and one of them
signs the auth tokens for an app holding patient data. Rotating all three is
cheap:

1. **`SECRET_KEY`** — generate a new one (`openssl rand -hex 32`), set it on
   Railway. Every existing session is invalidated and users re-log-in once.
2. **OpenAI key** — revoke and reissue in the OpenAI dashboard.
3. **Postgres password** — Railway can rotate the credential; `DATABASE_URL` is
   injected, so it updates itself.

That file no longer exists in this repo. There is one `.env.example` at the root
and one at `backend/.env.example`, both placeholders.
