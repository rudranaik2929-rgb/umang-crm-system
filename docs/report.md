# Umang CRM — Full Project Audit Report

**System:** Umang Hometech LLP Real Estate CRM  
**Repository:** `/Users/rohitjadhav/Documents/crm/umang-crm-system`  
**Audit date:** 27 July 2026  
**Audience:** Client stakeholders and engineering leadership  
**Scope:** Backend, frontend, Supabase SQL, scripts, tests, deploy config — verified against the live codebase (not aspirational docs)

---

## Scorecard (1–10)

| Dimension | Score | Justification |
|-----------|------:|---------------|
| **Security** | **3** | Hardcoded production login credentials, self-service role elevation to admin, email-based RBAC bypasses, permissive RLS (`using (true)`), unauthenticated public lead intake with no anti-abuse beyond IP rate limits (auth itself is rate-limit-exempt), Facebook webhooks without signature verification. |
| **Scalability** | **4** | Dashboard/stats paths still call `fetch_all_leads_merged()` (full-table load into RAM); in-process caches do not survive multi-instance; Render starter + cold starts; pagination exists on some list endpoints but bucket math is still in-app over full sets. |
| **Maintainability** | **3** | ~9,300-line `backend/app/legacy_core.py` owns nearly all domain logic; Phase-2 package split (`config`, `db`, `cache`) is thin; SQL sprawl across 30+ ad-hoc scripts with no ordered migration runner. |
| **Observability** | **3** | Stdout logging and `/api/health`; no APM, structured audit trail, error tracking (Sentry), or metrics; `/debug-config` exposes deployment shape publicly. |
| **Test coverage** | **5** | Solid unit tests for exclusive lead buckets, pagination helpers, integrations, notifications (~2.6k lines under `backend/tests/`); `conftest.py` still Mongo/remote-oriented; no frontend, e2e, load, or security tests. |
| **Product completeness** | **7** | Daily CRM workflow is real and used: assign → telecaller/sales → booking/loan → notifications → Housing/Meta integrations; WhatsApp/AI largely simulated; reporting/SLA/multi-tenant/compliance incomplete. |

**Overall readiness for daily production use:** **Usable with elevated operational risk.** The product delivers the real-estate workflow the client needs, but security debt and monolith/scale patterns must be treated as near-term remediation, not backlog curiosities.

---

## 1. Executive summary

Umang CRM is a single-tenant real-estate workflow system: public/website and portal enquiries flow through assignment, telecaller/sales workspaces, exclusive dashboard status buckets (open / missed / ringing / follow-up / hot / cold / visited / not interested), booking and loan departments, broker pool, and push notifications. Production hosting is **Vercel (Expo web)** + **Render (FastAPI Docker)** + **Supabase (Postgres/PostgREST)**. Active API implementation lives in `backend/app/legacy_core.py` (aliased via `backend/app/main.py` and `backend/server.py`).

### Maturity

The team has invested seriously in **domain correctness** (exclusive partitions, shared select strings for count/list parity, performance indexes, FCM notifications, Housing/Meta sync). That maturity is **product/domain-strong** and **engineering-structure-weak**: almost all backend behavior remains one file; schema is applied by hand via many SQL files; several “demo” security shortcuts remain in production paths.

### Top 5 risks

1. **Critical — Hardcoded credentials & login bypasses** in `backend/app/legacy_core.py` (`umang@admin` / `htshpatil13@gmail.com` / `mukesh@umang.com` / `rohitsingh241993@gmail.com`) and documented in `README.md`. Anyone who knows these passwords gets admin/manager/telecaller sessions without a DB user.
2. **Critical — Any authenticated user can elevate role** via `POST /api/auth/set-role` (no admin check) — privilege escalation to `admin`.
3. **High — Email allowlists bypass RBAC** (`ensure_roles`, `_can_manage_all_leads`, owner dashboard) for hardcoded emails including aliases like `umang@admin`.
4. **High — Full-table lead loads for dashboard math** (`fetch_all_leads_merged`) will degrade under 2× lead volume; RAM/CPU on a single Render worker becomes a bottleneck.
5. **High — Database trust model** relies on **service role** with RLS policies `using (true) with check (true)` on leads/events; notifications RLS disabled; anon grants on some notification tables in SQL scripts — defense-in-depth is thin if keys leak.

### Top 5 strengths

