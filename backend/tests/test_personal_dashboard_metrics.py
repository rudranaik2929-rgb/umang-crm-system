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
        _lead("old1", 30),
        _lead("old2", 40, call_status="ringing"),
        _lead("old3", 50, status="negative", priority="low_budget"),
        _lead("old4", 60, stage="positive", priority="hot"),
        _lead("new1", 2),
    ]
    activities = []
    counts = main.build_personal_dashboard_counts(leads, "telecaller", activities)
    for metric, count in counts.items():
        items = main.personal_dashboard_metric_items(metric, leads, "telecaller", activities)
        assert len(items) == count, f"{metric}: count {count} != list {len(items)}"


def test_total_excludes_new_leads_within_24h():
    leads = [_lead(f"old{i}", 30 + i) for i in range(24)]
    leads += [_lead(f"new{i}", 0.2) for i in range(11)]
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    assert counts["total"] == 24
    assert counts["new_leads"] == 11
    assert len(main.personal_dashboard_metric_items("total", leads, "telecaller", [])) == 24
