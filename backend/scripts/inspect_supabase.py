"""Read-only Supabase diagnostics for the 'leads are missing' investigation.

Uses the service-role key from backend/.env to talk to PostgREST directly.
Read-only: only GET requests are ever issued.
"""
import json
import os
import sys
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
)

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

client = httpx.Client(timeout=60)


def get(path, params=None):
    r = client.get(f"{URL}/rest/v1/{path}", headers=HEADERS, params=params or {})
    if r.status_code >= 400:
        return {"__error__": f"{r.status_code}", "body": r.text[:500]}
    return r.json()


def count(table, extra=None):
    r = client.head(
        f"{URL}/rest/v1/{table}",
        headers={**HEADERS, "Prefer": "count=exact", "Range": "0-0"},
        params=extra or {},
    )
    return int(r.headers.get("Content-Range", "0/0").split("/")[-1])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tables"
    if cmd == "tables":
        rows = get("leads", {"select": "lead_id", "limit": 1})
        print("leads reachable:", "error" not in rows)
        for t in ["leads", "employees", "visits", "bookings", "loans",
                  "activities", "notifications", "lead_notes",
                  "integration_events", "user_profiles", "user_sessions"]:
            print(f"  {t:22} {count(t):>8}")
