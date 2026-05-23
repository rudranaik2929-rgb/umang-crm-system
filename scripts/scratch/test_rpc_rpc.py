import httpx
import re

with open('scripts/scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/rpc/rpc" # Trying function name 'rpc'
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

sql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;"
r = httpx.post(url, headers=headers, json={"query": sql})
print(f"Status: {r.status_code}, Response: {r.text}")
