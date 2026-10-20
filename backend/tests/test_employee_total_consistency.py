"""Lead totals must never shrink between screens.

Regression guard for the reported bug: Assign Leads filtered to one employee
showed 327 leads while the Dashboard employee card showed 314, because the card
counted only leads the employee had already worked on. Total Leads is now every
assigned lead on both screens, and New + Updated always adds up to Total.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(lead_id: str, hours_ago: float = 10, assigned_to: str = "emp1", **extra):
    assigned_at = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    row = {
        "lead_id": lead_id,
        "assigned_to": assigned_to,
        "status": "active",
        "stage": "assigned",
        "assigned_at": assigned_at.isoformat(),
    }
    row.update(extra)
    return row


def _mixed_book(untouched: int = 13, worked: int = 314):
    """Mirrors the live shape: a bulk of worked leads plus untouched imports."""
    leads = [_lead(f"old{i}", 30 + (i % 5)) for i in range(untouched)]
    for i in range(worked):
        if i % 5 == 0:
            leads.append(_lead(f"ring{i}", 12, call_status="ringing"))
        elif i % 5 == 1:
            leads.append(_lead(f"hot{i}", 12, stage="positive", priority="hot"))
        elif i % 5 == 2:
            leads.append(_lead(f"vis{i}", 12, stage="site_visit"))
        elif i % 5 == 3:
            leads.append(_lead(f"fu{i}", 12, follow_up_at="2026-07-14T09:00:00+00:00"))
        else:
            leads.append(_lead(f"neg{i}", 12, status="negative"))
    return leads


def test_total_leads_counts_untouched_leads_not_just_actioned():
    leads = _mixed_book(untouched=13, worked=314)
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    assert stats["assigned_total"] == 327
    assert stats["assigned_updated"] == 314
    assert stats["emp_new_leads"] == 13
    # The old bug: 327 vs 314. New + Updated must always reconstruct the total.
    assert stats["emp_new_leads"] + stats["assigned_updated"] == stats["assigned_total"]


def test_assign_workspace_count_equals_dashboard_total():
    """Assign Leads filtered to an employee and the Dashboard card agree."""
    leads = _mixed_book(untouched=13, worked=314)
    employees = [{"employee_id": "emp1", "name": "Emp One", "role": "telecaller", "active": True}]

    workspace = main.filter_assign_workspace_leads(
        leads, "all", "all", "emp1", "", "", employees
    )
    stats = main.compute_employee_assignment_stats(
        main.leads_for_employee_record(employees[0], leads), "telecaller"
    )
    assert len(workspace) == stats["assigned_total"] == 327


def test_every_total_box_has_a_matching_drill_down_list():
    leads = _mixed_book(untouched=13, worked=314)
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    pairs = [
        ("total", "assigned_total"),
        ("new_leads", "emp_new_leads"),
        ("updated", "assigned_updated"),
        ("hot", "emp_hot"),
        ("visited", "emp_visited"),
        ("ringing", "emp_ringing"),
        ("not_interested", "emp_not_interested"),
    ]
    for metric_key, stat_key in pairs:
        items = main.employee_metric_items(metric_key, leads, role="telecaller")
        assert stats[stat_key] == len(items), f"{metric_key}: {stats[stat_key]} != {len(items)}"


def test_personal_dashboard_total_matches_employee_card():
    """My Dashboard and the admin employee card report the same total."""
    leads = _mixed_book(untouched=13, worked=314)
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    assert counts["total"] == stats["assigned_total"]
    assert counts["new_leads"] == stats["emp_new_leads"]


def test_broker_leads_are_excluded_the_same_way_everywhere():
    """A broker-pool lead must be skipped by every screen, not just some."""
    leads = _mixed_book(untouched=1, worked=1)
    leads.append(_lead("broker1", 12, stage="broker"))
    leads.append(_lead("broker2", 12, lead_type="brokerage"))
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    assigned = main.filter_employee_all_assigned_leads(leads)
    assert stats["assigned_total"] == 2
    assert len(assigned) == 2
    assert all(l["lead_id"] not in {"broker1", "broker2"} for l in assigned)
    # The workspace applies the same exclusion (filter_assign_workspace_leads
    # drops broker rows via is_pipeline_lead), so the two screens agree.
    employees = [{"employee_id": "emp1", "name": "Emp One", "role": "telecaller", "active": True}]
    workspace = main.filter_assign_workspace_leads(leads, "all", "all", "emp1", "", "", employees)
    assert len(workspace) == stats["assigned_total"]