1. **Exclusive lead/status buckets** with tests (`backend/tests/test_employee_lead_buckets.py`) and shared classification (`classify_company_dashboard_bucket`, `filter_lead_bucket`) — counts match opened lists when using `DASHBOARD_BUCKET_LEAD_SELECT`.
2. **Real portal integrations** — Housing.com webhook/HMAC sync and Meta Lead Ads Graph fetch with `integration_events` audit trail.
3. **Operational pragmatism** — GZip, in-memory TTL caches, assign-workspace pagination, dashboard performance indexes (`supabase/DASHBOARD_PERFORMANCE_INDEXES.sql`), keep-alive health for Render cold starts.
4. **Role-aware frontend navigation** — `frontend/src/lib/constants.ts` (`ROLE_ACCESS`, `effectivePages`, owner vs manager dashboard split).
5. **Notification stack** — `backend/app/notification_service.py` + FCM (`fcm_client.py`) + Expo web service worker under `frontend/public/`.

---

## 2. Full folder / architecture map

```text
umang-crm-system/
├── README.md                 # Deploy, domains, integration URLs (also documents admin test password)
├── UNDERSTAND.md             # Handover map (partly stale: says main.py holds logic; reality is legacy_core.py)
├── render.yaml               # Render Docker backend blueprint
├── docker-compose.yml        # Local backend + frontend
├── vercel.json               # Root Vercel hint
├── package.json              # Root meta
├── backend/
│   ├── server.py             # Compatibility: imports app.main
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py           # Thin alias → legacy_core (sys.modules swap)
│   │   ├── legacy_core.py    # ★ ~9,283 lines — ALL routes + domain
│   │   ├── notification_service.py
│   │   ├── fcm_client.py
│   │   ├── config/settings.py
│   │   ├── core/cache.py     # TTL caches + canonical SELECT strings
│   │   ├── db/supabase.py    # httpx PostgREST client
│   │   └── routers/          # Empty package stub (Phase-2 not finished)
│   ├── legacy/               # DEAD — Mongo/Flask history (do not deploy)
│   │   ├── server_mongo.py
│   │   ├── server_mongo_backup.py
│   │   └── umang.py
│   ├── scripts/              # setup_supabase helpers
│   └── tests/                # Unit + some remote-oriented tests
├── frontend/
│   ├── app/                  # Expo Router screens
│   │   ├── index.tsx         # Login
│   │   ├── enquire.tsx       # Public enquiry
│   │   ├── select-role.tsx
│   │   └── (app)/            # Authenticated CRM screens
│   ├── src/
│   │   ├── auth/AuthContext.tsx
│   │   ├── components/       # Modals, charts, lead UI (LeadDetailModal ~1.5k lines)
│   │   ├── lib/              # api.ts, constants, lead helpers
│   │   ├── notifications/
│   │   ├── hooks/
│   │   └── theme/
│   ├── public/               # PWA / firebase messaging SW
│   └── vercel.json
├── supabase/                 # Schema + many hand-run SQL patches (see §5, Appendix)
│   └── migrations/           # Only 1 tracked migration file
├── scripts/
│   ├── demo/                 # Seed/demo data
│   ├── scratch/              # One-off debug/wipe/repair (dangerous if run against prod)
│   └── reset_assignments.sh
├── docs/                     # PROJECT_DOCS, PRD (stale Mongo refs), this report
└── test_reports/             # Historical agent test outputs
```

### Dead / legacy areas

| Path | Status |
|------|--------|
| `backend/legacy/*` | Not imported by deploy entrypoints; Mongo-era code |
| `scripts/scratch/*` | Local repair/wipe utilities; not part of runtime |
| `frontend/app/(app)/whatsapp.tsx`, `visits.tsx`, `follow-ups.tsx` | Screens exist; WhatsApp nav is commented out in `constants.ts`; visits/follow-ups deprecated as nav keys |
| `docs/PRD.md` | Explicitly outdated (MongoDB, “first user becomes admin”) |
| `backend/tests/conftest.py` | Still creates sessions via `mongosh` against remote URL — not aligned with Supabase unit tests |

### Runtime data flow (simplified)

```text
Browser (Expo Web @ umanghometechllp.in)
    → HTTPS + cookie/Bearer → FastAPI (Render)
        → PostgREST + service role → Supabase Postgres
Housing.com / Meta webhooks → FastAPI → leads + integration_events
FCM ← notification_service ← lead/assign events
```

---

## 3. Tech stack & runtime

