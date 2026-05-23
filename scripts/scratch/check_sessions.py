import httpx
import json
import re

with open('scripts/scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/sessions?select=*"
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

r = httpx.get(url, headers=headers, params={"limit": 1})
if r.status_code == 200:
    if r.json():
        print(json.dumps(r.json()[0], indent=2))
    else:
        print("Sessions table is empty, but it exists.")
else:
    print(f"Error: {r.status_code} {r.text}")
