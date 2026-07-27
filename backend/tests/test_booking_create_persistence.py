"""Booking create must persist — never return a ghost row that vanishes on list refresh."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_property_tbd_is_not_legacy_skeleton():
    """Employee form defaults (Property TBD + zero amounts) must stay visible in the list."""
    row = {
        "property_name": "Property TBD",
        "booking_amount": 0,
        "token_received": 0,
        "flat_cost": None,
        "agreement_value": None,
    }
    assert main.is_legacy_skeleton_booking(row) is False


def test_selected_property_zero_row_is_legacy_skeleton():
    row = {
        "property_name": "Selected Property",
        "booking_amount": 0,
        "token_received": 0,
    }
    assert main.is_legacy_skeleton_booking(row) is True


def test_persist_booking_row_retries_without_optional_columns(monkeypatch):
    calls = []

    def fake_insert(_table, data):
        calls.append(dict(data))
        if "booking_officer_id" in data or "booking_date" in data:
            return None
        return {**data, "persisted": True}

    monkeypatch.setattr(main, "sb_insert", fake_insert)
    row = {
        "booking_id": "bkg_1",
        "lead_id": "lead_1",
        "lead_name": "Test",
        "property_name": "Property TBD",
        "booking_amount": 0,
        "token_received": 0,
        "agreement_status": "pending",
        "payment_progress": 0,
        "status": "active",
        "created_at": "2026-07-27T00:00:00+00:00",
        "booking_officer_id": "emp_1",
        "booking_date": "2026-07-27T12:00:00.000Z",
    }
    result = main._persist_booking_row(row)
    assert result is not None
    assert result.get("booking_id") == "bkg_1"
    assert len(calls) == 2
    assert "booking_officer_id" not in calls[1]
    assert "booking_date" not in calls[1]


def test_persist_booking_row_returns_none_when_all_inserts_fail(monkeypatch):
    monkeypatch.setattr(main, "sb_insert", lambda *_a, **_k: None)
    assert main._persist_booking_row({
        "booking_id": "bkg_x",
        "lead_id": "lead_x",
        "lead_name": "X",
        "property_name": "Property TBD",
        "booking_amount": 0,
        "token_received": 0,
        "agreement_status": "pending",
        "payment_progress": 0,
        "status": "active",
        "created_at": "2026-07-27T00:00:00+00:00",
    }) is None


def test_create_booking_raises_when_insert_fails(monkeypatch):
    """Failed Supabase insert must 503 — not return a cache-only row that disappears."""
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: (
        [{"lead_id": "lead_1", "name": "Asha"}] if table == "leads" else []
    ))
    monkeypatch.setattr(main, "sb_insert", lambda *_a, **_k: None)
    monkeypatch.setattr(main, "resolve_employee_id", lambda _cu: "emp_booking_1")
    monkeypatch.setattr(main, "sb_update", lambda *_a, **_k: {})
    monkeypatch.setattr(main, "update_cached_lead", lambda *_a, **_k: None)
    monkeypatch.setattr(main, "invalidate_leads_cache", lambda: None)
    monkeypatch.setattr(main, "SESSION_CACHE", {
        "leads": [], "bookings": [], "visits": [], "followups": [],
        "loans": [], "activities": [], "customers": [], "notifications": [],
    })

    payload = main.BookingCreate(
        lead_id="lead_1",
        property_name="Property TBD",
        booking_amount=0,
        token_received=0,
    )
    cu = SimpleNamespace(
        user_id="user_1",
        email="booking@example.com",
        role="booking",
        employee_id="emp_booking_1",
        acting_as_employee_id="emp_booking_1",
        name="Booking Emp",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_booking(payload, cu))
    assert exc.value.status_code == 503
    assert main.SESSION_CACHE["bookings"] == []


def test_create_booking_persists_and_lists(monkeypatch):
    stored = {}

    def fake_insert(table, data):
        if table != "bookings":
            return None
        stored[data["booking_id"]] = dict(data)
        return dict(data)

    def fake_select(table, params=None):
        params = params or {}
        if table == "leads":
            return [{"lead_id": "lead_1", "name": "Asha"}]
        if table == "bookings":
            return list(stored.values())
        return []

    monkeypatch.setattr(main, "sb_insert", fake_insert)
    monkeypatch.setattr(main, "sb_select", fake_select)
    monkeypatch.setattr(main, "resolve_employee_id", lambda _cu: "emp_booking_1")
    monkeypatch.setattr(main, "sb_update", lambda *_a, **_k: {})
    monkeypatch.setattr(main, "update_cached_lead", lambda *_a, **_k: None)
    monkeypatch.setattr(main, "invalidate_leads_cache", lambda: None)
    monkeypatch.setattr(main, "SESSION_CACHE", {
        "leads": [], "bookings": [], "visits": [], "followups": [],
        "loans": [], "activities": [], "customers": [], "notifications": [],
    })
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select="*": [
        {"lead_id": "lead_1", "name": "Asha"},
    ])

    payload = main.BookingCreate(
        lead_id="lead_1",
        property_name="Property TBD",
        booking_amount=0,
        token_received=0,
    )
    cu = SimpleNamespace(
        user_id="user_1",
        email="booking@example.com",
        role="booking",
        employee_id="emp_booking_1",
        acting_as_employee_id="emp_booking_1",
        name="Booking Emp",
    )

    created = asyncio.run(main.create_booking(payload, cu))
    assert created["booking_id"] in stored
    assert created["property_name"] == "Property TBD"
    assert created["booking_officer_id"] == "emp_booking_1"
    assert any(b.get("booking_id") == created["booking_id"] for b in main.SESSION_CACHE["bookings"])

    listed = asyncio.run(main.list_bookings(cu))
    assert any(b.get("booking_id") == created["booking_id"] for b in listed)
    assert not any(main.is_legacy_skeleton_booking(b) for b in listed if b.get("booking_id") == created["booking_id"])
