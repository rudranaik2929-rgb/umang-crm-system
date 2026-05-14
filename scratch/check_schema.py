import httpx
import json

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/users?select=*"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Range": "0-0"
}

r = httpx.get(url, headers=headers)
if r.status_code == 200:
    print(json.dumps(r.json()[0], indent=2))
else:
    print(f"Error: {r.status_code} {r.text}")
