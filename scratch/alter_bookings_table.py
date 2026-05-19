import httpx

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

client = httpx.Client(timeout=30)
sql = "ALTER TABLE bookings ADD COLUMN brokerage_amount NUMERIC DEFAULT 0;"

print("Trying direct RPC...")
try:
    resp = client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/",
        headers=HEADERS,
        json={"query": sql},
    )
    print("RPC response:", resp.status_code, resp.text[:200])
except Exception as e:
    print("RPC error:", e)

print("Trying /pg/query...")
try:
    resp2 = client.post(
        f"{SUPABASE_URL}/pg/query",
        headers=HEADERS,
        json={"query": sql},
    )
    print("pg/query response:", resp2.status_code, resp2.text[:200])
except Exception as e:
    print("pg/query error:", e)
