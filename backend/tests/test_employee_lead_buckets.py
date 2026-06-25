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


def test_new_and_backlog_leads_are_mutually_exclusive():
    leads = [
        _lead("old1", 30),
        _lead("old2", 48, call_status="ringing"),
        _lead("new1", 2),
        _lead("new2", 0.5),
    ]
    new_rows = main.filter_employee_new_leads(leads)
    backlog_rows = main.filter_employee_backlog_leads(leads)
    assert {l["lead_id"] for l in new_rows} == {"new1", "new2"}
    assert {l["lead_id"] for l in backlog_rows} == {"old1", "old2"}
    assert len(new_rows) + len(backlog_rows) == 4


def test_bulk_assign_does_not_inflate_backlog_total():
    """When 56 new leads arrive, backlog total must stay at prior count."""
    backlog = [_lead(f"old{i}", 30 + i) for i in range(24)]
    fresh = [_lead(f"new{i}", 0.1) for i in range(56)]
    stats_before = main.compute_employee_assignment_stats(backlog, "telecaller")
    stats_after = main.compute_employee_assignment_stats(backlog + fresh, "telecaller")
    assert stats_before["assigned_total"] == 24
    assert stats_after["assigned_total"] == 24
    assert stats_after["emp_new_leads"] == 56


def test_workflow_pills_use_backlog_only():
    backlog = [
        _lead("old1", 30),
        _lead("old2", 40, call_status="ringing"),
        _lead("old3", 50, status="negative"),
    ]
    fresh = [_lead("new1", 1, call_status="ringing")]
    stats = main.compute_employee_assignment_stats(backlog + fresh, "telecaller")
    assert stats["emp_ringing"] == 1
    assert stats["emp_not_interested"] == 1
    assert stats["assigned_total"] == 3
