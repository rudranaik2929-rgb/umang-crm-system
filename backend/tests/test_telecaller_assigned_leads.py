import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _employee():
    return {
        "employee_id": "emp_khyati",
        "name": "Khyati Shah",
        "email": "khyati@umang.com",
        "user_id": "user_khyati",
    }


def _user():
    return main.User(
        user_id="user_khyati",
        email="khyati@umang.com",
        name="Khyati Shah",
        role="telecaller",
        employee_id="emp_khyati",
        acting_as_employee_id="emp_khyati",
        created_at=datetime.now(timezone.utc),
    )


def test_lead_assigned_to_employee_matches_name_case_insensitive():
    employee = _employee()
    lead = {"lead_id": "l1", "assigned_to": "khyati shah", "stage": "assigned", "status": "active"}
    assert main.lead_assigned_to_employee(lead, employee) is True


def test_fetch_employee_assigned_leads_finds_name_assigned_rows(monkeypatch):
    employee = _employee()
    user = _user()
    leads = [
        {"lead_id": "l1", "assigned_to": "Khyati Shah", "stage": "assigned", "status": "active", "created_at": "2026-03-01"},
        {"lead_id": "l2", "assigned_to": "emp_other", "stage": "assigned", "status": "active", "created_at": "2026-03-02"},
    ]

    monkeypatch.setattr(main, "_employee_record_for_user", lambda cu: employee)
    monkeypatch.setattr(main, "fetch_all_leads_merged", lambda select="*": leads)

    matched = main.fetch_employee_assigned_leads(user, "lead_id,assigned_to,stage,status,created_at")
    assert len(matched) == 1
    assert matched[0]["lead_id"] == "l1"


def test_telecaller_queue_includes_assigned_name_matched_leads():
    employee = _employee()
    leads = [
        {
            "lead_id": "l1",
            "assigned_to": "khyati shah",
            "stage": "assigned",
            "status": "active",
            "assigned_at": main.now_utc().isoformat(),
            "created_at": "2026-03-01",
        }
    ]
    emp_leads = main.leads_for_employee_record(employee, leads)
    queue = main.filter_employee_queue_leads(emp_leads, "telecaller")
    assert len(queue) == 1
