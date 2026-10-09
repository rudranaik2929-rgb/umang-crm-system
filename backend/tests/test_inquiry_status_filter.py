import sys
from pathlib import Path
import datetime

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
        _lead(lead_id="r4", call_status="ringing", status="active", priority="hot", stage="positive"),
    ]
    today = "2026-06-28"
    filtered = main.filter_lead_bucket(rows, "ringing", today)
    # Hot beats stale ringing
    assert {l["lead_id"] for l in filtered} == {"r1"}


def test_inquiry_follow_up_status_does_not_collide_with_ringing():
    fu = _lead(follow_up_at="2026-06-28T10:00:00+00:00")
    both = _lead(call_status="ringing", follow_up_at="2026-06-28T10:00:00+00:00")
    assert main.classify_inquiry_status(fu) == "follow_up"
    assert main.classify_inquiry_status(both) == "ringing"


def test_inquiry_cold_and_follow_up_filters():
    cold = _lead(stage="positive", priority="cold")
    hot = _lead(stage="positive", priority="hot")
    fu = _lead(follow_up_at="2026-06-28T10:00:00+00:00")
    assert main.classify_inquiry_status(cold) == "cold"
    assert main.classify_inquiry_status(hot) == "hot"
    assert main.lead_matches_inquiry_filter(cold, "cold") is True
    assert main.lead_matches_inquiry_filter(hot, "cold") is False
    assert main.lead_matches_inquiry_filter(fu, "follow_up") is True
    assert main.lead_matches_inquiry_filter(cold, "follow_up,cold") is True
    assert "follow_up" in main.ASSIGN_INQUIRY_STATUSES
    assert "cold" in main.ASSIGN_INQUIRY_STATUSES


def test_missed_leads_inquiry_filter():
    past = (main.now_utc() - datetime.timedelta(hours=28)).isoformat()
    missed = _lead(lead_id="m1", assigned_at=past)
    worked = _lead(lead_id="m2", assigned_at=past, call_status="ringing")
    fresh = _lead(lead_id="m3", assigned_at=main.now_utc().isoformat())

    assert main.is_missed_lead(missed) is True
    assert main.is_missed_lead(worked) is False
    assert main.is_missed_lead(fresh) is False
    assert main.lead_matches_inquiry_filter(missed, "missed_leads") is True
    assert main.lead_matches_inquiry_filter(worked, "missed_leads") is False
    assert main.lead_matches_inquiry_filter(fresh, "missed_leads") is False
    assert main.lead_matches_inquiry_filter(missed, "ringing,missed_leads") is True
    assert "missed_leads" in main.ASSIGN_INQUIRY_STATUSES


def test_assign_workspace_filter_and_facets_include_missed_leads():
    past = (main.now_utc() - datetime.timedelta(hours=28)).isoformat()
    missed = _lead(lead_id="m1", assigned_at=past)
    worked = _lead(lead_id="m2", assigned_at=past, call_status="ringing")

    filtered = main.filter_assign_workspace_leads(
        [missed, worked],
        inquiry_status="missed_leads",
    )
    assert {l["lead_id"] for l in filtered} == {"m1"}

    facets = main.compute_assign_workspace_facets([missed, worked])
    assert facets["inquiry_status"]["missed_leads"] == 1
    # Missed lead still counts in the classic "active" bucket; the worked one is "ringing".
    assert facets["inquiry_status"]["active"] == 1
    assert facets["inquiry_status"]["ringing"] == 1


def test_open_leads_inquiry_filter():
    fresh_open = _lead(lead_id="o1", stage="assigned", assigned_to="emp1", assigned_at=main.now_utc().isoformat())
    unassigned_open = _lead(lead_id="o2", stage="new", assigned_to=None)
    cold = _lead(lead_id="o3", stage="positive", priority="cold")
    missed = _lead(lead_id="o4", assigned_at=(main.now_utc() - datetime.timedelta(hours=28)).isoformat())

    assert main.classify_company_dashboard_bucket(fresh_open) == "open_leads"
    assert main.classify_company_dashboard_bucket(unassigned_open) == "open_leads"
    assert main.classify_company_dashboard_bucket(cold) == "cold_leads"
    assert main.classify_company_dashboard_bucket(missed) == "missed_leads"

    assert main.lead_matches_inquiry_filter(fresh_open, "open_leads") is True
    assert main.lead_matches_inquiry_filter(unassigned_open, "open_leads") is True
    assert main.lead_matches_inquiry_filter(cold, "open_leads") is False
    assert main.lead_matches_inquiry_filter(missed, "open_leads") is False
    assert main.lead_matches_inquiry_filter(fresh_open, "open_leads,cold") is True
    assert "open_leads" in main.ASSIGN_INQUIRY_STATUSES


def test_assign_workspace_filter_and_facets_include_open_leads():
    fresh_open = _lead(lead_id="o1", stage="assigned", assigned_to="emp1", assigned_at=main.now_utc().isoformat())
    cold = _lead(lead_id="o3", stage="positive", priority="cold")

    filtered = main.filter_assign_workspace_leads(
        [fresh_open, cold],
        inquiry_status="open_leads",
    )
    assert {l["lead_id"] for l in filtered} == {"o1"}

    facets = main.compute_assign_workspace_facets([fresh_open, cold])
    assert facets["inquiry_status"]["open_leads"] == 1
    assert facets["inquiry_status"]["cold"] == 1


def test_dashboard_visited_bucket():
    rows = [
        _lead(lead_id="v1", stage="site_visit", status="active"),
        _lead(lead_id="v2", stage="positive", status="active"),
        _lead(lead_id="v3", stage="site_visit", status="negative"),
        _lead(lead_id="v4", stage="assigned", status="active"),
    ]
    filtered = main.filter_lead_bucket(rows, "visited", "2026-06-28")
    assert {l["lead_id"] for l in filtered} == {"v1"}
