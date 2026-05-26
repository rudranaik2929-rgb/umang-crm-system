# Umang Hometech LLP — Real Estate CRM & Workflow Management

> Current handover note: this file was written before the latest folder cleanup and still contains some older MongoDB wording. For the current source-of-truth folder map, active entry points, and where to add new code, read [`../UNDERSTAND.md`](../UNDERSTAND.md) first. The active backend code currently uses Supabase/PostgREST in `backend/app/main.py`; the MongoDB files are preserved under `backend/legacy/`.

> Premium SaaS dashboard built with **FastAPI + MongoDB** (backend) and **Expo / React Native Web** (frontend). End-to-end workflow for an Indian real estate company: lead capture → telecaller → site visit → booking → loan → closed.

---

## 1. What this app is

A web-based CRM for a real estate firm that orchestrates leads across multiple departments:

```
Public Enquiry ──► Telecaller ──► Site Visit ──► Booking ──► Loan ──► Registration ──► Closed
                       │
                       └──► Negative Leads (re-engagement pool for WhatsApp)
```

- **Owner/Admin** sees the owner Dashboard, department panels, Employees CRUD, Employee Tracking, and Act-as-employee mode for credit attribution.
- **Manager and assigned staff** use "My Dashboard" for personal KPIs, plus their allowed department panels and the shared Lead Pipeline.

---

## 2. Tech stack

| Layer    | Stack |
|----------|-------|
| Frontend | **Expo SDK 54** + **expo-router** (file-based routing) + **react-native-web** rendering for desktop browser. TypeScript. `@expo/vector-icons` (Ionicons). `axios` for API. `@react-native-async-storage/async-storage` for client-side token persistence. |
| Backend  | **FastAPI** 0.110 + **uvicorn**, async **motor** driver for MongoDB, **pydantic** v2 models, **httpx** for API requests |
| Database | **MongoDB** — collections: `users`, `user_sessions`, `employees`, `leads`, `activities`, `visits`, `bookings`, `loans`, `templates`, `campaigns` |
| Auth     | **Local Email/Password Auth** with session-token persistence. |

---

## 3. Repository layout

```
/app
├── backend/
│   ├── server.py            # ALL backend code (single file: routes, models, auth, stats)
│   ├── requirements.txt
│   └── .env                 # MONGO_URL, DB_NAME (DO NOT modify keys)
├── frontend/
│   ├── app/                 # expo-router screens
│   │   ├── _layout.tsx              # Root: ThemeProvider + AuthProvider + session-id bootstrap
│   │   ├── index.tsx                # Split-screen landing/login
│   │   ├── enquire.tsx              # Public lead capture form (no auth)
│   │   ├── select-role.tsx          # First-login role chooser (only if not auto-linked to employee)
│   │   └── (app)/                   # AUTHENTICATED shell with sidebar + topbar
│   │       ├── _layout.tsx          # Auth guard + role-based default route
│   │       ├── dashboard.tsx        # Owner overview + Employee Performance grid
│   │       ├── my-dashboard.tsx     # Manager workspace + hot/warm/cold + KPIs
│   │       ├── pipeline.tsx         # 8-column kanban
│   │       ├── telecaller.tsx       # Lead queue + action modal
│   │       ├── visits.tsx           # Schedule + complete visits
│   │       ├── bookings.tsx         # Property bookings, token, agreement
│   │       ├── loans.tsx            # 4-stage bank progression (docs → verify → sanction → disbursal)
│   │       ├── whatsapp.tsx         # Campaign + template (UI-only simulation)
│   │       ├── employees.tsx        # Employee CRUD (admin only)
│   │       └── negative-leads.tsx   # Negative leads reservoir
│   ├── src/                 # NON-route helpers
│   │   ├── theme/
│   │   │   ├── tokens.ts            # Light/dark color palettes
│   │   │   └── ThemeContext.tsx     # toggle, persist to localStorage
│   │   ├── auth/
│   │   │   └── AuthContext.tsx      # refresh / login / logout / setRole / actAs
│   │   ├── lib/
│   │   │   ├── api.ts               # axios instance with Bearer token interceptor
│   │   │   └── constants.ts         # STAGES, ROLES, NAV_ITEMS, ROLE_ACCESS, visibleNavFor()
│   │   └── components/
│   │       ├── Sidebar.tsx          # Role-aware nav (filters via visibleNavFor)
│   │       ├── TopBar.tsx           # Theme toggle, role switcher (admin only), act-as (admin only), user menu
│   │       ├── StatCard.tsx
│   │       ├── EmptyState.tsx
│   │       ├── Charts.tsx           # Pure-View pipeline bar chart + lead-health donut bar
│   │       ├── Badge.tsx
│   │       └── LeadDetailModal.tsx  # Shared modal for lead actions + timeline
│   ├── app.json
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                 # EXPO_PACKAGER_*, EXPO_PUBLIC_BACKEND_URL
└── README.md
```

