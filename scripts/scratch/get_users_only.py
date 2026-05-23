import httpx
key = ""
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/users"
headers = {"apikey": key, "Authorization": f"Bearer {key}"}
r = httpx.get(url, headers=headers)
print(r.json())
