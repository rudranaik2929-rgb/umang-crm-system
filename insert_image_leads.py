import httpx
from datetime import datetime, timezone
import uuid
import sys

def gen_id(prefix): return prefix + "_" + uuid.uuid4().hex[:12]

# Production Supabase credentials from server.py
SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

leads_data = [
    {
        "name": "Shastri Ramnarayan mishra",
        "phone": "9869122319",
        "budget": "31.5 Lac-37.0 Lac",
        "location": "Nalasopara West",
        "property_type": "1 BHK",
        "notes": "Project: Vimal Classic"
    },
    {
        "name": "Pankaj",
        "phone": "8850013110",
        "budget": "34.72 Lac-64.75 Lac",
        "location": "Nalasopara West",
        "property_type": "1 BHK 2 BHK",
        "notes": "Project: AB Aleen Heights"
    },
    {
        "name": "Sajit",
        "phone": "9960242281",
        "budget": "34.72 Lac-64.75 Lac",
        "location": "Nalasopara West",
        "property_type": "1 BHK 2 BHK",
        "notes": "Project: AB Aleen Heights"
    },
    {
        "name": "Resna Raj",
        "phone": "8943440801",
        "budget": "36.53 Lac-37.01 Lac",
        "location": "Nalasopara West",
        "property_type": "1 BHK",
        "notes": "Project: AV Aashirwad Garden"
    },
    {
        "name": "mahendra",
        "phone": "8082571290",
        "budget": "40.42 Lac-83.0 Lac",
        "location": "Nalasopara West",
        "property_type": "1 BHK 2 BHK",
        "notes": "Project: Realtech Dhananjay Heights"
    }
]

def add_leads():
    # Fetch employees to do round-robin
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/employees?role=eq.telecaller&active=eq.true", headers=headers)
    telecallers = r.json() if r.status_code == 200 else []
    if not telecallers:
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/employees?role=eq.admin&active=eq.true", headers=headers)
        telecallers = r.json() if r.status_code == 200 else []
    
    tc_index = 0

    print(f"Found {len(telecallers)} active telecallers/admins to assign leads to.")

    for i, lead_info in enumerate(leads_data):
        assigned_to = None
        if telecallers:
            tc = telecallers[tc_index % len(telecallers)]
            assigned_to = tc["employee_id"]
            tc_index += 1

        lid = gen_id("lead")
        now = datetime.now(timezone.utc).isoformat()
        
        lead = {
            "lead_id": lid,
            "name": lead_info["name"],
            "phone": lead_info["phone"],
            "email": "",
            "budget": lead_info["budget"],
            "location": lead_info["location"],
            "property_type": lead_info["property_type"],
            "notes": lead_info["notes"],
            "source": "excel_import",
            "stage": "new",
            "status": "active",
            "assigned_to": assigned_to,
            "created_at": now,
            "updated_at": now
        }
        
        print(f"Inserting lead: {lead['name']}")
        r_lead = httpx.post(f"{SUPABASE_URL}/rest/v1/leads", headers=headers, json=lead)
        if r_lead.status_code >= 400:
            print(f"Error inserting lead {lead['name']}: {r_lead.text}")
            continue

        # Log activity
        act = {
            "activity_id": gen_id("act"),
            "lead_id": lid,
            "user_id": None,
            "type": "manual_enquiry",
            "text": f"[System] Bulk excel import entry created for {lead['name']}.",
            "created_at": now
        }
        r_act = httpx.post(f"{SUPABASE_URL}/rest/v1/activities", headers=headers, json=act)
        if r_act.status_code >= 400:
            print(f"Error logging activity for {lead['name']}: {r_act.text}")
            
    print("Done inserting image leads!")

if __name__ == "__main__":
    add_leads()
