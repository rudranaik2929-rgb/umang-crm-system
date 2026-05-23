# Umang CRM Handover Guide

This file is the first-read guide for continuing the Umang Properties CRM project.
It explains the current folder structure, active code, legacy code, languages used,
where to add new files, and the safest way to make changes without breaking logic.

## 1. What This Project Does

Umang CRM is a real estate workflow system.

Business flow:

```text
Public Enquiry -> Telecaller -> Site Visit -> Booking -> Loan -> Closed
                         |
                         -> Negative Leads / future remarketing
```

Main users:

- Admin: sees everything, employees, analytics, tracking, all leads.
- Manager: management view with reduced revenue visibility.
- Telecaller: works new/assigned leads.
- Site visit team: schedules/completes visits.
- Booking team: manages token, agreement, brokerage, registration states.
- Loan team: manages loan setup, sanction, disbursal.
- Marketing: negative leads and campaign-related work.

## 2. Current Important Truth

The active backend is Supabase/PostgREST, not MongoDB.

Some old docs and tests still mention MongoDB because this project had an older
backend version. Those files are preserved for reference only.

Active backend source of truth:

```text
backend/app/main.py
```

Compatibility backend entry point:

```text
backend/server.py
```

Do not delete `backend/server.py`. Deployment commands may still use:

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

## 3. Clean Folder Structure

Current structure after cleanup:

```text
umang-crm-system/
|-- README.md
|-- UNDERSTAND.md
|-- backend/
|   |-- app/
|   |   |-- __init__.py
|   |   `-- main.py                  # Active FastAPI app and all current backend logic
|   |-- legacy/
|   |   |-- server_mongo.py          # Old MongoDB backend, not active
|   |   |-- server_mongo_backup.py   # Old MongoDB backup, not active
|   |   |-- umang.py                 # Old Flask/Twilio/OpenAI experiment, not active
|   |   `-- install-output-httpx.txt # Old command output, kept only for history
|   |-- scripts/
|   |   `-- setup_supabase.py        # Supabase table setup/seed script
|   |-- tests/                       # Backend API tests, currently partly legacy/remote-oriented
|   |-- requirements.txt
|   `-- server.py                    # Compatibility wrapper importing backend/app/main.py
|-- docs/
|   |-- PROJECT_DOCS.md              # Older project docs, read after this file
|   |-- PRD.md                       # Product requirements notes
|   |-- auth_testing.md              # Old auth testing notes
|   `-- design_guidelines.json       # Visual/design direction
|-- frontend/
|   |-- app/                         # Expo Router pages/screens
|   |-- src/
|   |   |-- auth/                    # Auth provider/context
|   |   |-- components/              # Reusable UI components
|   |   |-- lib/                     # API client, constants, role access
|   |   `-- theme/                   # Theme tokens and theme context
|   |-- assets/                      # Images/fonts/icons
|   |-- package.json
|   |-- tsconfig.json
|   `-- vercel.json
|-- scripts/
|   |-- demo/                        # Demo data/import helper scripts
|   `-- scratch/                     # Debug/repair one-off scripts. Use carefully.
|-- supabase/
|   `-- schema.sql                   # Full Supabase CRM schema and migration-safe columns
|-- test_reports/                    # Historical test outputs
`-- test_result.md                   # Testing-agent protocol/history
```

## 4. Languages Used

Python:

- Backend API: `backend/app/main.py`
- Supabase setup: `backend/scripts/setup_supabase.py`
- Backend tests: `backend/tests/`
- Demo/scratch scripts: `scripts/demo/`, `scripts/scratch/`

TypeScript / TSX:

- Frontend screens: `frontend/app/`
- Reusable frontend code: `frontend/src/`

JavaScript:

- Frontend tooling scripts/config: `frontend/eslint.config.js`, `frontend/scripts/reset-project.js`

JSON:

- Expo config: `frontend/app.json`
- Package metadata: `frontend/package.json`
- Design config: `docs/design_guidelines.json`
- Vercel routing: `frontend/vercel.json`

Markdown:

- Project docs and handover files: `README.md`, `UNDERSTAND.md`, `docs/`

SQL:

- Full database schema: `supabase/schema.sql`
- Older setup helper: `backend/scripts/setup_supabase.py`

## 5. Backend Code Map

Active file:

```text
backend/app/main.py
```

Current backend is still a single FastAPI file internally, but it now lives in a
proper backend package so it can be split later without changing deployment.

Inside `backend/app/main.py`, search these section markers:

