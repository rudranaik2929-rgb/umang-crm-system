# Umang Properties — Real Estate CRM

Premium real-estate workflow management dashboard. Lead Capture → Telecaller → Site Visit → Booking → Loan → Closed.

Start with [`UNDERSTAND.md`](./UNDERSTAND.md) for the handover map, folder guide, and where to add new code.
Full older system notes are in [`docs/PROJECT_DOCS.md`](./docs/PROJECT_DOCS.md).

## Quick start (local)

```bash
# Terminal 1 — Backend (FastAPI)
cd backend
pip install -r requirements.txt
# backend/.env should contain SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY, INTERAKT_API_KEY as needed.
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — Frontend (Expo Web)
cd frontend
npm install
# frontend/.env must contain: EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
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

See [`UNDERSTAND.md`](./UNDERSTAND.md) for the current folder structure and code ownership guide.

<!-- Rebuild trigger: 2026-05-14T22:35:00Z -->
