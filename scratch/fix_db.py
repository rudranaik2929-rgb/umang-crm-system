import httpx
import json

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/rpc/"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# 1. Add password column if missing
# 2. Update admin password
# Note: This assumes there is an 'rpc' function that can execute SQL.
# If not, we might have to use another way.
# But wait, setup_supabase.py uses /rest/v1/rpc/ with {"query": sql}.
# Let's try that.

queries = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;",
    "UPDATE users SET password = 'umang@admin' WHERE email = 'htshpatil13@gmail.com';"
]

for q in queries:
    print(f"Running query: {q}")
    r = httpx.post(url, headers=headers, json={"query": q})
    print(f"Status: {r.status_code}, Response: {r.text}")