| Layer | Choice |
|-------|--------|
| Frontend | Expo ~54 / React Native Web / Expo Router, TypeScript, Axios, Firebase JS (web push) |
| Backend | Python 3.11, FastAPI, uvicorn, httpx, passlib/bcrypt, openpyxl, firebase-admin |
| Database | Supabase Postgres accessed via PostgREST REST (not ORM; not Supabase Auth for CRM users) |
| Auth model | **Custom local JWT** (HS256, hand-rolled in `legacy_core.py`) + optional `sessions` table + in-memory `LOCAL_SESSIONS`; cookie `session_token` (`httponly`, `samesite=none`, `secure` from env) and/or `Authorization: Bearer` |
| Hosting | Frontend: **Vercel**; Backend: **Render** Docker (`render.yaml`, plan `starter`); DB: **Supabase** |
| Domains | App `umanghometechllp.in`; API `api.umanghometechllp.in` (fallback Render hostname in `frontend/src/lib/api.ts`) |
| Integrations | Housing.com (HMAC + webhook secret), Facebook Lead Ads (verify token + Graph API), Interakt WhatsApp (simulated), OpenAI (optional summaries) |

**Auth is not Supabase Auth.** The backend uses `SUPABASE_SERVICE_ROLE_KEY` (preferred) to read/write all tables as a privileged server. Frontend may have a Supabase client (`frontend/src/lib/supabaseClient.ts`) for limited client use; primary CRM API is the FastAPI layer.

---

## 4. Security assessment

Severity ratings: **Critical / High / Medium / Low**. Every finding references this repository.

### 4.1 Critical

| Finding | Location | Notes |
|---------|----------|-------|
| **Hardcoded admin/employee passwords** | `backend/app/legacy_core.py` ~2186–2219; also `README.md` login checklist; `HARDCODED_USERS` ~1732–1754 | Login succeeds for `htshpatil13@gmail.com` / `umang@admin` with `umang@admin`, `mukesh@umang.com` / `mukesh@123`, `rohitsingh241993@gmail.com` / `umang@manager` **without** verifying DB hashes. These bypass account disable checks for hardcoded paths. |
| **Self-service role elevation** | `POST /api/auth/set-role` ~2268–2277 | Any logged-in user may set `payload.role` to any value in `ROLES`, including `admin`. Persisted via `sb_update("users", ...)`. |

### 4.2 High

| Finding | Location | Notes |
|---------|----------|-------|
| **Email-based RBAC bypass** | `ensure_roles` ~1872–1877; `_can_manage_all_leads` ~1880–1881; `ensure_owner_dashboard` / `ensure_main_dashboard` ~2039–2057; `_admin_can_reset` ~5425 | Listed emails skip role checks. Frontend mirrors owner emails in `frontend/src/lib/constants.ts` (`OWNER_EMAILS`). |
| **Auth exempt from rate limiting** | `rate_limit_middleware` ~90–96 | Paths under `/api/auth/` skip limits → password spraying is unconstrained at the app layer. |
| **Default JWT secret fallback** | `backend/app/config/settings.py` `JWT_SECRET = ... or "change-me-in-production"` | Misconfigured deploy = forgeable sessions. `/debug-config` reports whether secret is still a placeholder. |
| **Permissive RLS** | `supabase/final_schema.sql`, `migrations/20260529_housing_integration_rls.sql`, many `*_FIX.sql` | `create policy ... using (true) with check (true)` on `leads` / `integration_events`. Acceptable only if **anon key never has write access** and service role stays server-side. |
| **Notifications RLS disabled + broad grants** | `supabase/NOTIFICATIONS_SYSTEM.sql`, `FINAL_RUN_THIS.sql` | `alter table notifications disable row level security`; grants to `anon, authenticated` on related tables — dangerous if clients ever use anon key directly. |
| **Facebook webhook lacks app secret signature check** | `facebook_webhook` ~4155+ | GET verify uses `FACEBOOK_VERIFY_TOKEN` (default `UMANGCRM123` in settings/README). POST does not verify `X-Hub-Signature-256`. Housing webhook **does** verify HMAC when configured (~4049–4098). |
| **Public lead creation** | `POST /api/leads/public` ~4113–4139 | Unauthenticated intake (expected for website). No CAPTCHA/honeypot; only global IP rate limit (and only if path is not exempt). Spam can fill CRM. |
| **X-Acting-As / act-as without privilege gate** | `get_current_user` headers; `POST /api/auth/act-as` ~2300–2307 | Any authenticated caller can set `acting_as_employee_id` to another employee id (impersonation of assignee context for stats/queues depending on call sites). |

### 4.3 Medium

