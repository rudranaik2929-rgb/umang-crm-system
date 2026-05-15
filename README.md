# Umang Properties — Real Estate CRM

Premium real-estate workflow management dashboard. Lead Capture → Telecaller → Site Visit → Booking → Loan → Closed.

📖 **Full system documentation**: see [`PROJECT_DOCS.md`](./PROJECT_DOCS.md)

## Quick start (local)

```bash
# Terminal 1 — MongoDB
mongod --dbpath ./data/db

# Terminal 2 — Backend (FastAPI)
cd backend
pip install -r requirements.txt
# backend/.env must contain: MONGO_URL=mongodb://localhost:27017  DB_NAME=umang_crm
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 3 — Frontend (Expo Web)
cd frontend
yarn install
# frontend/.env must contain: EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
yarn start          # press 'w' for web
```

Open `http://localhost:3000` → sign in with Google → first user becomes admin.

## What's inside
- **Backend**: `backend/server.py` (FastAPI + MongoDB + Local Auth)
- **Frontend**: `frontend/app/` (Expo Router screens) + `frontend/src/` (theme, auth, components)
- **Admin PIN**: `9999` (gates the Admin Analytics page; configurable in `frontend/app/(app)/admin-analytics.tsx`)
- **Roles**: admin · telecaller · site_visit · booking · loan · marketing

See [`PROJECT_DOCS.md`](./PROJECT_DOCS.md) for the full architecture, API, models, workflow handoff matrix, and scoring formulas.

<!-- Rebuild trigger: 2026-05-14T22:35:00Z -->
