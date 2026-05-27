from collections import defaultdict
import hashlib
import hmac
import time

from fastapi.testclient import TestClient

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _install_fake_supabase(monkeypatch):
    inserted = defaultdict(list)

    def fake_select(table, params=None):
        return []

    def fake_insert(table, data):
        inserted[table].append(dict(data))
        return dict(data)

    def fake_update(table, pk_col, pk_val, data):
        return dict(data)

    monkeypatch.setattr(main, "sb_select", fake_select)
    monkeypatch.setattr(main, "sb_insert", fake_insert)
    monkeypatch.setattr(main, "sb_update", fake_update)
    monkeypatch.setattr(main, "assign_lead_round_robin", lambda: None)
    monkeypatch.setattr(main, "create_notification", lambda *args, **kwargs: None)
    main.SESSION_CACHE["leads"] = []
    main.SESSION_CACHE["activities"] = []
    return inserted


def test_housing_webhook_creates_housing_lead(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_WEBHOOK_SECRET", "test-integration-uuid")
    monkeypatch.setattr(main, "HOUSING_PROFILE_ID", "2548773")
    monkeypatch.setattr(main, "HOUSING_INTEGRATION_UUID", "test-integration-uuid")

    client = TestClient(main.app)
    response = client.post(
        "/api/housing/webhook",
        headers={
            "x-housing-integration-uuid": "test-integration-uuid",
            "x-housing-profile-id": "2548773",
        },
        json={
            "lead_id": "housing-123",
            "lead_name": "Aarav Buyer",
            "lead_phone": "9876543210",
            "lead_email": "aarav@example.com",
            "project_name": "Umang Heights",
            "locality": "Pune",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["created"]
    lead = inserted["leads"][0]
    assert lead["source"] == "Housing.com"
    assert lead["phone"] == "+919876543210"
    assert lead["external_lead_id"] == "housing-123"
    assert "Umang Heights" in lead["notes"]


def test_housing_webhook_rejects_bad_signature(monkeypatch):
    _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_WEBHOOK_SECRET", "test-integration-uuid")
    monkeypatch.setattr(main, "HOUSING_ENCRYPTION_KEY", "secret-key")

    client = TestClient(main.app)
    response = client.post(
        "/api/housing/webhook",
        headers={
            "x-housing-integration-uuid": "test-integration-uuid",
            "x-housing-timestamp": str(int(time.time())),
            "x-housing-signature": "bad-signature",
        },
        json={"lead_name": "Bad Signature", "lead_phone": "9876543210"},
    )

    assert response.status_code == 401


def test_housing_webhook_requires_secret_configuration(monkeypatch):
    _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_WEBHOOK_SECRET", "")
    monkeypatch.setattr(main, "HOUSING_ENCRYPTION_KEY", "")

    client = TestClient(main.app)
    response = client.post(
        "/api/housing/webhook",
        headers={"x-housing-integration-uuid": "anything"},
        json={"lead_name": "Unconfigured", "lead_phone": "9876543210"},
    )

    assert response.status_code == 500
    assert "not configured" in response.json()["detail"]


def test_housing_webhook_accepts_valid_hmac(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_WEBHOOK_SECRET", "test-integration-uuid")
    monkeypatch.setattr(main, "HOUSING_ENCRYPTION_KEY", "secret-key")
    current_time = str(int(time.time()))
    signature = hmac.new(b"secret-key", current_time.encode(), hashlib.sha256).hexdigest()

    client = TestClient(main.app)
    response = client.post(
        "/api/housing/webhook",
        headers={
            "x-housing-integration-uuid": "test-integration-uuid",
            "x-housing-timestamp": current_time,
            "x-housing-signature": signature,
        },
        json={"lead_name": "Valid Signature", "lead_phone": "9876543210"},
    )

    assert response.status_code == 200, response.text
    assert inserted["leads"][0]["source"] == "Housing.com"


def test_facebook_verify_and_direct_payload(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "FACEBOOK_VERIFY_TOKEN", "UMANGCRM123")

    client = TestClient(main.app)
    verify = client.get(
        "/api/facebook/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "UMANGCRM123",
            "hub.challenge": "778899",
        },
    )
    assert verify.status_code == 200
    assert verify.text == "778899"

    response = client.post(
        "/api/facebook/webhook",
        json={
            "leadgen_id": "fb-123",
            "full_name": "Meta Buyer",
            "phone_number": "+91 90000 11111",
            "email": "meta@example.com",
        },
    )
    assert response.status_code == 200, response.text
    assert inserted["leads"][0]["source"] == "Facebook"
    assert inserted["leads"][0]["external_lead_id"] == "fb-123"
