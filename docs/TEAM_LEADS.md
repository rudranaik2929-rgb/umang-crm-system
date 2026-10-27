# Team Leads, Regions and Monthly Lead Exports

The single "Manager" role was replaced by any number of **Team Leads**. Each Team Lead covers one or more **regions**
(Virar, Vasai, Nallasopara, Nagpur, and more can be added) and leads their own employees.
The UI never says "Manager". Old database rows with `role = 'manager'` are treated as `team_lead`
by both backend and frontend until `supabase/TEAM_LEADS_AND_EXPORTS.sql` renames them.

## 1. Lead flow

```text
New lead (Housing / Meta / website / import / manual)
        │   always lands here first — nobody is auto-assigned
        ▼
  ADMIN POOL            leads.team_lead_id = NULL, leads.assigned_to = NULL
        │  Admin → "Assign to Team Lead" (manual, or Auto by region)
        ▼
  TEAM LEAD POOL        leads.team_lead_id = <team lead employee_id>, assigned_to = NULL
        │  Team Lead → "Assign to employee" (only their own team)
        ▼
  EMPLOYEE              leads.assigned_to = <employee_id>, team_lead_id = that employee's team lead
```

**Ownership rule** (`backend/app/team_scope.py`, `TeamDirectory.lead_team_lead_id`):

1. If `leads.team_lead_id` is set, that Team Lead owns the lead.
2. Otherwise, if the lead has an employee, the employee's Team Lead owns it. This covers every lead
   assigned before Team Leads existed, so the migration loses nothing.
3. Otherwise the lead is in the admin pool.

Every lead is therefore in exactly one place:
`admin_pool + no_team_assigned + sum(teams[*].total) == pipeline_total` (see `/teams/overview`).

When a lead is assigned to an employee, its `team_lead_id` is set to that employee's Team Lead.

## 2. Who can do what

