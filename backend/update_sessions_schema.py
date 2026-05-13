"""Add acting_as_employee_id to sessions table."""
import httpx

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

# SQL to add the column
sql = "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS acting_as_employee_id TEXT;"

r = httpx.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=HEADERS, json={"sql": sql})
if r.status_code < 400:
    print("✅ Column added to sessions table")
else:
    print(f"❌ Error: {r.status_code} {r.text}")