| Finding | Location | Notes |
|---------|----------|-------|
| **Plaintext password legacy compare** | `verify_password` ~29–35 | Non-bcrypt stored values compared in plaintext equality. |
| **Dual password columns** | `_password_db_fields` writes `password` and `password_hash` | Increases exposure surface in DB backups. |
| **Employee plaintext passwords in sessionStorage** | `frontend/src/lib/employeePasswordCache.ts` | Manager UX to re-show passwords they just set — acceptable only as session-scoped; still PII/credential residue on shared machines. |
| **Public `/debug-config`** | `legacy_core.py` ~121–131 | Reveals CORS, whether service role/JWT configured — useful for ops, useful for attackers recon. |
| **`/leads` list not strictly scoped by assignee for all roles** | `list_leads` ~5612–5673 | Authenticated users with the endpoint can query with filters; relies on frontend role gates more than hard server-side “own leads only” for this route. Edit paths do enforce assignee (`ensure_lead_edit_access`). |
| **PostgREST filter injection risk** | `list_leads` `ilike.*{source}*` ~5636; mitigated somewhat by `_postgrest_filter_value` ~7557 for IDs | User-influenced filter strings concatenated into PostgREST query params — sanitize/whitelist source more strictly. |
| **CORS wide methods/headers** | `CORSMiddleware` allow_methods/headers `*` | Combined with credentialed cookies — keep origin allowlist tight (currently good defaults + regex). |
| **Minimum password length 4** | Employee create/update ~8070, 8171 | Weak passwords for staff accounts. |
| **Destructive admin APIs** | `DELETE /api/leads/clear-all`, `POST /api/leads/reset-assignments` | Gated by `_admin_can_reset` (role or hardcoded email) — high blast radius; needs step-up auth / confirmation tokens. |
| **Cron endpoint** | `POST /api/integrations/housing/cron` | Auth only if `CRON_SECRET` set; empty secret = open trigger. |
| **Client “privacy shield”** | `frontend/app/_layout.tsx` | Disables context menu/copy — **not** a security control; false sense of protection. |

### 4.4 Low

| Finding | Notes |
|---------|-------|
| Rate limit is in-process dict | Resets on deploy; not shared across instances |
| Scratch wipe scripts under `scripts/scratch/` | Risk if run against production credentials |
| Firebase public config in `.env.example` | Expected for web FCM; ensure only public keys |

### Secrets handling

- `.gitignore` correctly ignores `.env`, `backend/.env`, `frontend/.env`.
- `render.yaml` marks sensitive keys `sync: false`; JWT can `generateValue`.
- **Do not** commit real `.env` files. Rotate any credentials that ever appeared in chat/docs (`README` admin password must be changed and hardcoded bypasses removed).

### PII & employee data

- Leads store name, phone, email, notes, `raw_payload` (portal dumps).
- Employee GPS: `last_lat`/`last_lng`/`last_seen_at` returned only to admin/manager on `GET /api/employees` (~8133–8139) — good.
- Activities log user actions — useful but incomplete as compliance audit (no immutable tamper-evident store).

---

## 5. Data model & Supabase

### Schema ownership

Documented “final” sources:

- `supabase/final_schema.sql` — intended single source of truth (idempotent)
- `supabase/FINAL_RUN_THIS.sql` — larger operational “run this” pack
- `supabase/schema.sql` — earlier full schema
- **30+** patch files: cold leads, booking pipeline, notifications, employee dashboard, excel import, location, indexes, client handoff clean, etc.

**Migration hygiene: Poor for long-lived production.** Only `supabase/migrations/20260529_housing_integration_rls.sql` lives under a migrations folder. Everything else is manual SQL Editor order. Risk: environments diverge; “which scripts were applied?” is tribal knowledge.

### Core entities (from `final_schema.sql`)

- `roles`, `users`, `sessions`, `employees`
- `leads` (+ `priority`, `call_status`, `follow_up_at`, `external_lead_id`, `raw_payload`, `lead_type`, …)
- `lead_notes`, `activities`, `visits`, `visit_followups`
- `bookings`, `loans`, `customers`
- `notifications`, FCM/preferences tables (in notification SQL)
- `integration_events`, templates/campaigns (app + older schema)

### Indexes

Good recent investment:

- Bundled in `final_schema.sql` (~404–432)
- `supabase/DASHBOARD_PERFORMANCE_INDEXES.sql`
- `supabase/COLD_LEADS.sql` partial indexes on `priority = cold`
- `NOTIFICATIONS_PERFORMANCE_FIX.sql`

### Computed in app vs DB

| Concern | Where |
|---------|--------|
| Exclusive dashboard buckets, missed leads (24h), ringing vs follow-up exclusivity | **Python** (`classify_company_dashboard_bucket`, `is_missed_lead`, filters) |
| Phone normalize to `91…` | **Python** |
| Round-robin assignment | **Python** |
| Stats graphs / employee performance | **Python** over cached full lead sets |
| Persistence, basic filters, indexes | **Postgres** |
| No materialized views / SQL RPCs for dashboard counts observed as primary path | Gap for scale |