```text
# ---- Integration Config (from .env) ----
# ---- Supabase Config ----
# ---- Pydantic Models ----
# ---- Auth Helpers ----
# ---- Auth Endpoints ----
# ---- WhatsApp Service Layer (Interakt) ----
# ---- AI Assistant Service ----
# ---- Assignment Engine (Round Robin) ----
# ---- Activity Logger ----
# ---- Leads ----
# ---- Webhooks ----
# ---- Stage Sync Helper ----
# ---- Visits ----
# ---- Bookings ----
# ---- Loans ----
# ---- Employees ----
# ---- Templates & Campaigns ----
# ---- Stats / Dashboard ----
# ---- Health & Wiring ----
```

Main backend route groups:

- Auth: `/api/auth/session`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/set-role`, `/api/auth/act-as`, `/api/auth/ping-location`
- Leads: `/api/leads/public`, `/api/leads`, `/api/leads/import`, `/api/leads/{lead_id}`, `/api/leads/{lead_id}/notes`, `/api/leads/{lead_id}/advance`
- Webhooks: `/api/webhooks/facebook`, `/api/webhooks/{source}`, `/api/webhooks/whatsapp/reply`
- Visits: `/api/visits`, `/api/visits/{visit_id}`
- Bookings: `/api/bookings`, `/api/bookings/{booking_id}`
- Loans: `/api/loans`, `/api/loans/{loan_id}`
- Customers: `/api/customers`
- Notifications: `/api/notifications`, `/api/notifications/{notification_id}/read`
- Employees: `/api/employees`, `/api/employees/{eid}`
- Templates/campaigns: `/api/templates`, `/api/campaigns`
- Stats/activity: `/api/stats/dashboard`, `/api/stats/dashboard/graph`, `/api/stats/leads-by-source`, `/api/stats/me`, `/api/stats/employees`, `/api/activities`

## 6. Frontend Code Map

Frontend routing is file-based through Expo Router.

Important files:

```text
frontend/app/_layout.tsx              # Root providers, privacy shield, status bar
frontend/app/index.tsx                # Login screen
frontend/app/enquire.tsx              # Public enquiry form
frontend/app/select-role.tsx          # Role chooser
frontend/app/(app)/_layout.tsx        # Authenticated app shell with sidebar
frontend/src/lib/api.ts               # Axios API client and token headers
frontend/src/lib/constants.ts         # Roles, stages, nav items, access rules
frontend/src/auth/AuthContext.tsx     # Login/logout/current user/session logic
frontend/src/theme/ThemeContext.tsx   # Theme + accent selection
frontend/src/theme/tokens.ts          # Theme colors/fonts
```

Main authenticated screens:

```text
frontend/app/(app)/dashboard.tsx
frontend/app/(app)/admin-analytics.tsx
frontend/app/(app)/admin-tracking.tsx
frontend/app/(app)/my-dashboard.tsx
frontend/app/(app)/pipeline.tsx
frontend/app/(app)/telecaller.tsx
frontend/app/(app)/visits.tsx
frontend/app/(app)/bookings.tsx
frontend/app/(app)/loans.tsx
frontend/app/(app)/employees.tsx
frontend/app/(app)/negative-leads.tsx
frontend/app/(app)/whatsapp.tsx
```

Important reusable components:

```text
frontend/src/components/TopBar.tsx
frontend/src/components/Sidebar.tsx
frontend/src/components/LeadDetailModal.tsx
frontend/src/components/AddLeadModal.tsx
frontend/src/components/ImportLeadsModal.tsx
frontend/src/components/LeadSourceModal.tsx
frontend/src/components/EmployeeMap.tsx
frontend/src/components/LineChart.tsx
frontend/src/components/Charts.tsx
frontend/src/components/Badge.tsx
frontend/src/components/EmptyState.tsx
frontend/src/components/StatCard.tsx
```

## 7. Where To Add New Code

Use this section when creating new features.

New frontend page:

```text
frontend/app/(app)/your-page.tsx
```

Then add navigation/access in:

```text
frontend/src/lib/constants.ts
```

New reusable UI component:

```text
frontend/src/components/YourComponent.tsx
```

New frontend API helper or constants:

```text
frontend/src/lib/
```

New frontend auth/session logic:

```text
frontend/src/auth/AuthContext.tsx
```

New frontend theme token/color:

```text
frontend/src/theme/tokens.ts
frontend/src/theme/ThemeContext.tsx
```

New backend endpoint today:

```text
backend/app/main.py
```

Add it near the matching section marker. For example, a lead API goes under
`# ---- Leads ----`.

New backend database/table setup:

```text
supabase/schema.sql
```

Older Supabase helper script:

```text
backend/scripts/setup_supabase.py
```

New demo data/import helper:

```text
scripts/demo/
```

