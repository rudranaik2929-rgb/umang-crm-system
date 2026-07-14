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


def test_personal_dashboard_counts_match_drill_down_lists():
    leads = [
        _lead("untouched", 30),
        _lead("ringing", 40, call_status="ringing"),
        _lead("negative", 50, status="negative", priority="low_budget"),
        _lead("visited", 60, stage="site_visit"),
        _lead("hot", 58, stage="positive", priority="hot"),
        _lead("fresh", 2),
    ]
    activities = []
    counts = main.build_personal_dashboard_counts(leads, "telecaller", activities)
    for metric, count in counts.items():
        items = main.personal_dashboard_metric_items(metric, leads, "telecaller", activities)
        assert len(items) == count, f"{metric}: count {count} != list {len(items)}"


def test_total_only_includes_actioned_leads():
    leads = [_lead(f"untouched{i}", 30 + i) for i in range(24)]
    leads += [_lead("ringing1", 5, call_status="ringing")]
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    assert counts["total"] == 1
    assert counts["new_leads"] == 24
    assert len(main.personal_dashboard_metric_items("total", leads, "telecaller", [])) == 1


def test_today_follow_ups_only_includes_due_today():
    today = main.app_today()
    tomorrow = today + timedelta(days=1)
    yesterday = today - timedelta(days=1)
    leads = [
        _lead("due-today", 10, follow_up_at=f"{today.isoformat()}T11:30:00+00:00"),
        _lead("due-tomorrow", 10, follow_up_at=f"{tomorrow.isoformat()}T09:00:00+00:00"),
        _lead("due-yesterday", 10, follow_up_at=f"{yesterday.isoformat()}T15:00:00+00:00"),
        _lead("negative-today", 10, status="negative", follow_up_at=f"{today.isoformat()}T12:00:00+00:00"),
        _lead("ringing-today", 10, call_status="ringing", follow_up_at=f"{today.isoformat()}T13:00:00+00:00"),
    ]
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    assert counts["today_follow_ups"] == 1
    items = main.personal_dashboard_metric_items("today_follow_ups", leads, "telecaller", [])
    assert len(items) == 1
    assert items[0]["lead_id"] == "due-today"
    assert counts["follow_ups"] == 3  # exclusive — ringing-today counted as ringing, not FU
    assert counts["ringing"] == 1