Cold leads intentionally reuse `leads.priority` (`supabase/COLD_LEADS.sql`) — no extra column sprawl; good.

---

## 6. Backend quality

### Structure

- **Entrypoint:** `backend/server.py` → `app.main` → **module alias to `legacy_core`**.
- Phase-2 extractions only: `config/settings.py`, `db/supabase.py`, `core/cache.py`.
- `backend/app/routers/` is effectively empty — route modularization not done.

### Coupling

`legacy_core.py` mixes: JWT crypto, rate limits, CORS app setup, PostgREST helpers, Housing/Meta, WhatsApp/AI stubs, assignment engine, bookings/loans, employees, stats, notifications hooks, admin destructive ops. Change risk is high; review cost is high.

### Caching

- Leads: `fetch_all_leads_merged` + TTL (`LEADS_CACHE_TTL_SEC`, Render sets 300s)
- Dashboard/graph/employee/assignment caches in `core/cache.py`
- Session cache merge for recently written rows
- `POST /api/admin/flush-caches` for post-SQL wipe consistency
- **Caveat:** All in-process; second Render instance = split brain; after external SQL edits, stale RAM until TTL/flush/probe-empty logic

### Error handling

- Supabase helpers log and often return `[]` / `None` on failure (`db/supabase.py`) — callers can silently treat errors as empty data (dangerous for auth/critical writes; inserts do raise in some lead paths).

### Positive patterns

- `sb_select_all` pagination for PostgREST 1000-row caps
- `sb_insert_many` for Excel import
- Parallel reads via `ThreadPoolExecutor`
- Shared `LEADS_CANONICAL_SELECT` / `DASHBOARD_BUCKET_LEAD_SELECT` to stop count/list drift
- GZipMiddleware for large JSON

---

## 7. Frontend quality

### Stack & patterns

- Expo Router file routes under `frontend/app/(app)/` (dashboard, assign-leads, telecaller, sales-executive, bookings, loans, integrations, broker, employees, tracking, notifications, etc.).
- API client `frontend/src/lib/api.ts`: credentialed Axios, long timeouts for dashboard/import, snapshot cache in `sessionStorage`, live-get bypass for stats/leads, backend warm-up for Render cold starts.
- Auth: `AuthContext.tsx` keeps cached user across cold-start timeouts (avoids false logout).

### Modal / z-index history

Multiple overlays set very high z-index (`LeadDetailModal`, bookings form `12000`, toasts `9999`, `DatePickerField` up to `2147483647`, privacy mask `999999`). This reflects past stacking bugs on RN-web; workable but fragile — prefer a single modal portal/layer system.

### Dashboard math

Frontend largely **displays** backend bucket stats (`dashboard.tsx`, `DashboardLeadsModal.tsx` with pagination UI). Correctness depends on backend exclusive filters + matching select columns — actively tested on the backend.

### Offline / cache

- Snapshots TTL ~30 minutes; GET cache 15s for non-live endpoints.
- Not a true offline CRM — degraded mode keeps last snapshot during API wake-up.
- Employee password map in sessionStorage (see security).

### Accessibility

- Some controls set `accessibilityRole` / `accessibilityLabel` (modals, pagination).
- Not systematically audited; charts and dense tables likely weak for screen readers.
- Privacy shield interferes with normal browser behaviors (copy) — hurts accessibility and support.

### Large UI modules

Notable complexity hotspots: `LeadDetailModal.tsx` (~1500 lines), `assign-leads.tsx` (~1147), `bookings.tsx` (~1141). Same maintainability pressure as the backend monolith.

---

## 8. Business logic / CRM domain

### Intended flow

```text
Enquiry (public / Meta / Housing / Excel / manual)
  → Unassigned / Assign Leads
  → Telecaller or Sales Executive workspace
  → Hot / Cold / Follow-up / Ringing / Missed / Not interested
  → Booking department (excluded from “Total Leads” overview when classified as booking/registration)
  → Loan → Registration → Closed
  → Broker pool side channel
```

### Exclusive partitions (strength)

Company dashboard classification (`classify_company_dashboard_bucket` ~5961–5995):

- Lead Overview: `open_leads`, `missed_leads`, `ringing`, `follow_up`, `positive` (hot), `cold_leads`, `visited`, `not_interested`
- Booking Overview: `booking`, `registration` (not counted in Total Leads)
- Excludes fake Meta & brokerage pool from company totals

