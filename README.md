# Umang Hometech LLP — Real Estate CRM

Premium real-estate workflow management dashboard. Lead Capture → Telecaller → Site Visit → Booking → Loan → Closed.

Start with [`UNDERSTAND.md`](./UNDERSTAND.md) for the handover map, folder guide, and where to add new code.
Full older system notes are in [`docs/PROJECT_DOCS.md`](./docs/PROJECT_DOCS.md).

## Quick start (local)

```bash
# Terminal 1 — Backend (FastAPI)
cd backend
pip install -r requirements.txt
# Copy backend/.env.example to backend/.env and set Supabase, JWT, Facebook, and Housing credentials.
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — Frontend (Expo Web)
cd frontend
npm install
# Copy frontend/.env.example to frontend/.env.
npm run web
```

Open the Expo web URL shown in the terminal.

## What's inside
- **Backend entry**: `backend/server.py` compatibility wrapper.
- **Backend app**: `backend/app/main.py` (FastAPI + Supabase/PostgREST + Local Auth)
- **Frontend**: `frontend/app/` (Expo Router screens) + `frontend/src/` (theme, auth, components)
- **Docs**: `UNDERSTAND.md` first, then `docs/`
- **Scripts**: `scripts/demo/` for demo data and `scripts/scratch/` for old debugging utilities
- **Roles**: admin · manager · telecaller · site_visit · booking · loan · marketing

## Integrations

### Housing.com

Use this endpoint in Housing.com when configuring real-time lead delivery:

```text
POST https://your-backend-domain.com/api/housing/webhook
```

Required backend environment:

```text
HOUSING_PROFILE_ID=2548773
HOUSING_ENCRYPTION_KEY=<secret from Housing.com>
HOUSING_INTEGRATION_UUID=<integration uuid from Housing.com>
HOUSING_WEBHOOK_SECRET=<same uuid or separate webhook secret>
```

The backend also supports Housing.com's pull API at:

```text
POST /api/housing/sync
```

That route signs requests with HMAC-SHA256 over `current_time` using `HOUSING_ENCRYPTION_KEY`, then imports returned leads as source `Housing.com`.

Housing leads are **real enquiries** from the Housing.com API (name, phone, project, locality). Each row stores `source = Housing.com` and the original payload in `raw_payload` — the CRM does not seed dummy Housing leads.

**Supabase SQL** (run in SQL Editor if you set up manually):

1. `supabase/schema.sql` — full schema
2. `supabase/migrations/20260529_housing_integration_rls.sql` — RLS policies for `leads` and `integration_events`

Set `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` for production webhook/sync writes.

### Facebook Lead Ads

Configure Meta Webhooks with:

```text
GET/POST https://your-backend-domain.com/api/facebook/webhook
Verify token: UMANGCRM123
```

Set `FACEBOOK_PAGE_ACCESS_TOKEN` so the backend can retrieve full lead fields from each `leadgen_id`.

## Deployment

- Backend: `backend/Dockerfile` is ready for Render/Railway. `render.yaml` includes the Render service blueprint.
- Frontend: deploy `frontend/` on Vercel with `EXPO_PUBLIC_BACKEND_URL=https://your-backend-domain.com`.
- Database: run `supabase/schema.sql` in Supabase SQL Editor before first production traffic.
- Local stack: `docker compose up --build`.

See [`UNDERSTAND.md`](./UNDERSTAND.md) for the current folder structure and code ownership guide.

<!-- Rebuild trigger: 2026-05-14T22:35:00Z -->
<!-- current client's project of crm system

umang-home-tech.vercel.app 

Credentials: htshpatil13@gmail.com 
Umang@admin -->