---

## 4. Authentication flow

1. User enters Email and Password on the login screen.
2. Frontend calls `POST /api/auth/session` with credentials.
3. Backend verifies credentials against `db.users`:
   - If a `db.employees` record exists with the same email → user is auto-linked: `role=emp.role`, `acting_as_employee_id=emp.employee_id`
   - Else if it's the admin account → user becomes `admin`
   - Else → role=null, will be sent to `/select-role`
4. Backend returns `{ user, session_token }`; frontend stores token in `localStorage` AND backend sets a `session_token` cookie (httpOnly, secure, samesite=none, 7 days)
5. Future API calls use `Authorization: Bearer <token>` (set by `axios` interceptor)
6. Future API calls use `Authorization: Bearer <token>` (set by `axios` interceptor)

### Bypass for testing
Insert directly via `mongosh test_database`:
```js
db.users.insertOne({user_id:'u1', email:'x@y.com', name:'X', role:'admin', acting_as_employee_id:null, created_at:new Date()});
db.user_sessions.insertOne({user_id:'u1', session_token:'TOKEN', expires_at:new Date(Date.now()+86400000), created_at:new Date()});
```

---

## 5. Backend API (all under `/api`)

### Auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/session` | Exchange `session_id` for `session_token` (cookie + body) |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Clear server session + cookie |
| POST | `/auth/set-role` | `{role}` — set/change user role |
| POST | `/auth/act-as` | `{employee_id\|null}` — admin acts on behalf of an employee (all subsequent activities are credited to that employee) |

### Leads
| Method | Path | Notes |
|--------|------|-------|
| POST | `/leads/public` | **No auth.** Creates lead at `stage=new`, `status=active`. Auto-logs activity. |
| GET | `/leads?stage=&status_=&assigned_to=` | NB: query param is `status_` (FastAPI reserved name) |
| GET | `/leads/{lead_id}` | Returns `{ lead, timeline }` |
| PATCH | `/leads/{lead_id}` | Partial update. Stage/status changes auto-logged. |
| POST | `/leads/{lead_id}/notes` | `{text, type='call_note'}` |
| POST | `/leads/{lead_id}/advance` | Moves to next stage in `STAGES` |

### Visits / Bookings / Loans
| Method | Path | Side effects |
|--------|------|--------------|
| POST | `/visits` | Creates visit AND moves lead.stage = `site_visit` |
| GET / PATCH | `/visits/{id}` | Completing logs activity |
| POST / GET | `/visit-followups` | Creates/list visit follow-ups with required date, time, day; dashboard counts them |
| POST | `/bookings` | Creates booking, calculates `payment_progress`, moves lead.stage = `booking` |
| GET / PATCH | `/bookings/{id}` | Token updates recompute progress |
| POST | `/loans` | Creates with default `pending_documents=[PAN, Aadhaar, Income Proof, Bank Statements]`, moves lead.stage = `loan` |
| GET / PATCH | `/loans/{id}` | Setting `application_status=disbursed` moves lead to `registration` |

### Employees / Campaigns / Templates
Standard CRUD on `/employees`, `/templates`, `/campaigns`. `POST /campaigns/{id}/send` SIMULATES delivery by counting matching leads from audience filter (no real Twilio/Meta call).

### Stats
| Path | Purpose |
|------|---------|
| GET `/stats/dashboard` | Aggregate counts + `follow_ups`, `pending_follow_ups`, `stage_distribution` + `revenue_pipeline` |
| GET `/stats/me` | Personal performance for current user: `personal{actions_total, positives, negatives, followups, visits, bookings_done, loans_done, closed_deals, call_notes, score_10, last_activity}` + `leads{hot, warm, cold, negative, closed}` + `employee` + `role` |
| GET `/stats/employees` | Per-employee metrics for the Dashboard Employee Performance grid |
| GET `/activities?limit=` | Recent activity feed |

---

## 6. Data models (pydantic + MongoDB)

```python
User(user_id, email, name, picture, role, acting_as_employee_id, created_at)
Lead(lead_id, name, phone, email, budget, location, property_type, source='website',
     stage='new', status='active', assigned_to, notes, created_at, updated_at)
SiteVisit(visit_id, lead_id, lead_name, scheduled_at, assigned_to, assigned_name,
          status='scheduled', feedback, interested, created_at)
VisitFollowUp(followup_id, visit_id, lead_id, lead_name, follow_up_date,
              follow_up_time, follow_up_day, follow_up_at, status='scheduled',
              notes, created_by, created_at, updated_at)
Booking(booking_id, lead_id, lead_name, property_name, booking_amount, token_received,
        agreement_status='pending', payment_progress=0, status='active', created_at)
LoanApp(loan_id, lead_id, lead_name, bank_name, amount, application_status='pending',
        bank_stage='documentation', pending_documents:[], emi_eligible, progress=0, created_at)
Employee(employee_id, name, email, phone, role, department, active=True,
         leads_assigned=0, leads_closed=0, last_login, created_at)
Campaign(campaign_id, name, template_id, audience='all', audience_filter,
         scheduled_at, status='draft', sent_count, delivered_count,
         read_count, replied_count, created_at)
Template(template_id, name, body, created_at)
ActivityEntry (db.activities) -- raw dict:
  { entry_id, lead_id, actor_id, actor_name, actor_role,
    employee_id, employee_name, type, text, meta, created_at }
```

