import httpx
import json

# Extract key from scripts/scratch/get_users.py
import re
with open('scripts/scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/leads?select=*"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Range": "0-0"
}

r = httpx.get(url, headers=headers)
if r.status_code == 200:
    data = r.json()
    if data:
        print("Schema columns for leads:")
        print(json.dumps(data[0], indent=2))
    else:
        print("No leads found in table.")
else:
    print(f"Error: {r.status_code} {r.text}")
