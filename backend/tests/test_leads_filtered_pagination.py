"""Pagination for /api/leads/filtered (dashboard drill-down)."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


class _FakeUser:
    user_id = "u1"
    email = "admin@test.com"
    role = "admin"
    name = "Admin"
    acting_as_employee_id = None
    employee_id = None


def _make_leads(n: int):
    return [
        {
            "lead_id": f"lead_{i:04d}",
            "name": f"Lead {i}",
            "phone": f"+9190000{i:05d}",
            "email": None,
            "source": "manual_entry",
            "stage": "new",
            "status": "active",
            "priority": "normal",
            "call_status": None,
            "assigned_to": None,
            "created_at": f"2026-07-{(i % 28) + 1:02d}T10:00:00Z",
            "updated_at": f"2026-07-{(i % 28) + 1:02d}T10:00:00Z",
        }
        for i in range(n)
    ]


def test_leads_filtered_paginates_with_offset(monkeypatch):
    leads = _make_leads(12)
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select=None: leads)
    monkeypatch.setattr(
        main,
        "sb_select",
        lambda table, params=None: [] if table == "employees" else [],
    )

    main.app.dependency_overrides[main.get_current_user] = lambda: _FakeUser()
    try:
        client = TestClient(main.app)

        page1 = client.get("/api/leads/filtered", params={"bucket": "all", "limit": 5, "offset": 0})
        assert page1.status_code == 200, page1.text
        body1 = page1.json()
        assert body1["total"] == 12
        assert body1["offset"] == 0
        assert body1["limit"] == 5
        assert body1["has_more"] is True
        assert len(body1["leads"]) == 5
        ids1 = [l["lead_id"] for l in body1["leads"]]

        page2 = client.get("/api/leads/filtered", params={"bucket": "all", "limit": 5, "offset": 5})
        assert page2.status_code == 200, page2.text
        body2 = page2.json()
        assert body2["total"] == 12
        assert body2["offset"] == 5
        assert body2["has_more"] is True
        assert len(body2["leads"]) == 5
        ids2 = [l["lead_id"] for l in body2["leads"]]
        assert set(ids1).isdisjoint(ids2)

        page3 = client.get("/api/leads/filtered", params={"bucket": "all", "limit": 5, "offset": 10})
        assert page3.status_code == 200, page3.text
        body3 = page3.json()
        assert body3["total"] == 12
        assert body3["offset"] == 10
        assert body3["has_more"] is False
        assert len(body3["leads"]) == 2
        assert set(ids1 + ids2 + [l["lead_id"] for l in body3["leads"]]) == {l["lead_id"] for l in leads}
    finally:
        main.app.dependency_overrides.clear()


def test_leads_filtered_clamps_limit_and_offset(monkeypatch):
    leads = _make_leads(3)
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select=None: leads)
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: [])

    main.app.dependency_overrides[main.get_current_user] = lambda: _FakeUser()
    try:
        client = TestClient(main.app)
        oversized = client.get("/api/leads/filtered", params={"bucket": "all", "limit": 9999, "offset": -10})
        assert oversized.status_code == 200, oversized.text
        body = oversized.json()
        assert body["limit"] == 500
        assert body["offset"] == 0
        assert len(body["leads"]) == 3
        assert body["has_more"] is False
    finally:
        main.app.dependency_overrides.clear()


def test_leads_filtered_multi_status_filter(monkeypatch):
    leads = [
        {
            "lead_id": "open1",
            "name": "Open",
            "phone": "+911",
            "source": "manual_entry",
            "stage": "new",
            "status": "active",
            "assigned_to": None,
            "created_at": "2026-07-10T10:00:00Z",
        },
        {
            "lead_id": "ring1",
            "name": "Ring",
            "phone": "+912",
            "source": "manual_entry",
            "stage": "assigned",
            "status": "active",
            "call_status": "ringing",
            "assigned_to": "emp1",
            "assigned_at": "2026-07-01T10:00:00Z",
            "created_at": "2026-07-01T10:00:00Z",
        },
        {
            "lead_id": "hot1",
            "name": "Hot",
            "phone": "+913",
            "source": "manual_entry",
            "stage": "positive",
            "status": "active",
            "priority": "hot",
            "assigned_to": "emp1",
            "assigned_at": "2026-07-01T10:00:00Z",
            "created_at": "2026-07-01T10:00:00Z",
        },
        {
            "lead_id": "cold1",
            "name": "Cold",
            "phone": "+914",
            "source": "manual_entry",
            "stage": "positive",
            "status": "active",
            "priority": "cold",
            "assigned_to": "emp1",
            "assigned_at": "2026-07-01T10:00:00Z",
            "created_at": "2026-07-01T10:00:00Z",
        },
    ]
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select=None: leads)
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: [])

    main.app.dependency_overrides[main.get_current_user] = lambda: _FakeUser()
    try:
        client = TestClient(main.app)
        res = client.get(
            "/api/leads/filtered",
            params={"bucket": "all", "status": "ringing,cold_leads", "limit": 50},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 2
        assert {l["lead_id"] for l in body["leads"]} == {"ring1", "cold1"}
        assert body["filters"]["status"] == "ringing,cold_leads"
    finally:
        main.app.dependency_overrides.clear()
