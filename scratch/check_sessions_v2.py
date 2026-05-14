import httpx
import json

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/leads?select=*"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

r = httpx.get(url, headers=headers)
print(f"Status: {r.status_code}")
print(r.text)
