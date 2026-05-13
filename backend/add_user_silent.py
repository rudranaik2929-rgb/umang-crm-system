"""Silent script to add Rusheel's login account."""
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

# Find existing employee ID
r = httpx.get(f"{SUPABASE_URL}/rest/v1/employees?name=ilike.*Rusheel*&select=employee_id", headers=HEADERS)
data = r.json()
eid = data[0]['employee_id'] if data else f"emp_{uuid.uuid4().hex[:12]}"

# Create User
user_payload = {
    "user_id": f"usr_{uuid.uuid4().hex[:12]}",
    "email": "naikrusheel2010@gmail.com",
    "password": "umang@admin",
    "name": "Rusheel Naik",
    "role": "admin",
    "employee_id": eid,
    "created_at": now_utc()
}
httpx.post(f"{SUPABASE_URL}/rest/v1/users", headers=HEADERS, json=user_payload)
