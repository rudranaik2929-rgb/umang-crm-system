import httpx
from datetime import datetime, timedelta, timezone
import uuid

def gen_id(): return "act_" + uuid.uuid4().hex[:12]

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

acts = [
    {
        "activity_id": gen_id(),
        "user_id": "emp_field01",
        "type": "site_visit_scheduled",
        "text": "[Demo Field] Scheduled a site visit.",
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=26)).isoformat()
    },
    {
        "activity_id": gen_id(),
        "user_id": "emp_ops01",
        "type": "booking",
        "text": "[Demo Operations] Processed a token booking.",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    },
    {
        "activity_id": gen_id(),
        "user_id": "emp_fin01",
        "type": "loan",
        "text": "[Demo Finance] Processed loan documentation.",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=1, hours=5)).isoformat()
    }
]

for act in acts:
    r = httpx.post(
        "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/activities",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=act
    )
    print(r.status_code)
