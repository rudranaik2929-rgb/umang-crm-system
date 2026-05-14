import httpx
import re

# Extract key from get_users.py
with open('scratch/get_users.py', 'r') as f:
    content = f.read()
    key = re.search(r'key = "(.*?)"', content).group(1)

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/users"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

print("Setting password_hash for admin...")
r = httpx.patch(url + "?email=eq.htshpatil13@gmail.com", headers=headers, json={"password_hash": "umang@admin"})
print(f"Status: {r.status_code}")
print(r.text)
