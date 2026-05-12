"""Health & basic auth checks"""
import requests


# health endpoint
def test_health(base_url, anon_client):
    r = anon_client.get(f"{base_url}/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


# protected endpoints return 401 without auth
def test_protected_endpoints_require_auth(base_url, anon_client):
    endpoints = [
        "/api/auth/me", "/api/leads", "/api/visits", "/api/bookings",
        "/api/loans", "/api/employees", "/api/campaigns", "/api/templates",
        "/api/stats/dashboard", "/api/activities",
    ]
    failures = []
    for ep in endpoints:
        r = anon_client.get(f"{base_url}{ep}")
        if r.status_code != 401:
            failures.append((ep, r.status_code))
    assert not failures, f"Expected 401 for: {failures}"


# auth/me with valid Bearer token
def test_auth_me_with_session(base_url, auth_client):
    r = auth_client.get(f"{base_url}/api/auth/me")
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["role"] == "admin"
    assert "user_id" in user


# set-role updates role
def test_set_role(base_url, auth_client):
    r = auth_client.post(f"{base_url}/api/auth/set-role", json={"role": "telecaller"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "telecaller"
    # restore admin
    r2 = auth_client.post(f"{base_url}/api/auth/set-role", json={"role": "admin"})
    assert r2.status_code == 200
    # invalid role
    r3 = auth_client.post(f"{base_url}/api/auth/set-role", json={"role": "wizard"})
    assert r3.status_code == 400