Employee pills use the same exclusivity rules (ringing wins over follow-up; cold ≠ follow-up). Covered by `test_employee_lead_buckets.py`.

### Consistency risks

| Risk | Detail |
|------|--------|
| **App vs DB truth after SQL handoff** | RAM caches + `SESSION_CACHE` can diverge until flush (`CLIENT_HANDOFF_CLEAN.sql` + admin flush) |
| **Booking vs lead overview** | Depends on stage/priority/metric classification — mis-set `priority`/`stage` can park leads in wrong box |
| **site_visit vs sales_executive** | Dual role keys for same department (compat) — easy to grant wrong pages |
| **Manager vs owner revenue** | Split is intentional (`ensure_owner_dashboard`); email bypasses can leak owner metrics |
| **WhatsApp / campaigns** | UI present; send path simulated — business may believe automation is live |
| **Notes vs stage edits** | Remarks open to any authenticated user; stage/assignee gated — good product choice, ensure marketing/negative rules stay clear |
| **Cold leads** | `priority=cold` + `stage=positive`; document for staff so “Cold” is not confused with Follow Up |

---

## 9. Performance & 2× load readiness

### What works today

- Indexed filters on leads/activities/notifications
- Paginated `GET /api/leads` (limit capped 500) and `/leads/filtered`, assign-workspace APIs
- In-memory TTL caches reduce repeat full scans within one worker
- Batch import and bulk assign performance tests exist

### What breaks at ~2× daily users / leads

1. **`fetch_all_leads_merged`** — loads **all** canonical lead columns into Python for bucket counts and many stats paths. 2× rows ≈ 2× RAM, CPU, and PostgREST page loops (`sb_select_all`).
2. **Dashboard bundle** — gathers stats + graph + employees + recent leads; timeout already raised to 90s on frontend — symptom of heavy compute.
3. **Single Render starter instance** — cold start + CPU throttle under concurrent morning login + dashboard opens.
4. **In-process rate limiter & caches** — ineffective or inconsistent under horizontal scale.
5. **N+1 style enrichment** — employee name enrichment and per-lead activity patterns can multiply HTTP calls under load (partially mitigated by batch `sb_select_in` / maps).
6. **Full Excel imports** — long request (`IMPORT_TIMEOUT_MS` 300s); worker blocked unless offloaded to background jobs.

### Concrete upgrades (priority order)

1. Replace full-table dashboard counts with **SQL aggregation / materialized view / RPC** keyed by the same exclusive CASE logic as Python.
2. Keep **server-side pagination** for all human lists; never send full lead arrays to the browser for dashboards.
3. Move cache to **Redis** (or accept single-instance + sticky sessions explicitly).
4. Background workers for Meta/Housing poll and Excel import (Render worker or Supabase cron + queue).
5. Connection/pool tuning already partially present (`httpx` limits); add metrics on p95 of `/stats/dashboard-bundle` and `/leads/assign-workspace`.
6. Consider Supabase **read replicas** only after query push-down — otherwise app remains the bottleneck.

---

## 10. Reliability & ops

| Topic | Current state |
|-------|----------------|
| Deploy backend | Docker → Render (`render.yaml`), health ` /api/health` |
| Deploy frontend | Vercel `frontend/` export web `dist` |
| Local | `docker-compose.yml` + uvicorn/npm scripts |
| Cold starts | Render free/starter sleep; frontend `warmUpBackend` + auth timeout tolerance |
| Logging | Python `logging` to stdout; Facebook webhook verbose payload logs (may contain PII) |
| Monitoring | No Sentry/Datadog/OpenTelemetry found |
| Backups | Rely on Supabase plan backups — not scripted in-repo |
| Config | Env-based; `.env.example` documents integrations |
| Destructive ops | SQL `CLEAR_DATA.sql`, `full_reset_clean.sql`, API clear-all — operational hazard |
| Health | `/`, `/api/health`, compose healthcheck hits `/api/` |

**Recommendations:** uptime check on `/api/health` + synthetic login; alert on webhook failure rates via `integration_events`; disable verbose PII logging in production; document RPO/RTO with Supabase; require `CRON_SECRET` in production.

---

## 11. Testing

### What exists (`backend/tests/`, ~2.6k lines)

| Area | Files (examples) |
|------|------------------|
| Exclusive buckets / partitions | `test_employee_lead_buckets.py`, `test_lead_separation.py`, `test_inquiry_status_filter.py` |
| Pagination / filtered lists | `test_leads_filtered_pagination.py` |
| Integrations | `test_integrations_unit.py` |
| Import / bulk assign | `test_lead_import.py`, `test_bulk_assign_performance.py` |
| Notifications / FCM | `test_notification_service.py`, `test_notification_api.py`, `test_fcm_client.py` |
| Personal dashboard | `test_personal_dashboard_metrics.py` |
| Telecaller / activity | `test_telecaller_assigned_leads.py`, `test_visited_and_today_activity.py` |
| Health/auth (legacy remote) | `test_health_auth.py` + Mongo `conftest.py` |

