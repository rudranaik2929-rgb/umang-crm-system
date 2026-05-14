import httpx
import re

with open('scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/employees"
r = httpx.get(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
print(r.text)
