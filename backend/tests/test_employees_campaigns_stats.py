"""Employees, templates, campaigns, stats, activities"""


# Employees CRUD
def test_employees_crud(base_url, auth_client):
    create = {
        "name": "TEST_Emp One",
        "email": "TEST_emp1@example.com",
        "phone": "+919900099000",
        "role": "telecaller",
        "department": "Sales",
    }
    r = auth_client.post(f"{base_url}/api/employees", json=create)
    assert r.status_code == 200, r.text
    eid = r.json()["employee_id"]
    assert r.json()["active"] is True

    # GET to verify persistence
    r = auth_client.get(f"{base_url}/api/employees")
    assert any(e["employee_id"] == eid for e in r.json())

    # Invalid role
    bad = dict(create, role="wizard", email="TEST_bad@example.com")
    r = auth_client.post(f"{base_url}/api/employees", json=bad)
    assert r.status_code == 400

    # Update -> deactivate
    r = auth_client.patch(f"{base_url}/api/employees/{eid}", json={"active": False})
    assert r.status_code == 200
    assert r.json()["active"] is False

    # Delete
    r = auth_client.delete(f"{base_url}/api/employees/{eid}")
    assert r.status_code == 200
    r = auth_client.get(f"{base_url}/api/employees")
    assert not any(e["employee_id"] == eid for e in r.json())


# Templates + campaigns + simulated send
def test_templates_and_campaigns(base_url, auth_client):
    r = auth_client.post(f"{base_url}/api/templates", json={
        "name": "TEST_Welcome", "body": "Hello {{name}}, welcome to Umang!"
    })
    assert r.status_code == 200, r.text
    tpl_id = r.json()["template_id"]

    r = auth_client.get(f"{base_url}/api/templates")
    assert any(t["template_id"] == tpl_id for t in r.json())

    # Create campaign with audience=all
    r = auth_client.post(f"{base_url}/api/campaigns", json={
        "name": "TEST_All Camp", "template_id": tpl_id, "audience": "all"
    })
    assert r.status_code == 200, r.text
    cmp_id = r.json()["campaign_id"]
    assert r.json()["status"] == "draft"

    # Simulated send
    r = auth_client.post(f"{base_url}/api/campaigns/{cmp_id}/send")
    assert r.status_code == 200, r.text
    sent = r.json()
    assert sent["status"] == "sent"
    assert sent["sent_count"] >= 0
    assert sent["delivered_count"] <= sent["sent_count"]
    assert sent["read_count"] <= sent["delivered_count"]
    assert sent["replied_count"] <= sent["read_count"]

    # Cleanup
    r = auth_client.delete(f"{base_url}/api/campaigns/{cmp_id}")
    assert r.status_code == 200
    r = auth_client.delete(f"{base_url}/api/templates/{tpl_id}")
    assert r.status_code == 200


# Dashboard stats include all expected keys and consistent counts
def test_stats_dashboard(base_url, auth_client):
    r = auth_client.get(f"{base_url}/api/stats/dashboard")
    assert r.status_code == 200, r.text
    data = r.json()
    expected = {"total_leads", "positive_leads", "negative_leads", "new_leads",
                "site_visits", "completed_visits", "bookings", "confirmed_bookings",
                "loans", "disbursed_loans", "employees", "campaigns",
                "revenue_pipeline", "stage_distribution"}
    assert expected.issubset(set(data.keys())), f"Missing keys: {expected - set(data.keys())}"
    assert isinstance(data["stage_distribution"], dict)
    assert "new" in data["stage_distribution"]
    # counts are non-negative ints
    for k in ("total_leads", "site_visits", "bookings", "loans", "disbursed_loans", "employees"):
        assert isinstance(data[k], int) and data[k] >= 0


# Activities feed
def test_activities_feed(base_url, auth_client):
    r = auth_client.get(f"{base_url}/api/activities?limit=20")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        assert "type" in items[0]
        assert "text" in items[0]
        assert "_id" not in items[0]
