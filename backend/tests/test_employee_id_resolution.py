import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _user():
    return main.User(
        user_id="user_61ea2268a864",
        email="umangsales020@gmail.com",
        name="Khyati Shah",
        role="telecaller",
        employee_id="user_61ea2268a864",
        acting_as_employee_id="user_61ea2268a864",
        created_at=datetime.now(timezone.utc),
    )


def test_resolve_employee_id_ignores_user_id_masquerading_as_employee_id(monkeypatch):
    def fake_select(table, params=None):
        params = params or {}
        if table != "employees":
            return []
        if params.get("employee_id") == "eq.user_61ea2268a864":
            return []
        if params.get("email") == "eq.umangsales020@gmail.com":
            return [{"employee_id": "emp_bf700d434343"}]
        if params.get("user_id") == "eq.user_61ea2268a864":
            return [{"employee_id": "emp_bf700d434343"}]
        if params.get("employee_id") == "eq.emp_bf700d434343":
            return [{"employee_id": "emp_bf700d434343", "name": "Khyati Shah", "user_id": "user_61ea2268a864"}]
        return []

    monkeypatch.setattr(main, "sb_select", fake_select)
    assert main.resolve_employee_id(_user()) == "emp_bf700d434343"


def test_notification_user_ids_uses_real_employee_id(monkeypatch):
    def fake_select(table, params=None):
        params = params or {}
        if table != "employees":
            return []
        if params.get("employee_id") == "eq.user_61ea2268a864":
            return []
        if params.get("email") == "eq.umangsales020@gmail.com":
            return [{
                "employee_id": "emp_bf700d434343",
                "name": "Khyati Shah",
                "user_id": "user_61ea2268a864",
                "active": True,
            }]
        if params.get("employee_id") == "eq.emp_bf700d434343":
            return [{
                "employee_id": "emp_bf700d434343",
                "name": "Khyati Shah",
                "user_id": "user_61ea2268a864",
                "active": True,
            }]
        return []

    monkeypatch.setattr(main, "sb_select", fake_select)
    ids = main._notification_user_ids(_user())
    assert "emp_bf700d434343" in ids
    assert "user_61ea2268a864" in ids


def test_repair_user_employee_link_fixes_wrong_id(monkeypatch):
    updates = []
    monkeypatch.setattr(main, "_employee_id_exists", lambda eid: eid == "emp_bf700d434343")
    monkeypatch.setattr(main, "sb_select", lambda table, params=None: (
        [{"employee_id": "emp_bf700d434343"}]
        if (params or {}).get("email") == "eq.umangsales020@gmail.com"
        else []
    ))
    monkeypatch.setattr(main, "sb_update", lambda *a, **k: updates.append(a) or True)
    monkeypatch.setattr(main, "threading", MagicMock(Thread=lambda target, daemon: MagicMock(start=target)))

    fixed = main._repair_user_employee_link({
        "user_id": "user_61ea2268a864",
        "email": "umangsales020@gmail.com",
        "role": "telecaller",
        "employee_id": "user_61ea2268a864",
    })
    assert fixed["employee_id"] == "emp_bf700d434343"
    assert fixed["acting_as_employee_id"] == "emp_bf700d434343"
