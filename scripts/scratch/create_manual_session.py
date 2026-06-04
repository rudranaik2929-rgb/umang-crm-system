import httpx
import re
import uuid
from datetime import datetime, timedelta, timezone

with open('scripts/scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/sessions"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Generate a long-lived session for the admin
session_token = f"sess_manual_{uuid.uuid4().hex[:12]}"
user_id = "user_admin001"
now = datetime.now(timezone.utc)
expires = now + timedelta(days=30)

data = {
    "session_token": session_token,
    "user_id": user_id,
    "created_at": now.isoformat(),
    "expires_at": expires.isoformat()
}

print(f"Creating session: {session_token}")
r = httpx.post(url, headers=headers, json=data)
if r.status_code < 300:
    print("SUCCESS!")
    print(f"Session Token: {session_token}")
    print("Instructions: Set the 'session_token' cookie in your browser for 'umanghometechllp.in' (or api.umanghometechllp.in for API-only tests)")
else:
    print(f"FAILED: {r.status_code} {r.text}")
