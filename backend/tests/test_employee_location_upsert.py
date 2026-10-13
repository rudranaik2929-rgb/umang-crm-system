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
    monkeypatch.setattr(main, "sb_select", lambda *a, **k: [])
    monkeypatch.setattr(main, "_columns_exist", lambda *a, **k: False)
    monkeypatch.setattr(main, "reverse_geocode", lambda lat, lng: None)

    def fake_upsert_loc(eid, lat, lng, updated_at=None, **kwargs):
        upserts.append({"employee_id": eid, "latitude": lat, "longitude": lng,
                        "updated_at": updated_at, "kwargs": kwargs})
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
        headers = {}
        client = None

        async def json(self):
            return {"lat": 19.4, "lng": 72.8}

    result = asyncio.run(main.ping_location(Req(), _user()))
    assert result["ok"] is True
    assert result["employee_id"] == "emp_track_1"
    assert result["accepted"] is True
    assert len(upserts) == 1
    assert upserts[0]["latitude"] == 19.4
    assert len(updates) == 1
    assert updates[0]["table"] == "employees"
    assert updates[0]["data"]["last_lat"] == 19.4


def test_ping_location_rejects_poor_accuracy(monkeypatch):
    """A wild fix (> LOCATION_MAX_ACCURACY_M) must not overwrite a good reading."""
    monkeypatch.setattr(main, "resolve_employee_id", lambda _cu: "emp_track_1")
    monkeypatch.setattr(
        main, "sb_select",
        lambda *a, **k: [{"latitude": 19.0, "longitude": 72.0,
                          "accuracy": 20, "updated_at": "2026-07-27T10:00:00+00:00"}],
    )
    called = {"upsert": 0}
    monkeypatch.setattr(main, "upsert_employee_location",
                        lambda *a, **k: called.__setitem__("upsert", called["upsert"] + 1))

    class Req:
        headers = {}
        client = None

        async def json(self):
            return {"lat": 21.0, "lng": 79.0, "accuracy": 5000}

    result = asyncio.run(main.ping_location(Req(), _user()))
    assert result["ok"] is True
    assert result["accepted"] is False
    assert result["reason"] == "low_accuracy"
    assert called["upsert"] == 0


def test_ping_location_rejects_out_of_range(monkeypatch):
    monkeypatch.setattr(main, "resolve_employee_id", lambda _cu: "emp_track_1")

    class Req:
        headers = {}
        client = None

        async def json(self):
            return {"lat": 999, "lng": 72.8}

    result = asyncio.run(main.ping_location(Req(), _user()))
    assert result["ok"] is False
    assert result["reason"] == "out_of_range"


def test_haversine_distance_known_pair():
    # ~1.11 km per 0.01° of latitude near the equator-ish latitudes.
    d = main._haversine_m(19.00, 72.00, 19.01, 72.00)
    assert d is not None and 1100 < d < 1120
    assert main._haversine_m(19.0, 72.0, 19.0, 72.0) == 0


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


def test_set_employee_location_manual(monkeypatch):
    monkeypatch.setattr(
        main, "sb_select",
        lambda *a, **k: [{"employee_id": "emp_track_1", "name": "Tracker Emp"}],
    )
    monkeypatch.setattr(main, "_columns_exist", lambda *a, **k: False)
    upserts = []
    monkeypatch.setattr(
        main, "upsert_employee_location",
        lambda eid, lat, lng, ts=None, **kw: upserts.append(kw) or {"employee_id": eid},
    )
    monkeypatch.setattr(main, "sb_update", lambda *a, **k: {})
    monkeypatch.setattr(main, "invalidate_employees_cache", lambda: None)
    monkeypatch.setattr(main, "log_activity", lambda *a, **k: None)

    class Req:
        headers = {}
        client = None

    payload = main.EmployeeLocationSet(latitude=19.1, longitude=72.9, address="Andheri, Mumbai")
    out = asyncio.run(main.set_employee_location("emp_track_1", payload, Req(), _user(role="admin")))
    assert out["ok"] is True
    assert out["source"] == "manual"
    assert upserts and upserts[0]["source"] == "manual"
    assert upserts[0]["address"] == "Andheri, Mumbai"


def test_set_employee_location_rejects_bad_coords(monkeypatch):
    monkeypatch.setattr(
        main, "sb_select",
        lambda *a, **k: [{"employee_id": "emp_track_1", "name": "Tracker Emp"}],
    )
    class Req:
        headers = {}
        client = None

    payload = main.EmployeeLocationSet(latitude=999, longitude=72.9)
    try:
        asyncio.run(main.set_employee_location("emp_track_1", payload, Req(), _user(role="admin")))
        assert False, "expected 400"
    except main.HTTPException as exc:
        assert exc.status_code == 400


def test_employee_location_history_admin_only(monkeypatch):
    monkeypatch.setattr(main, "_columns_exist", lambda *a, **k: True)
    monkeypatch.setattr(
        main, "sb_select",
        lambda *a, **k: [{"latitude": 1, "longitude": 2, "source": "gps",
                          "created_at": "2026-07-27T10:00:00+00:00"}],
    )

    try:
        asyncio.run(main.employee_location_history("emp_track_1", 10, _user(role="telecaller")))
        assert False, "expected 403"
    except main.HTTPException as exc:
        assert exc.status_code == 403

    out = asyncio.run(main.employee_location_history("emp_track_1", 10, _user(role="admin")))
    assert out["employee_id"] == "emp_track_1"
    assert out["points"][0]["latitude"] == 1
