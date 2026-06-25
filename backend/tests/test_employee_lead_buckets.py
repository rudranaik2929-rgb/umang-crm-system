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
