"""Regression tests for the Housing.com composite dedupe key.

Confirmed required behavior:
- same phone + different project  -> SEPARATE leads (was being dropped)
- same phone + same project + same lead_date -> duplicate (skip)
- same phone + same project + different date -> separate leads
"""
import time

import pytest

from app import legacy_core as main


def _install_fake_supabase(monkeypatch):
    inserted = {"leads": []}

    def fake_select(table, params=None):
        return []

    def fake_insert(table, data):
        if table == "leads":
            inserted["leads"].append(data)
            return data
        return data

    def fake_update(table, pk_col, pk_val, data):
        return {pk_col: pk_val, **data}

    monkeypatch.setattr(main, "sb_select", fake_select)
    monkeypatch.setattr(main, "sb_insert", fake_insert)
    monkeypatch.setattr(main, "sb_update", fake_update)
    monkeypatch.setattr(main, "assign_lead_round_robin", lambda: None)
    monkeypatch.setattr(main, "create_notification", lambda *args, **kwargs: None)
    main.SESSION_CACHE["leads"] = []
    main.SESSION_CACHE["activities"] = []
    return inserted


def _housing_payload(lead_id, phone, project_id, lead_date):
    return {
        "lead_id": lead_id,
        "lead_phone": phone,
        "lead_name": "Customer",
        "project_id": project_id,
        "project_name": f"Project {project_id}",
        "lead_date": str(lead_date),
    }


def _import(payload, actor=None):
    payload = {**payload, "integration_uuid": "test-uuid"}
    return main.create_integrated_lead(payload, "Housing.com", actor=actor)


def test_same_phone_different_projects_create_separate_leads(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    ts = int(time.time()) - 60

    r1 = _import(_housing_payload("H-1", "7977229056", "P1", ts))
    r2 = _import(_housing_payload("H-2", "7977229056", "P2", ts))
    r3 = _import(_housing_payload("H-3", "7977229056", "P3", ts))

    assert r1["status"] == "created"
    assert r2["status"] == "created"
    assert r3["status"] == "created"
    assert len(inserted["leads"]) == 3
    assert len(main.SESSION_CACHE["leads"]) == 3


def test_same_phone_same_project_same_day_is_duplicate(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    ts = int(time.time()) - 1

    r1 = _import(_housing_payload("H-1", "7617803752", "P1", ts))
    r2 = _import(_housing_payload("H-2", "7617803752", "P1", ts))

    assert r1["status"] == "created"
    assert r2["status"] == "duplicate"
    assert r2.get("updated") is False
    assert len(inserted["leads"]) == 1


def test_same_phone_same_project_different_day_separate_leads(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    day1 = int(time.time()) - 2 * 86400
    day2 = int(time.time()) - 300

    r1 = _import(_housing_payload("H-1", "8379004050", "P1", day1))
    r2 = _import(_housing_payload("H-2", "8379004050", "P1", day2))

    assert r1["status"] == "created"
    assert r2["status"] == "created"
    assert len(inserted["leads"]) == 2


def test_duplicate_never_overwrites_existing_lead(monkeypatch):
    inserted = _install_fake_supabase(monkeypatch)
    ts = int(time.time()) - 1

    r1 = _import(_housing_payload("H-1", "9930504887", "P1", ts))
    first_id = r1["lead_id"]
    # Same enquiry re-delivered with a different name/location must not mutate the row.
    payload2 = _housing_payload("H-1", "9930504887", "P1", ts)
    payload2["customer_name"] = "Changed Name"
    payload2["project_name"] = "Other Name"
    r2 = _import(payload2)

    assert r2["status"] == "duplicate"
    assert r2["lead_id"] == first_id
    stored = inserted["leads"][0]
    assert stored["name"] != "Changed Name"
    assert r2.get("updated") is False