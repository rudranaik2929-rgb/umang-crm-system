import httpx
key = ""

# Test inserting a loan with all columns
l = {
    "loan_id": "lon_verify", "lead_id": "test", "lead_name": "Verify Test",
    "bank_name": "HDFC Bank", "amount": 5000000, "application_status": "pending",
    "bank_stage": "documentation", "emi_eligible": None, "progress": 0
}

r = httpx.post(
    "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/loans",
    headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation"},
    json=l
)
print("INSERT:", r.status_code, r.text)

# Clean up test
r2 = httpx.delete(
    "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/loans?loan_id=eq.lon_verify",
    headers={"apikey": key, "Authorization": f"Bearer {key}"}
)
print("DELETE:", r2.status_code)
