"""Add separate login account for Rusheel Naik."""
import httpx
from datetime import datetime, timezone
import uuid

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

def now_utc(): return datetime.now(timezone.utc).isoformat()

# Use UUID for safety
uid = f"usr_{uuid.uuid4().hex[:12]}"
eid = f"emp_{uuid.uuid4().hex[:12]}"

# Create Employee first
print("Creating employee record...")
emp_payload = {
    "employee_id": eid,
    "name": "Rusheel Naik",
    "email": "naikrusheel2010@gmail.com",
    "role": "admin",
    "department": "Management",
    "created_at": now_utc(),
    "active": True
}
httpx.post(f"{SUPABASE_URL}/rest/v1/employees", headers=HEADERS, json=emp_payload)

# Create User
print("Creating user record...")
user_payload = {
    "user_id": uid,
    "email": "naikrusheel2010@gmail.com",
    "password": "umang@admin",
    "name": "Rusheel Naik",
    "role": "admin",
    "employee_id": eid,
    "created_at": now_utc()
}
r = httpx.post(f"{SUPABASE_URL}/rest/v1/users", headers=HEADERS, json=user_payload)

if r.status_code < 400:
    print("✅ Successfully added naikrusheel2010@gmail.com")
else:
    print(f"❌ Failed: {r.status_code} {r.text}")