### What’s missing

- **No frontend unit/component tests**
- **No e2e** (Playwright/Cypress) for login → assign → status → booking
- **No load tests** (k6/Locust) for dashboard-bundle / assign-workspace
- **No security tests** (role elevation, hardcoded login removal regression, webhook forgery)
- **conftest Mongo path** misleads CI; prefer pytest against `legacy_core` pure functions + httpx ASGITransport

---

## 12. Compliance / privacy

| Topic | Assessment |
|-------|------------|
| PII inventory | Lead phone/email/name/notes/raw_payload; employee location; session tokens |
| Retention | No automated retention/purge policy in app; manual SQL clears only |
| Consent / notice | Public enquire form — no privacy policy linkage observed in code review |
| Audit logs | `activities` + `integration_events` — good start; not immutable; incomplete for admin destructive actions |
| Role boundaries | Frontend + partial backend; undermined by set-role and email bypasses |
| Data residency | Supabase project region not encoded in repo — confirm with client |
| Access on shared PCs | sessionStorage passwords + long JWT TTL (7 days default) |

For a long-lived Indian real-estate CRM handling customer phones, plan: retention windows, admin audit pack, DPDP-oriented notices, and removal of demo backdoors.

---

## 13. Gap analysis (long-lived CRM)

Not covered (or only stubbed) today:

- Multi-tenant / multi-project isolation
- Formal SLA timers and escalation (missed lead is a 24h heuristic, not a managed SLA product)
- Advanced reporting (exportable MIS, cohort conversion, source ROI beyond basic graphs)
- Complete WhatsApp Business automation (currently simulated)
- Native mobile apps (Expo capable; production is web-first)
- Immutable compliance audit trail / SIEM export
- Fine-grained field-level permissions (e.g. hide phone from some roles)
- Document vault for loan KYC with encryption at rest policies beyond Supabase defaults
- Automated schema migrations (CI apply)
- Customer portal / self-serve booking status
- Payment gateway for tokens
- SSO / MFA for admin
- Horizontal scale story (Redis, workers, SQL aggregates)

---

## 14. Prioritized roadmap

### Immediate (0–2 weeks) — **must do**

| Item | Effort | Impact |
|------|--------|--------|
| Remove hardcoded logins & `HARDCODED_USERS` auth paths; force DB-only bcrypt; rotate all published passwords | S | Critical security |
| Delete or admin-gate `POST /api/auth/set-role` (or restrict to existing admin) | S | Critical security |
| Remove email allowlist bypasses; use role + DB flags only | S | High security |
| Rate-limit `/api/auth/session` (stricter than general API) | S | High security |
| Require Meta `X-Hub-Signature-256`; rotate `FACEBOOK_VERIFY_TOKEN` from default | M | High security |
| Lock down `/debug-config` (auth or remove in prod) | S | Medium |
| Confirm `CRON_SECRET`, `JWT_SECRET`, service role set on Render | S | Ops |
| Run `DASHBOARD_PERFORMANCE_INDEXES.sql` / cold indexes on prod if not applied | S | Performance |

### Near-term (1–3 months)

| Item | Effort | Impact |
|------|--------|--------|
| Split `legacy_core.py` into routers (auth, leads, stats, integrations, employees) | L | Maintainability |
| Push dashboard bucket counts into SQL RPC matching Python CASE | L | Scalability |
| Redis (or single-instance explicit) for leads/stats cache | M | Scalability |
| Background job for import + portal polls | M | Reliability |
| Replace Mongo `conftest`; add ASGI tests for authz regressions | M | Quality |
| Frontend e2e smoke (login, assign, bucket open) | M | Quality |
| Modal stacking system; reduce mega-components | M | UX/maintainability |
| Structured logging + Sentry | M | Observability |
| Password policy (length/complexity) + optional MFA for admin | M | Security |

### Strategic (3–12 months)

| Item | Effort | Impact |
|------|--------|--------|
| Migration runner (Supabase CLI) consolidating SQL sprawl | L | Ops |
| Reporting warehouse / scheduled MIS exports | L | Product |
| True WhatsApp + campaign analytics | L | Product |
| MFA/SSO, immutable audit, retention jobs (DPDP-ready) | L | Compliance |
| Worker tier + autoscaling; load-tested 2–5× | L | Scale |
| Optional native builds if field teams need mobile | L | Product |

