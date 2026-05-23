import httpx
import json

key = ""
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/sessions"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

r = httpx.get(url, headers=headers)
if r.status_code == 200:
    users = r.json()
    for user in users:
        print(json.dumps(user, indent=2))
else:
    print(f"Error: {r.status_code} {r.text}")
