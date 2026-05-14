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

# 1. Check if 'password' column exists
r = httpx.get(url + "?select=*", headers=headers, params={"limit": 1})
if r.status_code == 200:
    user = r.json()[0]
    print(f"Current columns: {list(user.keys())}")
    
    if 'password' not in user:
        print("Column 'password' is MISSING. We need to add it.")
        # We can't add columns via REST API easily.
        # But we saw 'password_hash' exists. Maybe we should use that?
        # No, the code in server.py uses 'password'.
        
        # Let's try to rename password_hash to password if possible via RPC
        # But setup_supabase.py's RPC trick was failing with 401.
        # Wait, why was it failing with 401 if the key is correct?
        # Maybe the RPC endpoint requires a DIFFERENT key or the project ref in the URL was indeed different?
        
        pass
    else:
        print("Column 'password' exists. Setting its value...")
        r2 = httpx.patch(url + "?email=eq.htshpatil13@gmail.com", headers=headers, json={"password": "umang@admin"})
        print(f"Update password status: {r2.status_code}")
        print(r2.text)
else:
    print(f"Error checking columns: {r.status_code} {r.text}")
