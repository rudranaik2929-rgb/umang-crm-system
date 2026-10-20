import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(lead_id: str, hours_ago: float = 10, **extra):
    assigned_at = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    row = {
        "lead_id": lead_id,
        "assigned_to": "emp1",
        "status": "active",
        "stage": "assigned",
        "assigned_at": assigned_at.isoformat(),
    }
    row.update(extra)
    return row


def test_performance_pill_keys_are_valid_drilldown_metrics():
    """Every Employee Performance pill must open a popup — a missing key here
    returned HTTP 400 and made the Cold box show a count but an EMPTY list."""
    pills = [
        "new_leads", "total", "missed_leads", "hot", "cold", "site_visit_assigned",
        "visited", "not_interested", "booking_done", "low_budget", "follow_ups",
        "today_follow_ups", "ringing", "today_activity",
    ]
    for key in pills:
        assert key in main.EMPLOYEE_METRIC_KEYS, f"pill {key!r} missing from EMPLOYEE_METRIC_KEYS"


def test_emp_missed_leads_box_count_matches_popup():
    """Missed Lead box used to always show 0 (counted over actioned leads only)
    while the popup listed real missed leads."""
    leads = [
        _lead("missed1", 30),
        _lead("missed2", 48),
        _lead("fresh", 2),
        _lead("ringing", 10, call_status="ringing"),
        _lead("neg", 10, status="negative"),
    ]
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    popup = main.employee_metric_items("missed_leads", leads)
    assert {l["lead_id"] for l in popup} == {"missed1", "missed2"}
    assert stats["emp_missed_leads"] == len(popup) == 2
    # Missed stays outside the exclusive status-box sum (it is part of New Leads);
    # those pills cover actioned leads, which is exactly assigned_updated.
    assert main.sum_employee_status_buckets(stats) == stats["assigned_updated"]
    assert stats["assigned_updated"] == 2  # ringing + neg
    assert stats["emp_new_leads"] == 3  # missed1 + missed2 + fresh all untouched
    # Nothing is lost: New + Updated is the full Total.
    assert stats["assigned_total"] == 5
    assert stats["emp_new_leads"] + stats["assigned_updated"] == stats["assigned_total"]


