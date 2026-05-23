import httpx
from datetime import datetime, timedelta, timezone
import uuid
import random

def gen_id(): return "lead_" + uuid.uuid4().hex[:12]

key = ""

names = ["Rahul Sharma", "Priya Patel", "Amit Singh", "Sneha Gupta", "Vikram Joshi", "Neha Reddy", "Arjun Kumar", "Kavita Nair"]
stages = ["new", "contacted", "positive", "site_visit", "booking", "loan", "registration", "closed"]
locations = ["Baner", "Wakad", "Hinjewadi", "Kothrud", "Kharadi"]
property_types = ["2BHK", "3BHK", "Villa", "Plot"]

leads = []
for i, name in enumerate(names):
    created = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 30))
    st = stages[i % len(stages)]
    leads.append({
        "lead_id": gen_id(),
        "name": name,
        "phone": f"98765{10000+i}",
        "email": f"{name.split()[0].lower()}@mail.com",
        "budget": f"{random.randint(30, 200)} Lacs",
        "location": random.choice(locations),
        "property_type": random.choice(property_types),
        "notes": "Generated demo lead",
        "source": "website",
        "stage": st,
        "status": "active",
        "assigned_to": None,
        "created_at": created.isoformat(),
        "updated_at": created.isoformat()
    })

for lead in leads:
    r = httpx.post(
        "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/leads",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=lead
    )
    print(r.status_code)
