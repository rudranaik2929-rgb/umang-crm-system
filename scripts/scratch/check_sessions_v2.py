import httpx
import json

key = ""
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/leads?select=*"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

r = httpx.get(url, headers=headers)
print(f"Status: {r.status_code}")
print(r.text)
