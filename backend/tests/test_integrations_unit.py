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


def test_housing_sync_skips_stale_leads(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_PROFILE_ID", "2548773")
    monkeypatch.setattr(main, "HOUSING_ENCRYPTION_KEY", "secret-key")
    monkeypatch.setattr(main, "get_last_housing_sync_end_epoch", lambda: None)
    monkeypatch.setattr(main, "record_housing_sync_checkpoint", lambda *args, **kwargs: None)

    old_ts = int(time.time()) - 7 * 86400
    recent_ts = int(time.time()) - 300

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return [
                {"lead_id": "old-1", "lead_phone": "9876500001", "lead_date": str(old_ts)},
                {"lead_id": "new-1", "lead_phone": "9876500002", "lead_date": str(recent_ts), "lead_name": "Fresh"},
            ]

    monkeypatch.setattr(main._http, "get", lambda *args, **kwargs: FakeResponse())

    monkeypatch.setattr(main, "log_activity", lambda *args, **kwargs: None)

    class FakeUser:
        user_id = "u1"
        employee_id = None
        email = "admin@test.com"
        role = "admin"
        name = "Admin"
        acting_as_employee_id = None

    main.app.dependency_overrides[main.get_current_user] = lambda: FakeUser()
    try:
        response = TestClient(main.app).post("/api/housing/sync", json={})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["skipped_stale"] == 1
    assert len(body["created"]) == 1
    assert len(inserted["leads"]) == 1
    assert inserted["leads"][0]["external_lead_id"] == "new-1"


def test_housing_auto_mode_imports_lead_without_lead_date(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "HOUSING_PROFILE_ID", "2548773")
    monkeypatch.setattr(main, "HOUSING_ENCRYPTION_KEY", "secret-key")
    monkeypatch.setattr(main, "get_last_housing_sync_end_epoch", lambda: None)
    monkeypatch.setattr(main, "record_housing_sync_checkpoint", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "log_activity", lambda *args, **kwargs: None)

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return [{"lead_id": "no-date-1", "lead_phone": "9876500003", "lead_name": "No Date Lead"}]

    monkeypatch.setattr(main._http, "get", lambda *args, **kwargs: FakeResponse())

    result = main.run_housing_sync_background("auto")
    # Auto/pull syncs are time-scoped by the Housing API, so a recent payload
    # without a date is still imported (Housing leads must keep arriving).
    assert result["status"] == "success"
    assert len(result["created"]) == 1
    assert len(inserted["leads"]) == 1


def test_housing_sync_window_auto_uses_checkpoint(monkeypatch):
    now = int(time.time())
    monkeypatch.setattr(main, "get_last_housing_sync_end_epoch", lambda: now - 600)
    start, end = main.housing_sync_window("auto", None, now, False)
    assert end == now
    assert start >= now - main.HOUSING_POLL_INITIAL_WINDOW_SEC
    assert start <= now - 300


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
    assert lead["phone"] == "919876543210"
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


def test_integration_lead_before_start_date_is_ignored(monkeypatch):
    """Housing/Facebook leads dated before INTEGRATION_LEAD_START must never be re-stored."""
    inserted = _install_fake_supabase(monkeypatch)
    result = main.create_integrated_lead(
        {
            "lead_id": "old-housing-1",
            "lead_name": "Old Buyer",
            "lead_phone": "9876500101",
            "lead_date": "2026-07-31T20:00:00+05:30",
        },
        "Housing.com",
        quiet=True,
    )
    assert result["status"] == "ignored"
    assert result["reason"] == "before_start_date"
    assert len(inserted["leads"]) == 0


def test_facebook_lead_before_start_date_is_ignored(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    result = main.create_integrated_lead(
        {
            "id": "fb-leadgen-101",
            "full_name": "Old FB Lead",
            "phone_number": "9876500102",
            "created_time": "2026-07-25T09:00:00+00:00",
        },
        "Facebook",
        quiet=True,
    )
    assert result["status"] == "ignored"
    assert result["reason"] == "before_start_date"
    assert len(inserted["leads"]) == 0


def test_integration_lead_on_or_after_start_date_created(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    result = main.create_integrated_lead(
        {
            "lead_id": "new-housing-2",
            "lead_name": "New Buyer",
            "lead_phone": "9876500103",
            "lead_date": "2026-08-02T11:00:00+05:30",
        },
        "Housing.com",
        quiet=True,
    )
    assert result["status"] == "created"
    assert len(inserted["leads"]) == 1
    assert inserted["leads"][0]["external_lead_id"] == "new-housing-2"


def test_integration_lead_without_date_is_imported(monkeypatch):
    """No external date info = treated as current, must still import."""
    inserted = _install_fake_supabase(monkeypatch)
    result = main.create_integrated_lead(
        {"lead_id": "no-date-2", "lead_name": "No Date", "lead_phone": "9876500104"},
        "Housing.com",
        quiet=True,
    )
    assert result["status"] == "created"
    assert len(inserted["leads"]) == 1


def test_leads_by_platform_groups_manual_housing_meta(monkeypatch):
    monkeypatch.setattr(main, "SESSION_CACHE", {"leads": [
        {"lead_id": "l1", "source": "manual_entry", "status": "active", "phone": "+919000000001"},
        {"lead_id": "l2", "source": "Housing.com", "status": "active", "phone": "+919000000002"},
        # Real Meta lead: has contact details + a genuine leadgen id.
        {"lead_id": "l3", "source": "Facebook", "status": "negative", "phone": "+919000000003", "external_lead_id": "778899"},
        {"lead_id": "l4", "source": "website", "status": "active", "phone": "+919000000004"},
        # Meta test/sample submission (444444444444) — must be excluded.
        {"lead_id": "l5", "source": "Facebook", "status": "active", "external_lead_id": "444444444444"},
    ], "bookings": [], "visits": [], "followups": [], "loans": [], "activities": [], "customers": [], "notifications": []})
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: [])

    client = TestClient(main.app)
    # Endpoint requires auth - patch get_current_user
    class FakeUser:
        user_id = "u1"
        email = "admin@test.com"
        role = "admin"
        name = "Admin"
        acting_as_employee_id = None

    main.app.dependency_overrides[main.get_current_user] = lambda: FakeUser()
    try:
        response = client.get("/api/stats/leads-by-platform")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    data = response.json()
    # l5 (Meta test id 444444444444) is filtered out, leaving 4 real leads.
    assert data["total"] == 4
    by_key = {p["platform"]: p for p in data["platforms"]}
    # website + manual_entry both map to Database / manual platform.
    assert by_key["manual"]["count"] == 2
    assert by_key["housing"]["count"] == 1
    assert by_key["meta"]["count"] == 1


def test_list_leads_by_platform_housing(monkeypatch):
    monkeypatch.setattr(main, "SESSION_CACHE", {"leads": [
        {"lead_id": "h1", "source": "Housing.com", "name": "Buyer One", "phone": "+911", "status": "active", "stage": "new"},
        {"lead_id": "m1", "source": "manual_entry", "name": "Manual", "phone": "+912", "status": "active", "stage": "new"},
    ], "bookings": [], "visits": [], "followups": [], "loans": [], "activities": [], "customers": [], "notifications": []})
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: [])

    class FakeUser:
        user_id = "u1"
        email = "admin@test.com"
        role = "admin"
        name = "Admin"
        acting_as_employee_id = None

    main.app.dependency_overrides[main.get_current_user] = lambda: FakeUser()
    try:
        response = TestClient(main.app).get("/api/leads/by-platform/housing")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["leads"][0]["source"] == "Housing.com"


def test_facebook_leadgen_webhook_payload(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "FACEBOOK_VERIFY_TOKEN", "UMANGCRM123")
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "page-token")

    def fake_fetch(leadgen_id, page_id=None):
        return {
            "leadgen_id": leadgen_id,
            "full_name": "Graph Lead",
            "phone_number": "9876501234",
            "email": "graph@example.com",
            "city": "Pune",
        }

    monkeypatch.setattr(main, "fetch_facebook_lead", fake_fetch)

    client = TestClient(main.app)
    now_ts = int(time.time()) - 60
    response = client.post(
        "/api/facebook/webhook",
        json={
            "object": "page",
            "entry": [{
                "id": "PAGE_123",
                "time": now_ts,
                "changes": [{
                    "field": "leadgen",
                    "value": {
                        "leadgen_id": "LEADGEN_999",
                        "page_id": "PAGE_123",
                        "form_id": "FORM_456",
                        "created_time": now_ts,
                    },
                }],
            }],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["received"] is True
    assert body["leadgen_events"] == 1
    assert body["created"]
    assert inserted["leads"][0]["source"] == "Facebook"
    assert inserted["leads"][0]["external_lead_id"] == "LEADGEN_999"
    assert "Facebook Form ID" in (inserted["leads"][0].get("notes") or "")
    assert any(e.get("status") == "webhook_received" for e in inserted.get("integration_events", []))


def test_facebook_webhook_skips_meta_test_leadgen_id(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "FACEBOOK_VERIFY_TOKEN", "UMANGCRM123")
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "page-token")
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ID", "REAL_PAGE_99")

    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("fetch_facebook_lead should not run for Meta test ids")

    monkeypatch.setattr(main, "fetch_facebook_lead", fail_fetch)

    client = TestClient(main.app)
    response = client.post(
        "/api/facebook/webhook",
        json={
            "object": "page",
            "entry": [{
                "id": "0",
                "time": 1710000000,
                "changes": [{
                    "field": "leadgen",
                    "value": {
                        "leadgen_id": "444444444444",
                        "page_id": "0",
                        "form_id": "0",
                    },
                }],
            }],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == []
    assert inserted["leads"] == []
    assert any(e.get("status") == "ignored_test" for e in inserted.get("integration_events", []))


def test_normalize_meta_page_id_prefers_real_page_over_zero(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ID", "ENV_PAGE_77")
    assert main.normalize_meta_page_id("0", "REAL_PAGE_12") == "REAL_PAGE_12"
    assert main.normalize_meta_page_id("0", None) == "ENV_PAGE_77"


def test_normalize_meta_field_payload_maps_location_budget_bhk():
    graph_lead = {
        "id": "123",
        "field_data": [
            {"name": "full_name", "values": ["Rahul Sharma"]},
            {"name": "phone_number", "values": ["+919876543210"]},
            {"name": "in_which_locality_are_you_looking?", "values": ["Virar West"]},
            {"name": "what_is_your_budget?", "values": ["50 - 60 Lakhs"]},
            {"name": "configuration", "values": ["2 BHK"]},
        ],
    }
    payload = main.facebook_fields_to_payload(graph_lead, "123")
    lead = main.lead_from_payload(payload, "Facebook")
    assert lead["location"] == "Virar West"
    assert lead["budget"] == "50 - 60 Lakhs"
    assert lead["property_type"] == "2 BHK"


def test_normalize_meta_field_payload_city_locality_combo():
    payload = main.normalize_meta_field_payload({
        "full_name": "Test User",
        "phone": "9876543210",
        "city": "Vasai",
        "locality_name": "Naigaon",
    })
    lead = main.lead_from_payload(payload, "Facebook")
    assert lead["location"] in ("Vasai", "Naigaon, Vasai", "Naigaon")


def test_resolve_page_access_token_uses_me_accounts_for_user_token(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "user-token")
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ID", "PAGE_99")
    monkeypatch.setattr(main, "facebook_token_me_id", lambda _token=None: "USER_1")
    monkeypatch.setattr(main, "_facebook_page_tokens_map", lambda: {"PAGE_99": "page-token-99"})

    assert main.resolve_page_access_token("PAGE_99", require_page_token=True) == "page-token-99"


def test_resolve_page_access_token_accepts_direct_page_token(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "page-token-direct")
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ID", "PAGE_99")
    monkeypatch.setattr(main, "facebook_token_me_id", lambda _token=None: "PAGE_99")

    assert main.resolve_page_access_token("PAGE_99", require_page_token=True) == "page-token-direct"


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


def test_facebook_import_rejects_historical_flag(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "page-token")

    class FakeUser:
        user_id = "u1"
        employee_id = None
        email = "admin@test.com"
        role = "admin"
        name = "Admin"
        acting_as_employee_id = None

    main.app.dependency_overrides[main.get_current_user] = lambda: FakeUser()
    try:
        response = TestClient(main.app).post(
            "/api/integrations/facebook/import",
            json={"days": 90, "allow_historical": True},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Historical Meta lead import is disabled" in response.json()["detail"]


def test_facebook_import_ignores_days_uses_recent_window(monkeypatch):
    """days=90 must not backfill — Graph fetch uses FACEBOOK_AUTO_SYNC_WINDOW_SEC only."""
    _install_fake_supabase(monkeypatch)
    monkeypatch.setattr(main, "FACEBOOK_PAGE_ACCESS_TOKEN", "page-token")
    monkeypatch.setattr(main, "FACEBOOK_FORM_ID", "FORM_1")
    monkeypatch.setattr(main, "FACEBOOK_AUTO_SYNC_WINDOW_SEC", 7200)
    monkeypatch.setattr(main, "resolve_facebook_page_context", lambda page_id=None: ("PAGE_1", "page-token"))
    monkeypatch.setattr(main, "_load_facebook_external_ids", lambda: set())
    monkeypatch.setattr(main, "_load_facebook_suppressed_ids", lambda: set())

    captured = {}

    def fake_list_leads(form_id, limit=500, since_ts=None, access_token=None):
        captured["form_id"] = form_id
        captured["since_ts"] = since_ts
        captured["limit"] = limit
        return []

    monkeypatch.setattr(main, "list_facebook_form_leads", fake_list_leads)

    class FakeUser:
        user_id = "u1"
        employee_id = None
        email = "admin@test.com"
        role = "admin"
        name = "Admin"
        acting_as_employee_id = None

    main.app.dependency_overrides[main.get_current_user] = lambda: FakeUser()
    try:
        response = TestClient(main.app).post(
            "/api/integrations/facebook/import",
            json={"days": 90, "limit": 300},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["window"] == "2h"
    assert body["days"] == 0
    assert captured["form_id"] == "FORM_1"
    assert captured["since_ts"] is not None
    age = int(time.time()) - int(captured["since_ts"])
    assert 7000 <= age <= 7400


def test_facebook_import_impl_rejects_allow_historical():
    try:
        main._facebook_import_impl(allow_historical=True)
        assert False, "expected HTTPException"
    except main.HTTPException as exc:
        assert exc.status_code == 400
        assert "Historical Meta lead import is disabled" in str(exc.detail)
