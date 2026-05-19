import httpx
from datetime import datetime, timezone
import uuid

def gen_id(prefix): return prefix + "_" + uuid.uuid4().hex[:12]

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Only rows 6 to 40 (0-indexed 5 to 39)
leads_data = [
    {"name": "Nikunj", "phone": "8087778097", "location": "Nalasopara West", "property_type": "1 BHK", "budget": "40.42 Lac-47.0 Lac", "notes": "Project: Realtech Dhananjay Heights"},
    {"name": "bnayaka", "phone": "9148282551", "location": "Virar West", "property_type": "1 BHK", "budget": "21.64 Lac-21.64 Lac", "notes": "Project: Acropolis"},
    {"name": "ankit nirbhavane", "phone": "9768554220", "location": "Virar West", "property_type": "1 BHK", "budget": "39.56 Lac-48.45 Lac", "notes": "Project: Agarwal Paramount"},
    {"name": "Nagesh", "phone": "7738261089", "location": "Virar West", "property_type": "1 BHK", "budget": "37.61 Lac-56.85 Lac", "notes": "Project: Shapoorji Pallonji Joyville Virar Phase 6"},
    {"name": "Rutika Patil", "phone": "8433526196", "location": "Virar West", "property_type": "1 BHK", "budget": "45.94 Lac-46.41 Lac", "notes": "Project: Poonam Park View Phase II"},
    {"name": "Neeta (Owner)", "phone": "9320890800", "location": "Virar West", "property_type": "3 BHK", "budget": "85.76 Lac-85.76 Lac", "notes": "Project: Blu Pearl"},
    {"name": "Chandrakant Vishwakarma", "phone": "8652531190", "location": "Virar West", "property_type": "1 BHK 2 BHK", "budget": "21.64 Lac-35.86 Lac", "notes": "Project: Acropolis"},
    {"name": "Sushila Kumari", "phone": "9279698342", "location": "Virar West", "property_type": "1 BHK", "budget": "33.23 Lac-36.11 Lac", "notes": "Project: Mayfair Virar Gardens Phase 2"},
    {"name": "Leena Khedekar", "phone": "9405565958", "location": "Virar West", "property_type": "1 BHK", "budget": "37.61 Lac-56.85 Lac", "notes": "Project: Shapoorji Pallonji Joyville Virar Phase 6"},
    {"name": "Shailesh Sharma", "phone": "7668749932", "location": "Virar West", "property_type": "1 BHK", "budget": "36.54 Lac-52.01 Lac", "notes": "Project: Evershine Amavi 303"},
    {"name": "Subhash Budhwani", "phone": "9326104727", "location": "Virar West", "property_type": "1 BHK 2 BHK", "budget": "36.54 Lac-65.67 Lac", "notes": "Project: Evershine Amavi 303"},
    {"name": "hemant sharma", "phone": "7021097149", "location": "Virar West", "property_type": "1 BHK 2 BHK 3 BHK", "budget": "43.94 Lac-1.07 Crore", "notes": "Project: Bachraj Legend"},
    {"name": "SAMMI", "phone": "7971119030", "location": "Virar West", "property_type": "1 BHK 2 BHK", "budget": "21.64 Lac-35.86 Lac", "notes": "Project: Acropolis"},
    {"name": "Renuka (Owner)", "phone": "9324458304", "location": "Virar West", "property_type": "1 BHK", "budget": "37.63 Lac-37.63 Lac", "notes": "Project: Laxmi Avenue D Phase III"},
    {"name": "Nenaram", "phone": "7738619562", "location": "Virar West", "property_type": "1 BHK", "budget": "48.57 Lac-56.96 Lac", "notes": "Project: Giriraj Tower"},
    {"name": "Indrajit Sawant", "phone": "9819013291", "location": "Virar West", "property_type": "1 BHK", "budget": "41.92 Lac-43.92 Lac", "notes": "Project: Blu Pearl"},
    {"name": "Deepak Nawghare", "phone": "9730252535", "location": "Virar West", "property_type": "1 BHK 2 BHK", "budget": "21.64 Lac-35.86 Lac", "notes": "Project: Acropolis"},
    {"name": "Afreen", "phone": "8384090240", "location": "Virar West", "property_type": "1 BHK", "budget": "36.22 Lac-36.22 Lac", "notes": "Project: Rustomjee Virar Avenue L1 L2 And L4 Wing I And J"},
    {"name": "Er. Abhidnya Bhoir", "phone": "7971112550", "location": "Virar West", "property_type": "1 BHK", "budget": "42.78 Lac-46.8 Lac", "notes": "Project: Narayan Bhoomi"},
    {"name": "Shweta Singh", "phone": "7045421771", "location": "Virar West", "property_type": "2 BHK", "budget": "44.09 Lac-48.54 Lac", "notes": "Project: Mayfair Virar Gardens Phase 2"},
    {"name": "Mahesh Gaba", "phone": "9833344177", "location": "Virar West", "property_type": "1 BHK 2 BHK", "budget": "21.64 Lac-35.86 Lac", "notes": "Project: Acropolis"},
    {"name": "Sandeep Solkar", "phone": "8983508802", "location": "Virar West", "property_type": "1 BHK", "budget": "42.65 Lac-46.54 Lac", "notes": "Project: Bachraj Lifespace"},
    {"name": "R S", "phone": "9518330559", "location": "Virar West", "property_type": "1 BHK", "budget": "21.64 Lac-21.64 Lac", "notes": "Project: Acropolis"},
    {"name": "Prashant", "phone": "8652096041", "location": "Virar West", "property_type": "2 BHK", "budget": "35.86 Lac-35.86 Lac", "notes": "Project: Acropolis"},
    {"name": "Manoj Bind", "phone": "9967092148", "location": "Virar West", "property_type": "1 BHK", "budget": "21.64 Lac-21.64 Lac", "notes": "Project: Acropolis"},
    {"name": "vilas rathod", "phone": "7304505436", "location": "Virar West", "property_type": "1 BHK", "budget": "21.64 Lac-21.64 Lac", "notes": "Project: Acropolis"},
    {"name": "Manish madhukar bhadgaon", "phone": "8655614881", "location": "Virar West", "property_type": "1 BHK", "budget": "37.61 Lac-56.85 Lac", "notes": "Project: Shapoorji Pallonji Joyville Virar Phase 6"},
    {"name": "Venkat Dakey", "phone": "7977913339", "location": "Virar West", "property_type": "1 BHK", "budget": "37.61 Lac-56.85 Lac", "notes": "Project: Shapoorji Pallonji Joyville Virar Phase 6"},
    {"name": "Neeta (Owner)", "phone": "9320890800", "location": "Virar West", "property_type": "3 BHK", "budget": "84.99 Lac-86.81 Lac", "notes": "Project: Poonam Park View Phase II"},
    {"name": "hemant nimbalkar", "phone": "8805186530", "location": "Nalasopara West", "property_type": "1 BHK", "budget": "40.17 Lac-42.42 Lac", "notes": "Project: Shri Ram Tower"},
    {"name": "Dharmendra K Chaudhary", "phone": "7906820702", "location": "Nalasopara West", "property_type": "1 BHK", "budget": "34.57 Lac-37.62 Lac", "notes": "Project: Sai Abhyuday Complex Grande"},
    {"name": "Nandkishor Dhuri", "phone": "7499689168", "location": "Nalasopara West", "property_type": "1 BHK", "budget": "40.17 Lac-42.42 Lac", "notes": "Project: Shri Ram Tower"},
    {"name": "Manoj shrivastav (Owner)", "phone": "8369252509", "location": "Nalasopara West", "property_type": "1 BHK 2 BHK 3 BHK", "budget": "34.05 Lac-91.02 Lac", "notes": "Project: Mukundan Astria"},
    {"name": "Venkat Dakey", "phone": "8071592482", "location": "Virar West", "property_type": "1 BHK", "budget": "39.58 Lac-39.58 Lac", "notes": "Project: Shapoorji Pallonji Joyville Phase 5"},
    {"name": "Imran Ansari", "phone": "9594368786", "location": "Nalasopara West", "property_type": "1 BHK", "budget": "34.72 Lac-34.72 Lac", "notes": "Project: AB Aleen Heights"}
]

