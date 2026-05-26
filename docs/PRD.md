# PRD – Umang Hometech LLP CRM

> Current handover note: this PRD is older and still says MongoDB in a few places. The active backend now lives in `backend/app/main.py` and uses Supabase/PostgREST. Read `../UNDERSTAND.md` first for current structure.

## Overview
A premium real estate CRM & employee workflow management dashboard for Umang Hometech LLP. Built as Expo (React Native Web) for desktop browsers. Starts with **zero data** so the user can play every role and walk through the entire workflow end-to-end.

## Workflow
Lead Generated → Telecaller → Site Visit → Booking → Loan → Registration → Closed
Side-channel: Negative Leads (for re-engagement campaigns)

## Authentication
- **Local Email/Password Auth** (Bearer-token persistence)
- First user becomes `admin`; subsequent users pick a role
- Role can be switched anytime from top bar (demo-friendly)

## Modules
1. **Admin Dashboard** – Stat cards (leads, positive/negative, visits, bookings, follow-ups, loans, employees, revenue), pipeline distribution chart, lead-health donut, live activity feed
2. **Lead Pipeline (Kanban)** – 8 columns (new → closed), tap card opens lead detail
3. **Telecaller** – Filtered queues (queue/all/positive/negative) with action modal
4. **Site Visits** – Schedule, complete, create required date/time/day follow-ups, mark interested/booking-ready
5. **Bookings** – Property+amount+token tracking with payment progress bar, agreement state
6. **Loan Department** – Bank stage stepper (documentation → verification → sanction → disbursal), pending docs, EMI eligibility
7. **WhatsApp Campaigns** (UI simulation) – Templates + audience-targeted campaigns; sending shows simulated delivery/read/reply analytics
8. **Employees** – Add/disable/delete with role + department
9. **Negative Leads** – Reservoir for future campaigns; reactivate from detail

## Key UX
- Light/Dark theme toggle (default dark, premium navy + gold accents)
- Collapsible sidebar with department-coloured nav
- Empty states everywhere (since the system starts empty)
- Lead detail modal with quick actions (Positive / Negative / Follow-up / Site Visit / Booking / Loan / Advance / Reactivate) + call notes + activity timeline

## Backend (FastAPI + MongoDB)
- All routes prefixed `/api`
- Custom `user_id` per user, MongoDB `_id` always excluded
- Activity log auto-appends on every stage change
- Stats endpoint computes pipeline + revenue aggregates

## Out-of-scope (prototype)
- Real WhatsApp/Twilio integration (UI simulation only)
- Payment gateways
- Email/SMS notifications
- Mobile native build (planned for post-demo)
