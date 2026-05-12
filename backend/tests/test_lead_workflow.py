"""Full lead lifecycle and CRUD tests"""
import time
from datetime import datetime, timedelta, timezone


# Public lead enquiry doesn't need auth and creates a lead with stage=new status=active
def test_public_lead_enquiry(base_url, anon_client):
    payload = {
        "name": "TEST_Walkin Customer",
        "phone": "+919999900001",
        "email": "TEST_walkin@example.com",
        "budget": "1.5cr",
        "location": "Pune",
        "property_type": "3BHK",
        "notes": "TEST_From website form"
    }
    r = anon_client.post(f"{base_url}/api/leads/public", json=payload)
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead["stage"] == "new"
    assert lead["status"] == "active"
    assert lead["source"] == "website"
    assert lead["lead_id"].startswith("lead_")


# Lead update + note + advance + visits + bookings + loans full workflow
def test_full_workflow(base_url, anon_client, auth_client):
    # 1. Create lead via public endpoint
    enq = {
        "name": "TEST_FlowLead",
        "phone": "+919999900002",
        "email": "TEST_flow@example.com",
        "budget": "80L",
        "property_type": "2BHK",
        "location": "Mumbai"
    }
    r = anon_client.post(f"{base_url}/api/leads/public", json=enq)
    assert r.status_code == 200
    lead_id = r.json()["lead_id"]

    # 2. List leads (auth) - must contain the created lead
    r = auth_client.get(f"{base_url}/api/leads")
    assert r.status_code == 200
    assert any(x["lead_id"] == lead_id for x in r.json())

    # filter by status_
    r = auth_client.get(f"{base_url}/api/leads?status_=active")
    assert r.status_code == 200
    assert all(x["status"] == "active" for x in r.json())

    # 3. PATCH lead stage to 'positive'
    r = auth_client.patch(f"{base_url}/api/leads/{lead_id}", json={"stage": "positive"})
    assert r.status_code == 200
    assert r.json()["stage"] == "positive"

    # 4. Add note
    r = auth_client.post(f"{base_url}/api/leads/{lead_id}/notes",
                         json={"text": "TEST_Customer interested in 2BHK", "type": "call_note"})
    assert r.status_code == 200
    assert r.json()["text"].startswith("TEST_")

    # 5. Verify timeline contains note + stage changes
    r = auth_client.get(f"{base_url}/api/leads/{lead_id}")
    assert r.status_code == 200
    body = r.json()
    timeline = body["timeline"]
    assert any(t["type"] == "call_note" for t in timeline)
    assert any(t["type"] == "stage_change" for t in timeline)

    # 6. Advance lead -> next stage from positive is site_visit
    r = auth_client.post(f"{base_url}/api/leads/{lead_id}/advance")
    assert r.status_code == 200
    assert r.json()["stage"] == "site_visit"

    # 7. Create a visit -> should set stage to site_visit (already there) and create visit
    scheduled_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    r = auth_client.post(f"{base_url}/api/visits", json={
        "lead_id": lead_id,
        "scheduled_at": scheduled_at
    })
    assert r.status_code == 200, r.text
    visit_id = r.json()["visit_id"]

    # verify lead stage = site_visit
    r = auth_client.get(f"{base_url}/api/leads/{lead_id}")
    assert r.json()["lead"]["stage"] == "site_visit"

    # 8. PATCH visit -> mark interested+completed
    r = auth_client.patch(f"{base_url}/api/visits/{visit_id}",
                          json={"status": "completed", "interested": True, "feedback": "TEST_Loved it"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["interested"] is True

    # 9. Create booking -> advances to 'booking'
    r = auth_client.post(f"{base_url}/api/bookings", json={
        "lead_id": lead_id,
        "property_name": "TEST_Sunrise Tower B-1203",
        "booking_amount": 8000000,
        "token_received": 200000
    })
    assert r.status_code == 200, r.text
    bk = r.json()
    booking_id = bk["booking_id"]
    assert bk["payment_progress"] == int(200000 / 8000000 * 100)

    r = auth_client.get(f"{base_url}/api/leads/{lead_id}")
    assert r.json()["lead"]["stage"] == "booking"

    # update booking
    r = auth_client.patch(f"{base_url}/api/bookings/{booking_id}",
                          json={"agreement_status": "signed", "token_received": 800000})
    assert r.status_code == 200
    bk2 = r.json()
    assert bk2["agreement_status"] == "signed"
    assert bk2["payment_progress"] == 10

    # 10. Create loan -> advances to 'loan' with default pending docs
    r = auth_client.post(f"{base_url}/api/loans", json={
        "lead_id": lead_id, "amount": 6500000, "bank_name": "TEST_HDFC"
    })
    assert r.status_code == 200, r.text
    loan = r.json()
    loan_id = loan["loan_id"]
    assert loan["pending_documents"] == ["PAN", "Aadhaar", "Income Proof", "Bank Statements"]

    r = auth_client.get(f"{base_url}/api/leads/{lead_id}")
    assert r.json()["lead"]["stage"] == "loan"

    # 11. PATCH loan -> bank_stage progression
    r = auth_client.patch(f"{base_url}/api/loans/{loan_id}", json={"bank_stage": "verification"})
    assert r.status_code == 200
    assert r.json()["bank_stage"] == "verification"

    # disbursed -> moves lead to registration
    r = auth_client.patch(f"{base_url}/api/loans/{loan_id}", json={"application_status": "disbursed"})
    assert r.status_code == 200
    assert r.json()["application_status"] == "disbursed"

    r = auth_client.get(f"{base_url}/api/leads/{lead_id}")
    assert r.json()["lead"]["stage"] == "registration"


# Negative leads filter
def test_negative_lead_status(base_url, anon_client, auth_client):
    enq = {"name": "TEST_NegLead", "phone": "+919999900099"}
    r = anon_client.post(f"{base_url}/api/leads/public", json=enq)
    assert r.status_code == 200
    lid = r.json()["lead_id"]
    r = auth_client.patch(f"{base_url}/api/leads/{lid}", json={"status": "negative"})
    assert r.status_code == 200
    assert r.json()["status"] == "negative"
    r = auth_client.get(f"{base_url}/api/leads?status_=negative")
    assert any(x["lead_id"] == lid for x in r.json())
