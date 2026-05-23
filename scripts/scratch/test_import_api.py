import csv
import openpyxl
import httpx
import os

token = "sess_5cd289ab63ba"
headers = {
    "Authorization": f"Bearer {token}"
}

# 1. Create CSV file
csv_path = "scripts/scratch/temp_test_leads.csv"
with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["Name", "Phone", "Email", "Budget", "Location", "Property Type", "Notes"])
    writer.writerow(["Test CSV Lead 1", "9999999991", "csv1@example.com", "50 Lacs", "Wakad", "2BHK", "CSV notes 1"])
    writer.writerow(["Test CSV Lead 2", "9999999992", "csv2@example.com", "80 Lacs", "Baner", "3BHK", "CSV notes 2"])
    writer.writerow(["Skipped CSV Lead", "", "skip@example.com", "", "", "", ""])

# 2. Create Excel file
xlsx_path = "scripts/scratch/temp_test_leads.xlsx"
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Leads"
ws.append(["Customer Name", "Contact Number", "Email Address", "Budget", "Locality", "Configuration", "Remarks"])
ws.append(["Test Excel Lead 1", "8888888881", "xls1@example.com", "1.2 Cr", "Balewadi", "3BHK", "Excel notes 1"])
ws.append(["Test Excel Lead 2", "8888888882", "xls2@example.com", "90 Lacs", "Kothrud", "2.5BHK", "Excel notes 2"])
ws.append(["", "8888888883", "skip_xls@example.com", "", "", "", ""]) # Skipped because no name
wb.save(xlsx_path)

print("Mock CSV and Excel sheets generated.")

# Try to find running server
base_url = None
for port in ["8001", "8000"]:
    try:
        r = httpx.get(f"http://localhost:{port}/api/leads", headers=headers)
        if r.status_code == 200:
            base_url = f"http://localhost:{port}/api"
            print(f"Found running server at: {base_url}")
            break
    except Exception:
        continue


if not base_url:
    print("Could not find a running server on 8000 or 8001. Please make sure uvicorn is started.")
    # Exit cleanly
    os.remove(csv_path)
    os.remove(xlsx_path)
    exit(1)

# 3. Test CSV Import
print("\n--- Testing CSV Import ---")
with open(csv_path, "rb") as f:
    files = {"file": (os.path.basename(csv_path), f, "text/csv")}
    r = httpx.post(f"{base_url}/leads/import", headers=headers, files=files, timeout=10.0)
    print(f"Status Code: {r.status_code}")
    print(f"Response: {r.text}")

# 4. Test Excel Import
print("\n--- Testing Excel Import ---")
with open(xlsx_path, "rb") as f:
    files = {"file": (os.path.basename(xlsx_path), f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = httpx.post(f"{base_url}/leads/import", headers=headers, files=files, timeout=10.0)
    print(f"Status Code: {r.status_code}")
    print(f"Response: {r.text}")

# Clean up
os.remove(csv_path)
os.remove(xlsx_path)
print("\nTemporary test files cleaned up.")
