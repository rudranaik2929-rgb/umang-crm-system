import httpx
import uuid
import random
from datetime import datetime, timedelta, timezone

# Hit the LOCAL server
BASE_URL = "http://127.0.0.1:8000/api"

def gen_id(prefix): return f"{prefix}_{uuid.uuid4().hex[:12]}"
def now_iso(): return datetime.now(timezone.utc).isoformat()
def past_iso(days): return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

STAGES = ["new", "contacted", "positive", "site_visit", "booking", "loan", "registration", "closed"]
LOCATIONS = ["Baner", "Wakad", "Hinjewadi", "Kothrud", "Kharadi", "Balewadi"]
PROPERTY_TYPES = ["2BHK", "3BHK", "4BHK", "Villa", "Plot"]
SOURCES = ["Website", "Facebook", "Google Ads", "Referral", "Walk-in"]

def seed():
    print("Starting demo data seeding via local backend...")
    
    # Login
    r = httpx.post(f"{BASE_URL}/auth/session", json={"email": "umang@admin", "password": "umang@admin"})
    if r.status_code != 200:
        print(f"Login failed: {r.text}")
        return
    
    token = r.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Logged in. Token: {token}")

    # Create Leads
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
    
    for item in leads_to_create:
        lead = {
            "name": item["name"],
            "phone": f"98230{random.randint(10000, 99999)}",
            "email": f"{item['name'].lower().replace(' ', '.')}@example.com",
            "budget": f"{random.randint(40, 250)} Lacs",
            "location": random.choice(LOCATIONS),
            "property_type": random.choice(PROPERTY_TYPES),
            "source": random.choice(SOURCES),
            "stage": item["stage"],
            "notes": "Seeded demo lead"
        }
        r = httpx.post(f"{BASE_URL}/leads", headers=headers, json=lead)
        if r.status_code < 400:
            print(f"SUCCESS Created lead: {item['name']} ({item['stage']})")
        else:
            print(f"FAILED lead: {item['name']} - {r.text}")

    print("Demo seeding complete!")

if __name__ == "__main__":
    seed()
