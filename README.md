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
POST https://api.umanghometechllp.in/api/housing/webhook
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
GET/POST https://api.umanghometechllp.in/api/facebook/webhook
Verify token: UMANGCRM123
```

Set `FACEBOOK_PAGE_ACCESS_TOKEN` so the backend can retrieve full lead fields from each `leadgen_id`.

**New Meta leads only:** inbound leads arrive via the Facebook webhook. `POST /api/integrations/facebook/import` and Integrations → **Sync New Meta Leads** only cover the recent Graph window (`FACEBOOK_AUTO_SYNC_WINDOW_SEC`, default 2h). Historical / 90-day Meta backfill is disabled.

Optional env: `FACEBOOK_PAGE_ID`, `FACEBOOK_FORM_ID` if auto-detect fails.

Every POST to `/api/facebook/webhook` is:

1. Logged to server stdout (`Facebook webhook POST received…`)
2. Saved in `integration_events` (`webhook_received`, `leadgen_received`, `graph_fetched`, `created`)
3. Fetched via Graph API using `leadgen_id`
4. Inserted into `leads` with `source = Facebook` (visible on Dashboard → Total Leads → Meta)

Debug recent events: `GET /api/integrations/facebook/events` (admin/manager/marketing).

## Deployment

Production domains:

| Service | URL |
|--------|-----|
| CRM web app (frontend) | [https://umanghometechllp.in](https://umanghometechllp.in) |
| API (backend) | `https://api.umanghometechllp.in` |

- Backend: `backend/Dockerfile` → Render (`render.yaml` blueprint). Add custom domain **`api.umanghometechllp.in`** in Render → Settings → Custom Domains.
- Frontend: deploy `frontend/` on Vercel. Add **`umanghometechllp.in`** and **`www.umanghometechllp.in`** in Vercel → Project → Settings → Domains.
- Database: run `supabase/final_schema.sql` (or `supabase/schema.sql`) in Supabase SQL Editor before first production traffic.
- Local stack: `docker compose up --build`.

### Where you update the domain (your side)

**1. Domain registrar (where you bought umanghometechllp.in)**

Add DNS records (exact values come from Vercel / Render after you add each custom domain):

| Host | Type | Points to |
|------|------|-----------|
| `@` | A or CNAME | Vercel (for `https://umanghometechllp.in`) |
| `www` | CNAME | Vercel (for `https://www.umanghometechllp.in`) |
| `api` | CNAME | Render (for `https://api.umanghometechllp.in`) |

**2. Vercel (frontend CRM)**

- Project → **Settings → Environment Variables**  
  `EXPO_PUBLIC_BACKEND_URL` = `https://api.umanghometechllp.in`
- Project → **Settings → Domains** → add `umanghometechllp.in` and `www.umanghometechllp.in`
- Redeploy after changing env vars.

**3. Render (backend API)**

- Service → **Environment**  
  `CORS_ORIGINS` = `https://umanghometechllp.in,https://www.umanghometechllp.in`  
  `FRONTEND_URL` = `https://umanghometechllp.in`  
  `COOKIE_SECURE` = `true`
- Service → **Settings → Custom Domains** → add `api.umanghometechllp.in`
- Redeploy after env changes.

**4. Housing.com webhook**

```text
POST https://api.umanghometechllp.in/api/housing/webhook
```

**5. Meta (Facebook) Lead Ads webhook**

```text
GET/POST https://api.umanghometechllp.in/api/facebook/webhook
Verify token: UMANGCRM123
```

Update the callback URL in [Meta for Developers](https://developers.facebook.com/) → your app → Webhooks.

**6. Local dev (`frontend/.env`)**

```text
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

Until `api.umanghometechllp.in` DNS is live, set **Vercel** `EXPO_PUBLIC_BACKEND_URL` to:

```text
https://umang-crm-systemumang-home-tech.onrender.com
```

### Login not working — checklist

1. **Vercel** `EXPO_PUBLIC_BACKEND_URL` must point to a working API (Render URL until `api.umanghometechllp.in` DNS exists).
2. **Render** redeploy after changing `CORS_ORIGINS` — live server must allow `https://umanghometechllp.in` and `https://www.umanghometechllp.in`. Check: open `https://umang-crm-systemumang-home-tech.onrender.com/debug-config` and confirm those domains appear under `cors_origins`.
3. **Render** add `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API → `service_role` secret). Anon key alone may block employee logins.
4. **Render** set `JWT_SECRET` to a long random string (not `YOUR_RANDOM_SECRET`).
5. **www vs non-www:** If users open `https://www.umanghometechllp.in`, Render **must** allow that origin in CORS (not only the apex domain). Use:
   `CORS_ORIGINS=https://umanghometechllp.in,https://www.umanghometechllp.in`
6. Admin test login: email `htshpatil13@gmail.com`, password `umang@admin` (all lowercase).
7. Employee logins use the password the manager set when creating the employee.

See [`UNDERSTAND.md`](./UNDERSTAND.md) for the folder structure and code ownership guide.