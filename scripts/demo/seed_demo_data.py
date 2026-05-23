import httpx
import uuid
import random
from datetime import datetime, timedelta, timezone

# Verified working key
SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SUPABASE_KEY = ""

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def gen_id(prefix): return f"{prefix}_{uuid.uuid4().hex[:12]}"
def now_iso(): return datetime.now(timezone.utc).isoformat()
def past_iso(days): return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

STAGES = ["new", "contacted", "positive", "site_visit", "booking", "loan", "registration", "closed"]
LOCATIONS = ["Baner", "Wakad", "Hinjewadi", "Kothrud", "Kharadi", "Balewadi"]
PROPERTY_TYPES = ["2BHK", "3BHK", "4BHK", "Villa", "Plot"]
SOURCES = ["Website", "Facebook", "Google Ads", "Referral", "Walk-in"]

def seed():
    print("Starting demo data seeding...")
    
    # 1. Create some Leads at different stages
    leads_to_create = [
        {"name": "Amit Shah", "stage": "new", "days_ago": 1},
        {"name": "Priya Kapoor", "stage": "contacted", "days_ago": 3},
        {"name": "Rahul Verma", "stage": "positive", "days_ago": 5},
        {"name": "Sonal Gupta", "stage": "site_visit", "days_ago": 7},
        {"name": "Vikram Malhotra", "stage": "booking", "days_ago": 10},
        {"name": "Ananya Rai", "stage": "loan", "days_ago": 15},
        {"name": "Rohan Deshmukh", "stage": "registration", "days_ago": 20},
        {"name": "Kavita Singh", "stage": "closed", "days_ago": 25},
        {"name": "Deepak Joshi", "stage": "closed", "days_ago": 30},
    ]
    
    created_leads = []
    for item in leads_to_create:
        lid = gen_id("lead")
        lead = {
            "lead_id": lid,
            "name": item["name"],
            "phone": f"98230{random.randint(10000, 99999)}",
            "email": f"{item['name'].lower().replace(' ', '.')}@example.com",
            "budget": f"{random.randint(40, 250)} Lacs",
            "location": random.choice(LOCATIONS),
            "property_type": random.choice(PROPERTY_TYPES),
            "source": random.choice(SOURCES),
            "stage": item["stage"],
            "status": "active",
            "notes": "Seeded demo lead",
            "created_at": past_iso(item["days_ago"]),
            "updated_at": past_iso(item["days_ago"])
        }
        r = httpx.post(f"{SUPABASE_URL}/rest/v1/leads", headers=headers, json=lead)
        if r.status_code < 400:
            print(f"SUCCESS Created lead: {item['name']} ({item['stage']})")
            created_leads.append(lead)
        else:
            print(f"FAILED lead: {item['name']} - {r.text}")

    # 2. Add related objects for advanced stages
    for lead in created_leads:
        lid = lead["lead_id"]
        stage = lead["stage"]
        
        # Add a basic activity for everyone
        act = {
            "activity_id": gen_id("act"), "lead_id": lid, "user_id": "user_admin001",
            "type": "system", "text": f"Lead initially captured from {lead['source']}",
            "created_at": lead["created_at"]
        }
        httpx.post(f"{SUPABASE_URL}/rest/v1/activities", headers=headers, json=act)

        # Site Visit
        if stage in ["site_visit", "booking", "loan", "registration", "closed"]:
            vid = gen_id("vis")
            visit = {
                "visit_id": vid, "lead_id": lid, "lead_name": lead["name"],
                "scheduled_at": past_iso(5), "status": "completed", "feedback": "Very interested in the 3BHK flat.",
                "interested": True, "created_at": past_iso(6)
            }
            httpx.post(f"{SUPABASE_URL}/rest/v1/visits", headers=headers, json=visit)
        
        # Booking
        if stage in ["booking", "loan", "registration", "closed"]:
            bid = gen_id("bkg")
            booking = {
                "booking_id": bid, "lead_id": lid, "lead_name": lead["name"],
                "property_name": f"Umang {lead['location']} Heights", "booking_amount": 1000000,
                "token_received": 200000, "agreement_status": "signed", "status": "confirmed",
                "created_at": past_iso(8)
            }
            httpx.post(f"{SUPABASE_URL}/rest/v1/bookings", headers=headers, json=booking)
            
        # Loan
        if stage in ["loan", "registration", "closed"]:
            lnid = gen_id("lon")
            loan = {
                "loan_id": lnid, "lead_id": lid, "lead_name": lead["name"],
                "bank_name": "HDFC Bank", "amount": 8000000, "application_status": "disbursed" if stage in ["registration", "closed"] else "approved",
                "bank_stage": "disbursal" if stage in ["registration", "closed"] else "sanction",
                "progress": 100 if stage in ["registration", "closed"] else 75, "created_at": past_iso(12)
            }
            httpx.post(f"{SUPABASE_URL}/rest/v1/loans", headers=headers, json=loan)

    print("Demo seeding complete! Your dashboard should be full now.")

if __name__ == "__main__":
    seed()