| Action | Admin | Team Lead | Employee |
|---|---|---|---|
| See leads | all | own team only (backend-scoped) | as before |
| Assign lead to a Team Lead | ✅ | ❌ | ❌ |
| Assign lead to an employee | any active employee | own team only | ❌ |
| Return lead to admin pool | ✅ | ✅ (own team's leads) | ❌ |
| Emergency transfer between Team Leads | ✅ | ❌ | ❌ |
| Delete leads | ✅ | ❌ (mark not-interested instead) | ❌ |
| Add / edit employees | any | own team (cannot create Team Leads/Admins) | ❌ |
| Teams & Regions page | ✅ | ❌ | ❌ |
| Export Leads page | all leads | own team | ❌ |
| Dashboard | company | own team | — |
| Integrations, WhatsApp campaigns | ✅ (+ marketing) | ❌ | marketing only |

**Team scoping is enforced in the backend.** A Team Lead request sets a context variable in
`get_current_user` (`_finish_request_user`). After that, `fetch_all_leads_merged`, the employee lists,
dashboards, stats, tracking and exports return only that team's rows. Frontend checks are only for
showing or hiding UI.

Removing a Team Lead who still has leads or members (demote, deactivate, delete) is refused with **409**.
Move their leads and people first with Teams → Transfer.

Deleting an employee moves their leads that are still being worked (stages new / assigned / positive / site_visit)
back to their Team Lead's pool. Leads in booking, loan, registration or closed stay with them.

## 3. Database (run once)

Run `supabase/TEAM_LEADS_AND_EXPORTS.sql` in the Supabase SQL Editor. The same statements are also at the end of
`SCHEMA_MASTER.sql`. It is idempotent and non-destructive.

- `regions(region_id, name, keywords, active)`, seeded with Virar, Vasai, Nallasopara, Nagpur.
  `keywords` holds comma-separated spellings matched against lead location.
- `employees.team_lead_id`, `employees.regions` (jsonb list; `["*"]` = all regions).
- `leads.team_lead_id`, `leads.team_lead_assigned_at`, `leads.team_lead_assigned_by`.
- `lead_exports` (archive index), with files in the private Storage bucket `lead-exports`. The backend creates the bucket.
- Renames `manager` → `team_lead` on `employees.role`, `users.role` and `users.dashboard_type`.

Until the SQL runs, the CRM keeps working. Team columns are only selected once they exist, and team actions
return 409 with a "run the SQL" message. `/schema-check` lists anything missing.

## 4. API

All paths are under `/api`. Admin = `admin`; TL = `team_lead`.

### Regions
- `GET /regions` (any login) returns `{ regions: [{region_id, name, keywords, active, team_leads: [names]}], editable }`.
- `POST /regions` (admin) takes `{ name, keywords? }`.
- `PATCH /regions/{region_id}` (admin) takes `{ name?, keywords?, active? }`. A rename also updates Team Leads that cover the region.
- `DELETE /regions/{region_id}` (admin) is a soft delete (`active = false`).

### Teams
- `GET /teams/overview` (admin, TL) returns:
  ```json
  { "team_leads": [{ "employee_id", "name", "email", "phone", "active", "location", "regions": ["Virar"],
                     "members": [{ "employee_id", "name", "email", "role", "active", "location" }],
                     "leads": { "total", "pool", "assigned" } }],
    "pipeline_total": 0, "columns_ready": true, "regions_ready": true,
    "admin_pool": 0, "admin_pool_active": 0, "no_team_assigned": 0,
    "unteamed_employees": [{ "employee_id", "name", "role", "active", "location" }] }
  ```
  `admin_pool*`, `no_team_assigned` and `unteamed_employees` are returned to admins only.
- `POST /teams/members` (admin) takes `{ employee_ids: [], team_lead_id: string|null, move_leads: true }`. It puts
  employees under a Team Lead (null removes them from any team), and their current leads move with them.
  Returns `{ moved: [employee_id], skipped: [{employee_id, reason: not_found|is_team_lead_or_admin|save_failed}], leads_moved: number }`.
- `POST /teams/transfer` (admin) is the emergency transfer:
  ```json
  { "from_team_lead_id": "emp_a", "to_team_lead_id": "emp_b",
    "lead_ids": null,                  // null/[] = every lead of emp_a (incl. broker & not-interested)
    "mode": "keep_assignees",          // or "return_to_pool"
    "move_members": false }
  ```
  - `keep_assignees`: employees keep working the leads and B supervises them.
  - `return_to_pool`: the leads go to B's pool to be handed out again.
  - Returns `{ status, moved_count, failed_count, members_moved, skipped, from, to }`.

### Assign Leads (changed)
- `GET /leads/assign-workspace` keeps all old params and adds:
  - `team`: `all` | `admin_pool` | `<team lead employee_id>`. Admins only; ignored for a Team Lead.
  - `team_view`: `all` | `pool` (no employee yet) | `assigned`.
  - `region`: region_id or name. Matches the lead location, locality, city and notes against the region name and keywords.

  The response adds:
  - `team_leads: [{employee_id, name, email, regions, member_count}]`: admin gets all, a TL gets themselves.
  - `facets.team: { pipeline_total, admin_pool, admin_pool_active, no_team_assigned, teams: { <tl_id>: {total, pool, assigned} } }`.
  - `viewer: { is_admin, team_lead_id, team_columns_ready }`.
  - `assignable[]` rows now carry `team_lead_id, team_lead_name`. A TL only gets their own team.
  - Each lead row now carries `team_lead_id` (the effective owner; null = admin pool) and `team_lead_name`.
- `POST /leads/bulk-manage` keeps the old fields and adds:
  - `team_lead_id`: admin only. Hands the leads to that Team Lead's pool. A lead whose employee is in another team
    is unassigned so it lands in the new pool. Set `keep_assignee: true` to keep the employee.
  - `return_to_admin: true`: admin or TL. Clears team and employee, and the leads go back to the admin pool.
  - A TL may only send their own team's leads (others come back as `skipped` with `not_in_team`) to their own team's employees.
  - Returns `{ status: success|partial, updated_count, updated, skipped: [{lead_id, reason}], failed_count }`.
    Leads the database rejected show up as `save_failed`. They are never reported as assigned.
- `POST /leads/bulk-assign` follows the same team rules.
- `POST /leads/assign-queue/auto`:
  - Admin: admin-pool leads go to Team Leads. A lead whose location matches a TL's region goes to that TL;
    the rest round-robin across TLs.
  - TL: their pool round-robins across their telecallers and sales executives.
  - Returns `per_target`.
- `GET /stats/assignment` is team-scoped for a TL and adds `team` (same shape as `facets.team`) and `team_leads`.
  Employee rows add `team_lead_id, team_lead_name`.
- `PATCH /leads/{id}` with `assigned_to`:
  - The employee must exist, and for a TL must be in their team.
  - `assigned_to: ""` now unassigns properly; the lead stays with the team.
- `DELETE /leads/{id}` and `POST /leads/bulk-delete` are admin only.

### Employees (changed)
- `GET /employees`: rows add `team_lead_id` (a Team Lead's own row = their own id), `team_lead_name` and `regions`.
  A TL gets only their team.
- `POST /employees` adds:
  - `team_lead_id`: workers; must be an active TL.
  - `regions`: Team Leads; names from `/regions`, or `["*"]`.

  A TL may only create workers, who are always placed in their own team.
- `PATCH /employees/{id}` with `team_lead_id` (null = no team) moves the employee and their leads, and returns
  `leads_moved`. `regions` is for Team Leads.
  - Demoting or deactivating a TL who still has leads or members returns 409.
- `DELETE /employees/{id}` returns `{ ok, leads_returned }`.

### Lead exports (new)
- `GET /exports/leads/summary?month=YYYY-MM` (admin, TL). The month is an IST calendar month and defaults to the current one.
  Returns:
  ```json
  { "month": "2026-10", "total": 0,
    "days": [{ "date": "2026-10-01", "count": 0, "housing": 0, "meta": 0, "manual": 0, "other": 0, "brokerage": 0 }],
    "by_platform": { "housing", "meta", "manual", "other", "brokerage" },
    "by_status": { "active", "negative" }, "by_team": { "<team lead name or Admin pool>": 0 },
    "average_per_day": 0, "busiest_day": { "date", "count" } | null,
    "scope": "all" | "team:<id>", "history": [ ...see below ], "history_ready": true,
    "storage_bucket": "lead-exports", "generated_at": "..." }
  ```
  `total` counts **every** lead row created that month, including broker-pool and not-interested leads.
- `POST /exports/leads` takes `{ month }` and returns the `.xlsx` file. It has three sheets: Leads, Daily Summary and By Team.
  - The same file is uploaded to Storage and recorded in `lead_exports`.
  - Response headers: `X-Export-Id`, `X-Export-Stored` (`true`/`false`) and `X-Export-Rows`.
  - Frontend helper: `downloadMonthlyLeadsExport(month)` in `src/lib/api.ts`.
- `GET /exports/leads/history` returns `{ exports: [{ export_id, month, scope, team_lead_id, file_name, row_count, stored, kind, created_by_name, created_at }] }`.
  - `kind` is `manual` or `auto` (month-end archive).
- `GET /exports/leads/history/{export_id}/download` re-downloads a stored file. Frontend helper: `downloadStoredLeadsExport(id)`.
- Month-end safety net: a background thread stores last month's full export once (`kind = auto`).
  Disable it with `LEAD_EXPORT_AUTO_ARCHIVE=false`. The bucket name comes from `LEAD_EXPORT_BUCKET`.

### Auth
- `GET /auth/me` adds `team_lead_id`, `team_lead_name` and `regions`.
  - For a TL these are their own id and regions.
  - For an employee they are their TL's id and name.
- Security fixes:
  - `POST /auth/set-role` is admin-only. Others may only confirm their own role.
  - The `X-Acting-As` header is honoured only for admins.
  - The former manager email no longer bypasses role checks.

## 5. Lead-loss fixes in this change
- Full-table reads (`sb_select_all`) used to stop silently when a page errored, which could cache or export a
  partial list. They now retry once, then raise.
- Paging is ordered by `created_at` plus the primary key. Excel imports share midnight timestamps, so ties were
  skipped or duplicated between pages.
- A failed read is no longer mistaken for an empty table by the "DB wiped" probe.
- Bulk assign / manage report `save_failed` leads and only update the cache for rows the database accepted.
- `PATCH` assigned_to rejects unknown employees.
- Unassign resets stage `assigned` → `new`, so the lead shows as a new lead again.
- Deleting an employee returns their active leads to the pool instead of orphaning them.
- The dashboard 30-day chart read leads with one capped query (1000 rows max). It now uses the full paginated set.
- `/schema-check` always said "ok" because `sb_select` never raises. It now uses a strict read.
