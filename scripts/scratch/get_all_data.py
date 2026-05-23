import httpx
import json

key = ""

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
