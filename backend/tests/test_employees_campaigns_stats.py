"""Employees, templates, campaigns, stats, activities.

These used to hit the deployed Render service through a live HTTP client and a
MongoDB session that no longer exists. They now run in-process against the
in-memory Supabase fake and assert the same behaviour.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_employees_crud(client, fake_db):
    create = {
        "name": "TEST_Emp One",
        "email": "TEST_emp1@example.com",
        "phone": "+919900099000",
        "role": "telecaller",
        "department": "Sales",
        "location": "Mumbai",
        "password": "test-password-123",
    }
    r = client.post("/api/employees", json=create)
    assert r.status_code == 200, r.text
    eid = r.json()["employee_id"]
    assert r.json()["active"] is True

    # GET to verify persistence
    r = client.get("/api/employees")
    assert any(e["employee_id"] == eid for e in r.json())

    # Invalid role
    bad = dict(create, role="wizard", email="TEST_bad@example.com")
    r = client.post("/api/employees", json=bad)
    assert r.status_code == 400

    # Update -> deactivate
    r = client.patch(f"/api/employees/{eid}", json={"active": False})
    assert r.status_code == 200
    assert r.json()["active"] is False

    # Delete
    r = client.delete(f"/api/employees/{eid}")
    assert r.status_code == 200
    r = client.get("/api/employees")
    assert not any(e["employee_id"] == eid for e in r.json())


def test_templates_and_campaigns(client, fake_db):
    r = client.post("/api/templates", json={
        "name": "TEST_Welcome", "body": "Hello {{name}}, welcome to Umang!"
    })
    assert r.status_code == 200, r.text
    tpl_id = r.json()["template_id"]

    r = client.get("/api/templates")
    assert any(t["template_id"] == tpl_id for t in r.json())

    # Create campaign with audience=all
    r = client.post("/api/campaigns", json={
        "name": "TEST_All Camp", "template_id": tpl_id, "audience": "all"
    })
    assert r.status_code == 200, r.text
    cmp_id = r.json()["campaign_id"]
    assert r.json()["status"] == "draft"

    # Simulated send
    r = client.post(f"/api/campaigns/{cmp_id}/send")
    assert r.status_code == 200, r.text
    sent = r.json()
    assert sent["status"] == "sent"
    assert sent["sent_count"] >= 0
    assert sent["delivered_count"] <= sent["sent_count"]
    assert sent["read_count"] <= sent["delivered_count"]
    assert sent["replied_count"] <= sent["read_count"]

    # Cleanup
    r = client.delete(f"/api/campaigns/{cmp_id}")
    assert r.status_code == 200
    r = client.delete(f"/api/templates/{tpl_id}")
    assert r.status_code == 200


def test_stats_dashboard(client, fake_db):
    r = client.get("/api/stats/dashboard")
    assert r.status_code == 200, r.text
    data = r.json()
    expected = {"total_leads", "positive_leads", "negative_leads", "new_leads",
                "site_visits", "completed_visits", "bookings", "confirmed_bookings",
                "follow_ups", "pending_follow_ups", "loans", "disbursed_loans",
                "employees", "campaigns", "revenue_pipeline", "stage_distribution"}
    assert expected.issubset(set(data.keys())), f"Missing keys: {expected - set(data.keys())}"
    assert isinstance(data["stage_distribution"], dict)
    assert "new" in data["stage_distribution"]
    # counts are non-negative ints
    for k in ("total_leads", "site_visits", "bookings", "follow_ups",
              "pending_follow_ups", "loans", "disbursed_loans", "employees"):
        assert isinstance(data[k], int) and data[k] >= 0


def test_activities_feed(client, fake_db):
    r = client.get("/api/activities", params={"limit": 20})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        assert "type" in items[0]
        assert "text" in items[0]
        # The Mongo-era `_id` field must be gone; rows are keyed by activity_id.
        assert "_id" not in items[0]
        assert "activity_id" in items[0]