def add_leads():
    # We use a transport with connection limits to avoid hitting Supabase too hard
    limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
    with httpx.Client(headers=headers, limits=limits) as client:
        r = client.get(f"{SUPABASE_URL}/rest/v1/employees?role=eq.telecaller&active=eq.true")
        telecallers = r.json() if r.status_code == 200 else []
        if not telecallers:
            r = client.get(f"{SUPABASE_URL}/rest/v1/employees?role=eq.admin&active=eq.true")
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
            
            print(f"[{i+1}/{len(leads_data)}] Inserting lead: {lead['name']}")
            r_lead = client.post(f"{SUPABASE_URL}/rest/v1/leads", json=lead)
            if r_lead.status_code >= 400:
                print(f"Error inserting lead {lead['name']}: {r_lead.text}")
                continue

            act = {
                "activity_id": gen_id("act"),
                "lead_id": lid,
                "user_id": None,
                "type": "manual_enquiry",
                "text": f"[System] Bulk excel import entry created for {lead['name']}.",
                "created_at": now
            }
            r_act = client.post(f"{SUPABASE_URL}/rest/v1/activities", json=act)
            if r_act.status_code >= 400:
                print(f"Error logging activity for {lead['name']}: {r_act.text}")
                
        print("Done inserting remaining image leads!")

if __name__ == "__main__":
    add_leads()
