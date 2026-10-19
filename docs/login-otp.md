# Login OTP (one-time code)

Every sign-in to Umang Properties CRM now requires a **one-time code**, and every
code is emailed to the **administration mailbox** — never to the address the
person typed.

- Admin mailbox (default): `Umanghometechllp@gmail.com`
- Who needs a code: **everyone** — admin, manager, telecaller, every employee.
- Where the code goes: always the administration mailbox above.
- First login on a device: email + password → code emailed to the admin mailbox → enter the code → you are in.
- Same device again: you stay logged in (normal session cookie) — no new code.
- A different device: a fresh code is required, and the existing "Shift session" prompt appears because accounts are single-device.

## How it works

1. `POST /api/auth/otp/request` — checks the email + password, then emails a
   6-digit code to `OTP_EMAIL`.
2. `POST /api/auth/otp/verify` — checks the code (10-minute expiry, 5 attempts)
   and issues the session. If the account is already active on another device,
   it returns `409` and the app offers **Shift**; the code stays valid so Shift
   can reuse it.

Codes are single-use, stored only as a salted SHA-256 hash, and are never
returned in an API response.

Security note: while OTP is enforced, `POST /api/auth/session` and
`/api/auth/shift-session` are closed (they return `403`), so OTP cannot be
bypassed.

## Required environment variables (backend)

| Variable | Default | Notes |
| --- | --- | --- |
| `OTP_EMAIL` | `Umanghometechllp@gmail.com` | Destination for every code. |
| `OTP_LOGIN_ENABLED` | `true` | Emergency escape hatch — set `false` to turn OTP off. |
| `OTP_TTL_SECONDS` | `600` | Code lifetime. |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong-code attempts per code. |
| `SMTP_HOST` | `smtp.gmail.com` | Mail transport. |
| `SMTP_PORT` | `587` | STARTTLS. |
| `SMTP_USER` | — | Sending Gmail address. **Required.** |
| `SMTP_PASSWORD` | — | Gmail **App Password** (16 characters). Required. |
| `SMTP_FROM` | `SMTP_USER` | Optional From header. |

Alternative provider: set `RESEND_API_KEY` (and optionally `RESEND_FROM`)
instead of the `SMTP_*` variables.

### Getting a Gmail App Password

1. Sign in to the sending Gmail account.
2. Enable 2-Step Verification: <https://myaccount.google.com/security>.
3. Create an App Password: <https://myaccount.google.com/apppasswords>.
4. Use that 16-character password as `SMTP_PASSWORD`.

### Setting them on Render

Dashboard → the `umang-crm-backend` service → **Environment** → add
`SMTP_USER` and `SMTP_PASSWORD` (and `OTP_EMAIL` if different) → save
(redeploys automatically).

## Safety valve (no lock-outs)

OTP is enforced only when a mail transport is configured. If `SMTP_USER` /
`SMTP_PASSWORD` (or `RESEND_API_KEY`) are missing, the app falls back to the
normal email + password login so nobody — including the admin — can be locked
out. The moment mail credentials are added, OTP turns itself on.

To turn OTP off deliberately, set `OTP_LOGIN_ENABLED=false`.

## Optional tuning

| Env var | Default | Meaning |
| --- | --- | --- |
| `OTP_TTL_SECONDS` | `600` | Code lifetime in seconds. |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong-code attempts before the challenge dies. |
| `SMTP_FROM` | `SMTP_USER` | "From" header. |

No database change is required for the OTP login.
