import openpyxl
import httpx
import os

token = "sess_5cd289ab63ba"
headers = {
    "Authorization": f"Bearer {token}"
}

xlsx_path = "scripts/scratch/temp_property_leads.xlsx"
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Leads"
ws.append(["Customer Name", "Phone", "Property Name", "Location", "Budget", "Remarks"])
ws.append(["Robin", "9594368786", "AB Aleen Heights", "Nalasopara West", "34.72 Lac", "Interested in 1 BHK"])
wb.save(xlsx_path)

print("Mock property spreadsheet generated.")

# Try to find running server
base_url = "http://localhost:8000/api"

print("\n--- Testing Excel Import with Property Name Column ---")
with open(xlsx_path, "rb") as f:
    files = {"file": (os.path.basename(xlsx_path), f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = httpx.post(f"{base_url}/leads/import", headers=headers, files=files, timeout=10.0)
    print(f"Status Code: {r.status_code}")
    print(f"Response: {r.text}")

# Clean up
os.remove(xlsx_path)
print("\nTemporary test file cleaned up.")