---

## 15. Appendix

### A. Key file inventory by area

| Area | Paths |
|------|-------|
| Backend entry | `backend/server.py`, `backend/app/main.py`, `backend/app/legacy_core.py` |
| Settings / cache / DB | `backend/app/config/settings.py`, `backend/app/core/cache.py`, `backend/app/db/supabase.py` |
| Notifications | `backend/app/notification_service.py`, `backend/app/fcm_client.py` |
| Frontend auth/API | `frontend/src/auth/AuthContext.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/constants.ts` |
| Dashboards | `frontend/app/(app)/dashboard.tsx`, `my-dashboard.tsx`, `EmployeePerformance.tsx`, `DashboardLeadsModal.tsx` |
| Assign / leads UI | `assign-leads.tsx`, `LeadDetailModal.tsx`, `AssignLeadsPanel.tsx` |
| Deploy | `render.yaml`, `backend/Dockerfile`, `frontend/vercel.json`, `docker-compose.yml` |
| Docs | `README.md`, `UNDERSTAND.md`, `docs/PROJECT_DOCS.md`, `docs/NOTIFICATIONS.md` |

### B. SQL scripts list (`supabase/`)

| File | Role (summary) |
|------|----------------|
| `final_schema.sql` | Canonical idempotent schema |
| `FINAL_RUN_THIS.sql` | Large combined apply pack |
| `schema.sql` | Earlier full schema |
| `FULL_DATABASE_UPDATE.sql` | Broad update script |
| `APPLY_TO_EXISTING_DB.sql` | Incremental apply |
| `DASHBOARD_PERFORMANCE_INDEXES.sql` | Perf indexes |
| `COLD_LEADS.sql` | Cold priority indexes/comments |
| `BOOKING_PIPELINE.sql` | Booking pipeline support |
| `NOTIFICATIONS_SYSTEM.sql` / `NOTIFICATIONS_PERFORMANCE_FIX.sql` | Notifications |
| `EMPLOYEE_DASHBOARD_FIX.sql` / `employee_*.sql` | Employee metrics/follow-ups/missed |
| `EXCEL_IMPORT_AUTO_ASSIGN_FIX.sql` | Import/assign |
| `EMPLOYEE_LOCATION_FIX.sql` | GPS fields |
| `RUN_THIS_WORKFLOW_FIX.sql` | Workflow fixes |
| `CLIENT_HANDOFF_CLEAN.sql` / `CLEAR_DATA.sql` / `full_reset_clean.sql` / `cleanup_dummy_data.sql` | Data hygiene (dangerous) |
| `assign_leads_migration.sql`, `booking_costs_migration.sql`, `employee_login_migration.sql`, `lead_call_status_migration.sql`, `workflow_sales_executive_migration.sql`, `housing_lead_timestamps.sql`, `manager_dashboard_fix.sql`, `final_fix_all.sql` | Historical patches |
| `migrations/20260529_housing_integration_rls.sql` | Only formal migration file |
| `Untitled` | Stray file — clean up |

### C. Technical debt hotspots

1. `backend/app/legacy_core.py` (~9.3k lines)  
2. Hardcoded auth & RBAC email lists  
3. SQL script sprawl without ordered migrations  
4. `fetch_all_leads_merged` as dashboard backbone  
5. `LeadDetailModal.tsx` / `assign-leads.tsx` / `bookings.tsx` mega-UI  
6. `backend/tests/conftest.py` Mongo legacy  
7. Simulated WhatsApp vs production expectations  
8. `backend/legacy/` and `scripts/scratch/` retained near prod tree  
9. UNDERSTAND.md / PRD drift vs `legacy_core` reality  
10. In-process caches vs multi-instance deploy  

### D. API surface (selected)

Auth, leads (public/import/filtered/assign/bulk), visits, bookings, loans, customers, notifications/FCM, employees, templates/campaigns, stats/dashboard-bundle/me-bundle, integrations Facebook/Housing, admin flush-caches, health — all registered in `legacy_core.py` (see route list from `@api_router` markers ~2180–9103).

---

## Closing statement

Umang CRM is a **working, domain-aware production CRM** for a single real-estate organization, with thoughtful exclusive lead accounting and live portal integrations. It is **not yet production-grade in security posture or structural scalability**. Treat the Immediate roadmap as a **change-control gate**: remove demo backdoors and role self-elevation before further feature investment. Then invest in SQL-side aggregations and modularization so daily use at 2× load remains predictable.

*End of report.*