One-time debugging or repair script:

```text
scripts/scratch/
```

New backend API tests:

```text
backend/tests/
```

New project documentation:

```text
docs/
```

If the documentation explains current structure or onboarding, also update:

```text
UNDERSTAND.md
```

## 8. Recommended Future Backend Split

Do not do this casually in the middle of a feature. When there is time for a
proper refactor, split `backend/app/main.py` like this:

```text
backend/app/
|-- main.py                 # Create app, CORS, include routers only
|-- core/
|   |-- config.py           # Env vars, constants, roles/stages
|   `-- database.py         # Supabase client helpers
|-- models/
|   `-- schemas.py          # Pydantic request/response models
|-- services/
|   |-- auth.py
|   |-- activities.py
|   |-- assignment.py
|   |-- ai.py
|   `-- whatsapp.py
`-- routers/
    |-- auth.py
    |-- leads.py
    |-- webhooks.py
    |-- visits.py
    |-- bookings.py
    |-- loans.py
    |-- employees.py
    |-- campaigns.py
    `-- stats.py
```

For this cleanup, the logic was not split internally to avoid accidentally
changing behavior during handover. The scalable folder boundary is now ready.

## 9. Development Commands

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Frontend:

```bash
cd frontend
npm install
npm run web
```

Python syntax check:

```bash
python3 -m py_compile backend/server.py backend/app/main.py
```

All Python files syntax check:

```bash
find . -type f -name '*.py' -not -path './.git/*' -print0 | xargs -0 python3 -m py_compile
```

Frontend type check after dependencies are installed:

```bash
cd frontend
npx tsc --noEmit
```

## 10. Environment Variables

Backend expects Supabase/OpenAI/Interakt style configuration.

Expected backend variables:

```text
SUPABASE_URL
SUPABASE_KEY
OPENAI_API_KEY
INTERAKT_API_KEY
FACEBOOK_VERIFY_TOKEN
```

Frontend expected variable:

```text
EXPO_PUBLIC_BACKEND_URL
```

Example:

```text
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

## 11. Supabase Tables

The ready-to-run SQL lives here:

```text
supabase/schema.sql
```

Use Supabase SQL Editor and run the full file. It creates or updates:

```text
roles
users
sessions
employees
leads
lead_notes
activities
visits
bookings
loans
customers
notifications
templates
campaigns
```

Compatibility views are also created for the business names:

```text
site_visits -> visits
loan_status -> loans
activity_logs -> activities
```

## 12. Workflow Status

Implemented project flow:

```text
Lead entry
-> assignment / telecaller work
-> positive lead creates site visit work
-> interested site visit creates booking work
-> confirmed booking can create loan work
-> loan approval moves to registration
-> loan disbursal / closed lead creates a customer record
-> negative leads stay in leads with status = negative for remarketing
```

The backend keeps current table names used by the frontend:

```text
visits, bookings, loans
```

The SQL also provides workflow-name views:

```text
site_visits, loan_status, activity_logs
```

## 13. Current Security Warning

This handover repo contains hardcoded service keys and demo passwords in several
backend/demo/scratch files. Before production work:

1. Rotate Supabase/OpenAI/Interakt keys.
2. Move secrets into `.env` or deployment environment variables.
3. Remove secrets from git history if this repo will be shared publicly.
4. Keep `scripts/scratch/` private or delete one-off repair scripts after use.

Important files to inspect:

```text
backend/app/main.py
backend/scripts/setup_supabase.py
scripts/demo/
scripts/scratch/
backend/legacy/
```

## 14. Known Handover Notes

- `backend/server.py` is a wrapper. Edit `backend/app/main.py` for backend logic.
- `backend/legacy/` is not active. Keep it only for reference.
- `docs/PROJECT_DOCS.md` has older MongoDB wording. This `UNDERSTAND.md` is newer.
- `backend/tests/` currently includes old remote/Mongo-oriented assumptions. Update tests before relying on them as CI truth.
- `frontend/tsc_errors.txt` is a historical error output. `frontend/tsc_errors_v2.txt` is empty.
- `scripts/scratch/` contains powerful database repair/delete scripts. Do not run them unless you understand the target Supabase project.

## 15. Safe Change Checklist

Before changing logic:

1. Read the matching screen in `frontend/app/`.
2. Read API usage in `frontend/src/lib/api.ts`.
3. Find the backend route in `backend/app/main.py`.
4. Check stages/roles in `frontend/src/lib/constants.ts` and `backend/app/main.py`.
5. Make the smallest change.
6. Run Python syntax check and frontend type check if dependencies are installed.
7. Update this file if you add a new module, folder, or important workflow.
