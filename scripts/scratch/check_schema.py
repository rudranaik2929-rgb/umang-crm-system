import httpx
import json

key = ""
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
