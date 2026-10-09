"""Full lead lifecycle: enquiry → assignment → visit → booking → loan → close.

Previously these ran against the deployed Render service and created real rows in
the production CRM via a MongoDB session that no longer exists. They now run
in-process against the in-memory Supabase fake and assert the same workflow.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402


@pytest.fixture
def api(client, fake_db):
    """Authenticated client plus the fake DB handle."""
    return client, fake_db


def _create_public_lead(client, **overrides):
    payload = {
        "name": "TEST_FlowLead",
        "phone": "+919999900002",
        "email": "TEST_flow@example.com",
        "budget": "80L",
        "property_type": "2BHK",
        "location": "Mumbai",
    }
    payload.update(overrides)
    r = client.post("/api/leads/public", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_public_lead_enquiry_is_open_and_creates_a_new_lead(fake_db):
    """The website form is the one endpoint that must work without a session."""
    client = TestClient(main.app)
    fake_db.reset()
    lead = _create_public_lead(
        client, name="TEST_Walkin", phone="+919999900001", email="TEST_walkin@example.com",
    )
    assert lead["stage"] == "new"
    assert lead["status"] == "active"
    assert lead["source"] == "website"
    assert lead["lead_id"].startswith("lead_")


def test_full_workflow(api):
    client, fake_db = api
    lead_id = _create_public_lead(client)["lead_id"]

    # 1. The new lead is in the authenticated list.
    rows = client.get("/api/leads").json()
    assert any(x["lead_id"] == lead_id for x in rows)

    # 2. Status filter is honoured.
    rows = client.get("/api/leads", params={"status_": "active"}).json()
    assert all(x["status"] == "active" for x in rows)

    # 3. Stage transition to positive.
    r = client.patch(f"/api/leads/{lead_id}", json={"stage": "positive"})
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "positive"

    # 4. Add a note.
    r = client.post(f"/api/leads/{lead_id}/notes",
                    json={"text": "TEST_Customer interested in 2BHK", "type": "call_note"})
    assert r.status_code == 200, r.text
    assert "TEST_Customer interested in 2BHK" in r.json()["text"]

    # 5. Timeline shows both the note and the stage change.
    body = client.get(f"/api/leads/{lead_id}").json()
    timeline = body["timeline"]
    assert any(t["type"] == "call_note" for t in timeline)
    assert any(t["type"] == "positive_response" for t in timeline)

    # 6. Advance positive -> site_visit.
    r = client.post(f"/api/leads/{lead_id}/advance")
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "site_visit"

    # 7. Schedule a visit.
    scheduled_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    r = client.post("/api/visits", json={"lead_id": lead_id, "scheduled_at": scheduled_at})
    assert r.status_code == 200, r.text
    visit_id = r.json()["visit_id"]
    assert client.get(f"/api/leads/{lead_id}").json()["lead"]["stage"] == "site_visit"

    # 8. Complete the visit.
    r = client.patch(f"/api/visits/{visit_id}",
                     json={"status": "completed", "interested": True, "feedback": "TEST_Loved it"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"
    assert r.json()["interested"] is True

    # 9. Booking advances the lead and computes payment progress.
    r = client.post("/api/bookings", json={
        "lead_id": lead_id,
        "property_name": "TEST_Sunrise Tower B-1203",
        "booking_amount": 8000000,
        "token_received": 200000,
    })
    assert r.status_code == 200, r.text
    booking = r.json()
    assert booking["payment_progress"] == int(200000 / 8000000 * 100)
    assert client.get(f"/api/leads/{lead_id}").json()["lead"]["stage"] == "booking"

    # Update the booking.
    r = client.patch(f"/api/bookings/{booking['booking_id']}",
                     json={"agreement_status": "signed", "token_received": 800000})
    assert r.status_code == 200, r.text
    assert r.json()["agreement_status"] == "signed"

    # 10. Loan advances to 'loan' with an explicit document checklist.
    r = client.post("/api/loans", json={
        "lead_id": lead_id, "amount": 6500000, "bank_name": "TEST_HDFC",
        "pending_documents": ["PAN", "Aadhaar", "Income Proof", "Bank Statements"],
    })
    assert r.status_code == 200, r.text
    loan = r.json()
    assert loan["pending_documents"] == ["PAN", "Aadhaar", "Income Proof", "Bank Statements"]
    assert client.get(f"/api/leads/{lead_id}").json()["lead"]["stage"] == "loan"

    # 11. Bank stage progression. Approval advances to registration; disbursal closes it.
    r = client.patch(f"/api/loans/{loan['loan_id']}", json={"bank_stage": "verification"})
    assert r.status_code == 200, r.text
    assert r.json()["bank_stage"] == "verification"

    r = client.patch(f"/api/loans/{loan['loan_id']}", json={"application_status": "approved"})
    assert r.status_code == 200, r.text
    assert r.json()["application_status"] == "approved"
    assert client.get(f"/api/leads/{lead_id}").json()["lead"]["stage"] == "registration"

    r = client.patch(f"/api/loans/{loan['loan_id']}", json={"application_status": "disbursed"})
    assert r.status_code == 200, r.text
    assert r.json()["application_status"] == "disbursed"
    assert client.get(f"/api/leads/{lead_id}").json()["lead"]["stage"] == "closed"


def test_negative_lead_round_trip(api):
    client, _ = api
    lead = _create_public_lead(client, name="TEST_NegLead", phone="+919999900099", email=None)

    r = client.patch(f"/api/leads/{lead['lead_id']}", json={"status": "negative"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "negative"

    rows = client.get("/api/leads", params={"status_": "negative"}).json()
    assert any(x["lead_id"] == lead["lead_id"] for x in rows)


def test_created_lead_persists_into_the_supabase_table(api):
    """A lead created through the API must be readable straight back out of the DB."""
    client, fake_db = api
    lead = _create_public_lead(client, name="TEST_Persisted", phone="+919999900077", email=None)

    stored = [l for l in fake_db.rows("leads") if l["lead_id"] == lead["lead_id"]]
    assert len(stored) == 1
    assert stored[0]["name"] == "TEST_Persisted"
    assert stored[0]["stage"] == "new"
