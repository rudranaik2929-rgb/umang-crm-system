import httpx
key = ""
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/bookings"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}
r = httpx.get(url + "?limit=1", headers=headers)
print(r.json())
