import httpx
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

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
