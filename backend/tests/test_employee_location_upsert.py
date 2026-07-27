"""Focused tests for employee_locations upsert (latest GPS only)."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _user(role="telecaller", employee_id="emp_track_1"):
    return main.User(
        user_id="user_track_1",
        email="tracker@example.com",
        name="Tracker Emp",
        role=role,
        employee_id=employee_id,
        acting_as_employee_id=employee_id,
        created_at=datetime.now(timezone.utc),
    )


def test_upsert_employee_location_writes_one_row(monkeypatch):
    calls = []

    def fake_upsert(table, data, on_conflict="employee_id"):
        calls.append({"table": table, "data": data, "on_conflict": on_conflict})
        return data

    monkeypatch.setattr(main, "sb_upsert", fake_upsert)
    saved = main.upsert_employee_location("emp_track_1", 19.1, 72.9, "2026-07-27T10:00:00+00:00")
    assert saved["employee_id"] == "emp_track_1"
    assert saved["latitude"] == 19.1
    assert saved["longitude"] == 72.9
    assert len(calls) == 1
    assert calls[0]["table"] == "employee_locations"
    assert calls[0]["on_conflict"] == "employee_id"


def test_upsert_employee_location_overwrites_same_employee(monkeypatch):
    """Two pings for the same employee_id must upsert twice (UPDATE), never duplicate-insert."""
    store = {}

    def fake_upsert(table, data, on_conflict="employee_id"):
        assert table == "employee_locations"
        assert on_conflict == "employee_id"
        eid = data["employee_id"]
        store[eid] = {**data}
        return store[eid]

    monkeypatch.setattr(main, "sb_upsert", fake_upsert)
    main.upsert_employee_location("emp_track_1", 19.1, 72.9, "2026-07-27T10:00:00+00:00")
    main.upsert_employee_location("emp_track_1", 19.2, 72.95, "2026-07-27T10:01:00+00:00")
    assert len(store) == 1
    assert store["emp_track_1"]["latitude"] == 19.2
    assert store["emp_track_1"]["longitude"] == 72.95
    assert store["emp_track_1"]["updated_at"] == "2026-07-27T10:01:00+00:00"


def test_ping_location_upserts_and_dual_writes_legacy(monkeypatch):
    upserts = []
    updates = []

    monkeypatch.setattr(main, "resolve_employee_id", lambda _cu: "emp_track_1")

    def fake_upsert_loc(eid, lat, lng, updated_at=None):
        upserts.append({"employee_id": eid, "latitude": lat, "longitude": lng, "updated_at": updated_at})
        return {"employee_id": eid}

    monkeypatch.setattr(main, "upsert_employee_location", fake_upsert_loc)
    monkeypatch.setattr(
        main,
        "sb_update",
        lambda table, pk, pk_val, data: updates.append(
            {"table": table, "pk": pk, "pk_val": pk_val, "data": data}
        ) or data,
    )
    monkeypatch.setattr(main, "invalidate_employees_cache", lambda: None)

    class Req:
        async def json(self):
            return {"lat": 19.4, "lng": 72.8}

    result = asyncio.run(main.ping_location(Req(), _user()))
    assert result["ok"] is True
    assert result["employee_id"] == "emp_track_1"
    assert len(upserts) == 1
    assert upserts[0]["latitude"] == 19.4
    assert len(updates) == 1
    assert updates[0]["table"] == "employees"
    assert updates[0]["data"]["last_lat"] == 19.4


def test_current_lead_for_employee_picks_newest_active(monkeypatch):
    emp = {"employee_id": "emp_track_1", "name": "Tracker Emp", "user_id": "user_track_1"}
    leads = [
        {
            "lead_id": "lead_old",
            "name": "Old Lead",
            "assigned_to": "emp_track_1",
            "status": "active",
            "stage": "assigned",
            "updated_at": "2026-07-01T10:00:00+00:00",
            "created_at": "2026-07-01T10:00:00+00:00",
        },
        {
            "lead_id": "lead_new",
            "name": "Hot Lead",
            "assigned_to": "emp_track_1",
            "status": "active",
            "stage": "positive",
            "updated_at": "2026-07-27T12:00:00+00:00",
            "created_at": "2026-07-20T10:00:00+00:00",
        },
        {
            "lead_id": "lead_neg",
            "name": "Dead Lead",
            "assigned_to": "emp_track_1",
            "status": "negative",
            "stage": "negative",
            "updated_at": "2026-07-28T12:00:00+00:00",
            "created_at": "2026-07-28T12:00:00+00:00",
        },
    ]
    monkeypatch.setattr(
        main,
        "lead_assigned_to_employee",
        lambda lead, employee: lead.get("assigned_to") == employee.get("employee_id"),
    )
    cur = main.current_lead_for_employee(emp, leads)
    assert cur is not None
    assert cur["lead_id"] == "lead_new"
    assert cur["name"] == "Hot Lead"


def test_list_employee_locations_admin_only(monkeypatch):
    monkeypatch.setattr(main, "sb_select", lambda *a, **k: [])
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select="*": [])

    try:
        asyncio.run(main.list_employee_locations(_user(role="telecaller")))
        assert False, "expected 403"
    except main.HTTPException as exc:
        assert exc.status_code == 403

    out = asyncio.run(main.list_employee_locations(_user(role="admin", employee_id="emp_admin")))
    assert out == []
