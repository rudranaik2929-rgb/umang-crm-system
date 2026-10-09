"""Health checks and auth enforcement.

These used to run against the deployed Render service, minting a session by
shelling out to `mongosh` against a MongoDB database the backend no longer uses.
They now exercise the app in-process against the in-memory Supabase fake, so
they can never write junk into the production CRM.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402


@pytest.fixture
def anon(fake_db):
    """No auth dependency override — requests are unauthenticated, as a browser would be."""
    return TestClient(main.app)


def test_health(anon):
    r = anon.get("/api/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_root_health(anon):
    r = anon.get("/")
    assert r.status_code == 200
    assert r.json().get("status") == "online"


def test_protected_endpoints_require_auth(anon):
    endpoints = [
        "/api/auth/me", "/api/leads", "/api/visits", "/api/bookings",
        "/api/loans", "/api/employees", "/api/campaigns", "/api/templates",
        "/api/stats/dashboard", "/api/activities",
    ]
    failures = []
    for ep in endpoints:
        r = anon.get(ep)
        if r.status_code != 401:
            failures.append((ep, r.status_code))
    assert not failures, f"Expected 401 for: {failures}"


def test_public_lead_endpoint_does_not_require_auth(anon):
    """The website enquiry form must stay open, so it is the deliberate exception."""
    r = anon.post("/api/leads/public", json={"name": "Walkin", "phone": "+919999900001"})
    assert r.status_code in (200, 422), r.text


def test_auth_me_with_session(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["role"] == "admin"
    assert "user_id" in user


def test_set_role(client):
    r = client.post("/api/auth/set-role", json={"role": "telecaller"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "telecaller"


def test_set_role_rejects_unknown_role(client):
    r = client.post("/api/auth/set-role", json={"role": "wizard"})
    assert r.status_code == 400


def test_debug_config_reports_secrets_configured(anon):
    """Guards the misconfiguration that silently breaks auth on deploy."""
    body = anon.get("/debug-config").json()
    assert body["url_configured"] is True
    assert body["key_configured"] is True
    assert body["jwt_secret_ok"] is True, (
        "JWT_SECRET is unset or still a placeholder — session tokens are forgeable"
    )
