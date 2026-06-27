# Umang CRM — Notification System

Production mobile-first notifications for telecallers and sales teams on **Android Chrome** and **installed PWA**.

> **Stack note:** This CRM uses **Expo (React Native Web)**, not Next.js. UI uses the existing theme system (mobile-first cards, same UX goals as Housing/WhatsApp-style alerts).

## Setup (one-time)

### 1. Supabase SQL

Run in **Supabase → SQL Editor**:

```bash
supabase/NOTIFICATIONS_SYSTEM.sql
```

This adds:

- Extended `notifications` columns (`sender_id`, `priority`, `read_at`, `metadata`)
- `fcm_device_tokens`, `notification_preferences`, `notification_push_queue`
- Supabase Realtime on `notifications`

### 2. Backend (Render)

Set environment variables:

| Variable | Purpose |
|----------|---------|
| `FCM_PROJECT_ID` | Firebase project ID |
| `FCM_SERVICE_ACCOUNT_JSON` | Service account JSON (inline or file path) |

Redeploy backend after setting vars.

### 3. Frontend (Vercel)

Add these in **Vercel → Project → Environment Variables** (same names as your Firebase web app):

| Variable | Example |
|----------|---------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | From Firebase web app config |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `umang-6cbd6.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `umang-6cbd6` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `umang-6cbd6.firebasestorage.app` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Web app ID |
| `EXPO_PUBLIC_FIREBASE_VAPID_KEY` | Cloud Messaging → Web Push certificates |

Redeploy frontend (build runs `generate-firebase-config.js` automatically).

**Never commit** the service account JSON or private keys to GitHub.

### 4. Install as PWA (Android Chrome)

1. Open CRM in Chrome on Android  
2. Menu → **Add to Home screen** / **Install app**  
3. Open **Notification Settings** → enable **Push Notifications**  
4. Allow browser permission when prompted  

## Features

| Feature | Status |
|---------|--------|
| In-app bell + unread badge | ✅ |
| Dropdown (latest 8) | ✅ |
| Full notifications page (search, filters, infinite scroll) | ✅ |
| Mark read / mark all / delete | ✅ |
| Supabase Realtime (INSERT → instant UI) | ✅ (with anon key) |
| FCM push (background / locked screen) | ✅ (with Firebase config) |
| PWA manifest + service worker | ✅ |
| Per-user preferences | ✅ |
| Admin broadcast | ✅ |
| Tap notification → open lead | ✅ |

## Notification events

| Event | Recipient |
|-------|-----------|
| Lead assigned | Employee |
| Lead reassigned (removed) | Old employee |
| Lead reassigned (new) | New employee |
| Lead status updated | Managers |
| Employee note added | Managers |
| Manager comment | Assigned employee |
| New Facebook lead | Managers |
| New Housing lead | Managers |
| Follow-up scheduled | Employee |
| Lead closed / won / lost | Managers |

## API endpoints

| Method | Path |
|--------|------|
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| PATCH | `/api/notifications/{id}/read` |
| POST | `/api/notifications/read-all` |
| DELETE | `/api/notifications/{id}` |
| POST | `/api/notifications/fcm-token` |
| GET/PATCH | `/api/notifications/preferences` |
| POST | `/api/notifications/broadcast` (admin) |

## Architecture

```
Event (assign, note, webhook, …)
        ↓
NotificationService.create_notification()
        ↓
Supabase INSERT → Realtime → UI updates instantly
        ↓
FCM push (if token + preferences allow)
        ↓
Failed push → notification_push_queue (retry)
```

## Security

- Users can only read/mark/delete **their own** notifications (`user_id` = employee_id)
- FCM tokens scoped per user
- Admin broadcast requires `admin` role
- Push payload contains no secrets — title, message, lead_id only
