import httpx
import json

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

def get_table(table):
    url = f"https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    r = httpx.get(url, headers=headers)
    if r.status_code == 200:
        return r.json()
    else:
        print(f"Error {table}: {r.status_code} {r.text}")
        return []

print("--- USERS ---")
users = get_table("users")
for u in users:
    print(u)

print("\n--- EMPLOYEES ---")
employees = get_table("employees")
for e in employees:
    print(e)