def test_workflow_box_counts_match_drill_down_lists():
    """Every box count must equal the number of rows its popup opens."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    leads = [
        _lead("missed", 30),
        _lead("untouched", 2),
        _lead("ringing", 10, call_status="ringing"),
        _lead("fu", 10, follow_up_at=f"{today}T09:00:00+00:00"),
        _lead("today_fu", 10, follow_up_at=f"{today}T11:00:00+00:00"),
        _lead("hot", 10, stage="positive", priority="hot"),
        _lead("cold", 10, stage="positive", priority="cold"),
        _lead("visited", 10, stage="site_visit"),
        _lead("booking", 10, stage="booking"),
        _lead("closed", 10, stage="closed"),
        _lead("neg", 10, status="negative"),
        _lead("low", 10, status="negative", priority="low_budget"),
    ]
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    box_keys = {
        "hot": "emp_hot",
        "cold": "emp_cold",
        "visited": "emp_visited",
        "not_interested": "emp_not_interested",
        "booking_done": "emp_booking_done",
        "low_budget": "emp_low_budget",
        "ringing": "emp_ringing",
        "follow_ups": "emp_follow_ups",
        "today_follow_ups": "emp_today_follow_ups",
        "missed_leads": "emp_missed_leads",
        "new_leads": "emp_new_leads",
        "total": "assigned_total",
    }
    for metric_key, stat_key in box_keys.items():
        items = main.employee_metric_items(metric_key, leads, role="telecaller")
        assert stats[stat_key] == len(items), (
            f"box {metric_key}: count {stats[stat_key]} does not match popup list {len(items)}"
        )
    # The Updated box must also have a matching drill-down list.
    assert stats["assigned_updated"] == len(
        main.employee_metric_items("updated", leads, role="telecaller")
    )
    assert stats["emp_new_leads"] + stats["assigned_updated"] == stats["assigned_total"]


def test_site_visit_assigned_box_count_matches_popup():
    emp = {"employee_id": "emp1", "role": "telecaller"}
    emp_leads = [_lead("mine", 10)]
    assigned_lead = _lead("sv", 10, site_visit_assigned_by="emp1")
    all_leads = emp_leads + [assigned_lead, _lead("other", 10, assigned_to="emp2")]
    count = main.compute_site_visit_assigned_count(all_leads, emp)
    popup = main.employee_metric_items(
        "site_visit_assigned", emp_leads, all_leads=all_leads, employee=emp,
    )
    assert {l["lead_id"] for l in popup} == {"sv"}
    assert count == len(popup) == 1


def test_booking_new_bookings_box_matches_popup():
    bookings = [
        {"booking_id": "b1", "booking_officer_id": "emp1", "status": "active", "completed_tasks": []},
        {"booking_id": "b2", "booking_officer_id": "emp1", "status": "active", "completed_tasks": ["sanctioned"]},
        {"booking_id": "b3", "booking_officer_id": "emp1", "status": "confirmed", "completed_tasks": []},
    ]
    employee = {"employee_id": "emp1", "role": "booking"}
    stats = main.compute_booking_employee_stats(employee, bookings)
    popup = main.filter_new_bookings([b for b in bookings if b.get("booking_officer_id") == "emp1"])
    assert stats["emp_new_leads"] == len(popup) == 2


def test_booking_pipeline_boxes_are_exclusive_and_move_forward():
    """A file sits in the box of its furthest completed step. Completing the
    NEXT step moves it on (Login File −1, Sanctioned +1) instead of counting it
    in both boxes."""
    fresh = {"booking_id": "b1", "status": "active", "completed_tasks": []}
    logged_in = {"booking_id": "b2", "status": "login file", "completed_tasks": ["login_file"]}
    sanctioned = {
        "booking_id": "b3",
        "status": "sanctioned",
        "completed_tasks": ["login_file", "sanctioned"],
    }

    assert main.booking_current_stage_key(fresh) is None  # brand new — no box
    assert main.booking_current_stage_key(logged_in) == "login_file"
    assert main.booking_current_stage_key(sanctioned) == "sanctioned"

    counts = main.compute_booking_task_counts([fresh, logged_in, sanctioned])
    assert counts["login_file"] == 1
    assert counts["sanctioned"] == 1
    # Exclusive: every booking appears in at most one box.
    assert sum(counts.values()) == 2


def test_booking_bill_submitted_box_shows_submitted_files():
    """Regression: a file whose bill is submitted must show under Bill Submitted
    (it used to roll forward into Amt Received, leaving Bill Submitted at 0)."""
    by_key = {"booking_id": "b1", "status": "bill submitted", "completed_tasks": ["bill_submitted"]}
    by_status_only = {"booking_id": "b2", "status": "bill submitted", "completed_tasks": []}
    status_in_tasks = {"booking_id": "b3", "status": "active", "completed_tasks": ["bill submitted"]}
    for booking in (by_key, by_status_only, status_in_tasks):
        assert main.booking_current_stage_key(booking) == "bill_submitted"
    counts = main.compute_booking_task_counts([by_key, by_status_only, status_in_tasks])
    assert counts["bill_submitted"] == 3
    assert main.filter_bookings_by_task([by_key, by_status_only, status_in_tasks], "bill_submitted") != []


def test_booking_box_count_matches_filtered_list_and_ignores_cancelled():
    rows = [
        {"booking_id": "b1", "status": "active", "completed_tasks": []},
        {"booking_id": "b2", "status": "login file", "completed_tasks": ["login_file"]},
        {"booking_id": "b3", "status": "sanctioned", "completed_tasks": ["login_file", "sanctioned"]},
        {"booking_id": "b4", "status": "cancellation", "agreement_status": "cancelled", "completed_tasks": []},
    ]
    counts = main.compute_booking_task_counts(rows)
    listed = main.filter_bookings_by_task(rows, "sanctioned")
    assert counts["sanctioned"] == len(listed) == 1
    assert {b["booking_id"] for b in listed} == {"b3"}
    assert main.booking_current_stage_key(rows[3]) is None