**Conventions**:
- All ids prefixed: `lead_xxx`, `vis_xxx`, `bkg_xxx`, `lon_xxx`, `emp_xxx`, `cmp_xxx`, `tpl_xxx`, `user_xxx`, `act_xxx`
- MongoDB `_id` is ALWAYS excluded in queries (`{"_id": 0}` projection)
- Datetimes are tz-aware UTC (`datetime.now(timezone.utc)`)

---

## 7. Stages & Roles

```ts
STAGES = ['new', 'contacted', 'positive', 'site_visit', 'booking', 'loan', 'registration', 'closed']
ROLES  = ['admin', 'telecaller', 'site_visit', 'booking', 'loan', 'marketing']

ROLE_ACCESS = {
  admin:       [all 11 nav items],
  telecaller:  ['my-dashboard', 'telecaller', 'pipeline', 'negative'],
  site_visit:  ['my-dashboard', 'visits',     'pipeline'],
  booking:     ['my-dashboard', 'bookings',   'pipeline'],
  loan:        ['my-dashboard', 'loans',      'pipeline'],
  marketing:   ['my-dashboard', 'whatsapp',   'negative', 'pipeline'],
}
```

### /10 Performance score formulas (in `/api/stats/me`)
- **Telecaller**: `min(10, positives×2 + followups×0.5 + call_notes×1)`
- **Site Visit**: `min(10, visits × 1.5)`
- **Booking**: `min(10, bookings_done × 2.5)`
- **Loan**: `min(10, loans_done × 1.5 + closed_deals × 3)`
- **Marketing**: `min(10, campaigns_sent × 2 + total_campaigns × 0.5)`

---

## 8. Workflow handoff (the magic glue)

| Action | Triggered by role | Backend effect |
|--------|-------------------|----------------|
| Public enquiry submitted | (anyone) | Lead → `stage=new`. Telecaller queue shows it. |
| Telecaller "Mark Positive" | Telecaller | `stage=positive`. Visit team eligible to schedule. |
| Telecaller "Schedule Site Visit" (lead modal) | Telecaller | POST `/visits` + lead.stage → `site_visit`. Visit team sees it on /visits. |
| Visits "Follow Up" | Site Visit | POST `/visit-followups`, visit.status=`follow_up`, lead.follow_up_at updated. Dashboard Follow Ups count increments. |
| Visits "Booking Ready" | Site Visit | visit.status=`completed`, interested=true, lead.stage → `booking`. Booking team sees it. |
| Create Booking | Booking | Booking record + lead.stage → `booking`. |
| Create Loan | Loan | Loan record + lead.stage → `loan`. |
| Loan "All Docs Submitted" | Loan | `pending_documents=[], application_status=disbursed`, **lead.stage → `closed`** (deal won). |
| Mark Negative | Any | `status=negative`. Lands in Negative Leads page for marketing re-engagement. |

---

## 9. Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
# Set up backend/.env:
#   MONGO_URL=mongodb://localhost:27017
#   DB_NAME=umang_crm
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
yarn install
# Set up frontend/.env:
#   EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
yarn start          # press 'w' for web

# MongoDB
mongod --dbpath ./data/db
```

**Auth redirect for local**: No redirects needed for local email/pass login. Simply ensure the backend is running.

---

## 10. Build for production

- **Web bundle**: `cd frontend && yarn build:web` (outputs to `dist/`); serve statically + reverse-proxy `/api/*` to FastAPI.
- **Mobile build (planned)**: app.json already has Android `permissions` + iOS `infoPlist` placeholders. Use EAS Build (`eas build -p android --profile production`) once you set up an Expo account.

---

## 11. Out of scope (prototype boundaries)

- WhatsApp campaign send is **simulated** — no Twilio/Meta integration
- No email/SMS notifications
- No payment gateway for bookings (token amount is just stored, not collected)
- No multi-tenant / branch separation
- No real-time notifications (would need WebSocket / SSE)

---

## 12. Test credentials

This app uses Email/Password login. To bypass for automated tests, see `/app/memory/test_credentials.md` for the insertion snippet.
