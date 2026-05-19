import httpx

token = "sess_5cd289ab63ba"
headers = {
    "Authorization": f"Bearer {token}"
}

print("Testing DELETE /api/leads/clear-all...")
r = httpx.delete("http://localhost:8000/api/leads/clear-all", headers=headers, timeout=15.0)
print(f"Status Code: {r.status_code}")
print(f"Response: {r.text}")
