import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(**kwargs):
    base = {"lead_id": "l1", "status": "active", "stage": "assigned", "assigned_to": "emp1"}
    base.update(kwargs)
    return base


def test_parse_inquiry_status_filter_comma_separated():
    assert main.parse_inquiry_status_filter("ringing,not_interested") == ["ringing", "not_interested"]
    assert main.parse_inquiry_status_filter("all") == []


def test_lead_matches_multiple_inquiry_status_or_logic():
    ringing = _lead(call_status="ringing")
    not_interested = _lead(status="negative")
    low_budget = _lead(status="negative", priority="low_budget")
    hot = _lead(priority="hot", stage="positive")

    assert main.lead_matches_inquiry_filter(ringing, "ringing,not_interested") is True
    assert main.lead_matches_inquiry_filter(not_interested, "ringing,not_interested") is True
    assert main.lead_matches_inquiry_filter(low_budget, "low_budget,ringing") is True
    assert main.lead_matches_inquiry_filter(hot, "ringing,not_interested") is False
    assert main.lead_matches_inquiry_filter(hot, "hot,ringing") is True


def test_unassigned_filter_matches_null_and_legacy_name_assignments():
    employees = [
        {"employee_id": "emp1", "user_id": "user1", "name": "Khyati Shah", "active": True},
    ]
    truly_unassigned = _lead(lead_id="l1", assigned_to=None, stage="new")
    blank_assigned = _lead(lead_id="l2", assigned_to="  ", stage="new")
    legacy_name = _lead(lead_id="l3", assigned_to="Khyati Shah", stage="assigned")
    by_id = _lead(lead_id="l4", assigned_to="emp1", stage="assigned")
    orphan_value = _lead(lead_id="l5", assigned_to="deleted_emp", stage="new")

    assert main.is_lead_unassigned(truly_unassigned, employees) is True
    assert main.is_lead_unassigned(blank_assigned, employees) is True
    assert main.is_lead_unassigned(orphan_value, employees) is True
    assert main.is_lead_unassigned(legacy_name, employees) is False
    assert main.is_lead_unassigned(by_id, employees) is False

    filtered = main.filter_assign_workspace_leads(
        [truly_unassigned, blank_assigned, legacy_name, by_id, orphan_value],
        assigned_to="unassigned",
        employees=employees,
    )
    ids = {row["lead_id"] for row in filtered}
    assert ids == {"l1", "l2", "l5"}


def test_unassigned_filter_sorts_newest_created_first():
    employees = [{"employee_id": "emp1", "name": "A", "active": True}]
    older = _lead(lead_id="old", assigned_to=None, created_at="2026-06-01T10:00:00+00:00")
    newer = _lead(lead_id="new", assigned_to=None, created_at="2026-06-28T10:00:00+00:00")
    filtered = main.filter_assign_workspace_leads(
        [older, newer],
        assigned_to="unassigned",
        employees=employees,
    )
    assert [row["lead_id"] for row in filtered] == ["new", "old"]


def test_location_filter_matches_location_field():
    leads = [
        _lead(lead_id="l1", location="Nalasopara West", name="A"),
        _lead(lead_id="l2", location="Virar East", name="B"),
        _lead(lead_id="l3", location="", notes="Interested in Umang Skylark Nalasopara"),
    ]
    filtered = main.filter_assign_workspace_leads(leads, location="nalasopara")
    assert {row["lead_id"] for row in filtered} == {"l1", "l3"}


def test_dashboard_ringing_bucket():
    rows = [
        _lead(lead_id="r1", call_status="ringing", status="active"),
        _lead(lead_id="r2", call_status="", status="active"),
        _lead(lead_id="r3", call_status="call_back", status="negative"),
    ]
    today = "2026-06-28"
    filtered = main.filter_lead_bucket(rows, "ringing", today)
    assert {l["lead_id"] for l in filtered} == {"r1"}
