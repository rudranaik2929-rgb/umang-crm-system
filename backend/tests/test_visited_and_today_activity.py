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


def _today_times(**kwargs):
    """Timestamps inside the current IST calendar day (Today Activity uses calendar day, not 24h)."""
    cutoff = main.today_activity_cutoff_utc()
    now = datetime.now(timezone.utc)
    elapsed_min = max((now - cutoff).total_seconds() / 60.0, 1.0)
    for key, minutes_ago in kwargs.items():
        minutes = min(minutes_ago, max(elapsed_min - 1.0, 0.0))
        yield key, (now - timedelta(minutes=minutes)).isoformat()


def test_visited_only_when_mark_visited_site_visit_stage():
    leads = [
        _lead("positive_only", 30, stage="positive"),
        _lead("hot_only", 30, priority="hot"),
        _lead("marked_visited", 30, stage="site_visit"),
    ]
    visited = main.filter_employee_metric_leads(leads, "visited")
    assert {l["lead_id"] for l in visited} == {"marked_visited"}


def test_today_activity_groups_work_by_lead():
    ts = dict(_today_times(a1=0, a2=60, a3=120))
    leads = [_lead("l1", 10), _lead("l2", 10)]
    activities = [
        {
            "activity_id": "a1",
            "lead_id": "l1",
            "type": "call_status_update",
            "text": "[Emp] Call status → ringing",
            "created_at": ts["a1"],
        },
        {
            "activity_id": "a2",
            "lead_id": "l1",
            "type": "call_note",
            "text": "[Emp] Customer asked for callback",
            "created_at": ts["a2"],
        },
        {
            "activity_id": "a3",
            "lead_id": "l2",
            "type": "stage_change_site_visit",
            "text": "[Emp] Moved lead stage from assigned to site_visit",
            "created_at": ts["a3"],
        },
    ]
    report = main.build_today_activity_report(activities, leads)
    assert len(report) == 2
    by_id = {r["lead_id"]: r for r in report}
    assert by_id["l1"]["action_count"] == 2
    assert by_id["l2"]["action_count"] == 1


def test_today_activity_ignores_yesterday_work():
    """Yesterday's activity (before IST midnight) must NOT appear in Today Activity."""
    cutoff = main.today_activity_cutoff_utc()
    leads = [_lead("l1", 10)]
    activities = [
        {
            "activity_id": "old1",
            "lead_id": "l1",
            "type": "call_note",
            "text": "[Emp] Worked yesterday",
            "created_at": (cutoff - timedelta(hours=1)).isoformat(),
        },
    ]
    report = main.build_today_activity_report(activities, leads)
    assert report == []
