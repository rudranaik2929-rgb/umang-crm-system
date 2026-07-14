import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(lead_id: str, assigned_hours_ago: float, **extra):
    assigned_at = datetime.now(timezone.utc) - timedelta(hours=assigned_hours_ago)
    row = {
        "lead_id": lead_id,
        "assigned_to": "emp1",
        "status": "active",
        "stage": "assigned",
        "assigned_at": assigned_at.isoformat(),
    }
    row.update(extra)
    return row


def test_new_and_total_leads_are_mutually_exclusive_by_action():
    leads = [
        _lead("untouched_old", 30),
        _lead("ringing_old", 48, call_status="ringing"),
        _lead("untouched_new", 2),
        _lead("hot_new", 0.5, priority="hot"),
    ]
    new_rows = main.filter_employee_new_leads(leads)
    total_rows = main.filter_employee_backlog_leads(leads)
    assert {l["lead_id"] for l in new_rows} == {"untouched_old", "untouched_new"}
    assert {l["lead_id"] for l in total_rows} == {"ringing_old", "hot_new"}
    assert len(new_rows) + len(total_rows) == 4


def test_bulk_assign_stays_in_new_until_employee_updates():
    untouched = [_lead(f"old{i}", 30 + i) for i in range(24)]
    fresh = [_lead(f"new{i}", 0.1) for i in range(56)]
    stats = main.compute_employee_assignment_stats(untouched + fresh, "telecaller")
    assert stats["assigned_total"] == 0
    assert stats["emp_new_leads"] == 80


def test_workflow_pills_use_actioned_leads_only():
    leads = [
        _lead("untouched", 30),
        _lead("ringing1", 40, call_status="ringing"),
        _lead("negative1", 50, status="negative"),
        _lead("ringing_fresh", 1, call_status="ringing"),
    ]
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    assert stats["emp_ringing"] == 2
    assert stats["emp_not_interested"] == 1
    assert stats["assigned_total"] == 3
    assert stats["emp_new_leads"] == 1


def test_status_boxes_do_not_double_count_ringing_plus_follow_up():
    """Ringing + Follow Up + Not Interested must never exceed Total Leads."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    leads = [
        _lead("r1", 10, call_status="ringing"),
        _lead("r2", 10, call_status="ringing", follow_up_at=f"{today}T11:00:00+00:00"),
        _lead("r3", 10, call_status="ringing", follow_up_at=f"{today}T12:00:00+00:00"),
        _lead("fu1", 10, follow_up_at=f"{today}T09:00:00+00:00"),
        _lead("fu2", 10, follow_up_at=f"{today}T10:00:00+00:00"),
        _lead("neg1", 10, status="negative"),
        _lead("neg2", 10, status="negative"),
        _lead("neg3", 10, status="negative"),
    ]
    # Simulate Dhwani-style mix: 3 ringing (2 also have FU), 2 pure FU, 3 NI = 8 total worked
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    assert stats["assigned_total"] == 8
    assert stats["emp_ringing"] == 3
    assert stats["emp_follow_ups"] == 2  # exclusive — not the 2 overlapping ringing+FU
    assert stats["emp_not_interested"] == 3
    assert stats["emp_ringing"] + stats["emp_follow_ups"] + stats["emp_not_interested"] == 8
    assert stats["emp_ringing"] + stats["emp_follow_ups"] + stats["emp_not_interested"] <= stats["assigned_total"]


def test_dashboard_follow_up_bucket_excludes_ringing_overlap():
    today = "2026-07-14"
    rows = [
        {"lead_id": "r1", "status": "active", "stage": "assigned", "call_status": "ringing",
         "follow_up_at": f"{today}T11:00:00+00:00"},
        {"lead_id": "fu1", "status": "active", "stage": "assigned",
         "follow_up_at": f"{today}T09:00:00+00:00"},
        {"lead_id": "hot1", "status": "active", "stage": "positive", "priority": "hot",
         "follow_up_at": f"{today}T10:00:00+00:00"},
        {"lead_id": "neg1", "status": "negative", "stage": "assigned",
         "follow_up_at": f"{today}T08:00:00+00:00"},
    ]
    follow = main.filter_lead_bucket(rows, "follow_up", today)
    ringing = main.filter_lead_bucket(rows, "ringing", today)
    assert {l["lead_id"] for l in follow} == {"fu1"}
    assert {l["lead_id"] for l in ringing} == {"r1"}
    # No lead is in both rings
    assert {l["lead_id"] for l in follow}.isdisjoint({l["lead_id"] for l in ringing})


def test_workspace_follow_up_list_matches_exclusive_kpi():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    leads = [
        _lead("r_fu", 10, call_status="ringing", follow_up_at=f"{today}T11:00:00+00:00"),
        _lead("pure_fu", 10, follow_up_at=f"{today}T09:00:00+00:00"),
    ]
    list_rows = main.filter_employee_follow_up_leads(leads)
    kpi_rows = main.filter_employee_metric_leads(leads, "follow_ups")
    assert {l["lead_id"] for l in list_rows} == {"pure_fu"}
    assert {l["lead_id"] for l in list_rows} == {l["lead_id"] for l in kpi_rows}


def test_hot_beats_stale_ringing_in_classifier():
    lead = _lead("hot_ring", 10, call_status="ringing", priority="hot", stage="positive")
    assert main.classify_employee_performance_metric(lead) == "hot"


def test_ringing_action_clears_follow_up_at():
    patch = main.inquiry_preset_to_patch({"status": "active", "call_status": "ringing"}, "ringing")
    assert patch.get("call_status") == "ringing"
    assert patch.get("follow_up_at") is None
    cleared = main.apply_call_status_workflow(
        {"lead_id": "x", "stage": "assigned", "follow_up_at": "2026-07-14T10:00:00+00:00"},
        "ringing",
    )
    assert cleared.get("follow_up_at") is None
