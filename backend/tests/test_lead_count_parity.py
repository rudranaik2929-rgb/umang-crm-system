"""The 6084-vs-6051 bug: shared phone/email rows were silently dropped.

Reproduces the reported numbers exactly, then proves every screen now agrees.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _assigned(lead_id, phone, email="", **extra):
    assigned_at = datetime.now(timezone.utc) - timedelta(hours=10)
    row = {
        "lead_id": lead_id,
        "assigned_to": "emp1",
        "status": "active",
        "stage": "assigned",
        "assigned_at": assigned_at.isoformat(),
        "phone": phone,
        "email": email,
    }
    row.update(extra)
    return row


def _book(unique=6051, shared=33):
    """6051 leads with their own phone + 33 extra rows sharing a phone/email.

    These 33 are exactly the shape that used to vanish: a walk-in re-entry, a
    manual add of someone already imported, or a lead with no external id.
    """
    leads = [
        _assigned(f"L{i}", f"9{100000000 + i:09d}", external_lead_id=f"ext{i}")
        for i in range(unique)
    ]
    for i in range(shared):
        # No external id, and re-uses an earlier lead's phone number.
        leads.append(_assigned(f"D{i}", f"9{100000000 + i:09d}"))
    return leads


def test_shared_phone_leads_are_all_counted():
    leads = _book()
    assert len(leads) == 6084
    assigned = main.filter_employee_all_assigned_leads(leads)
    assert len(assigned) == 6084, "every lead row must be counted"


def test_assign_leads_and_dashboard_total_agree():
    """Assign Leads (6084) and the employee/dashboard cards must match."""
    leads = _book()
    employees = [{"employee_id": "emp1", "name": "Alok Tiwari", "role": "telecaller", "active": True}]

    workspace = main.filter_assign_workspace_leads(
        leads, "all", "all", "emp1", "", "", employees
    )
    stats = main.compute_employee_assignment_stats(
        main.leads_for_employee_record(employees[0], leads), "telecaller"
    )
    assert len(workspace) == stats["assigned_total"] == 6084


def test_all_employee_boxes_agree_with_their_drill_downs():
    leads = _book(unique=40, shared=10)
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    assert stats["emp_new_leads"] + stats["assigned_updated"] == stats["assigned_total"]
    for metric_key, stat_key in [
        ("total", "assigned_total"),
        ("new_leads", "emp_new_leads"),
        ("updated", "assigned_updated"),
    ]:
        items = main.employee_metric_items(metric_key, leads, role="telecaller")
        assert stats[stat_key] == len(items), f"{metric_key}: {stats[stat_key]} != {len(items)}"


def test_my_dashboard_total_matches_employee_card():
    leads = _book(unique=40, shared=10)
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    assert counts["total"] == stats["assigned_total"]


def test_personal_drill_down_lists_match_their_counts():
    """My Dashboard boxes must list exactly as many rows as they report."""
    leads = _book(unique=40, shared=10)
    counts = main.build_personal_dashboard_counts(leads, "telecaller", [])
    for key in ("total", "new_leads", "updated"):
        items = main.personal_dashboard_metric_items(key, leads, "telecaller", [])
        assert counts[key] == len(items), f"{key}: count {counts[key]} != list {len(items)}"


def test_only_true_sync_duplicates_are_collapsed():
    """Two rows with the same external_lead_id are ONE lead; the rest are not."""
    leads = _book(unique=5, shared=3)
    leads.append(_assigned("sync_dup", "9555000000", external_lead_id="ext0"))
    counted = main.filter_employee_all_assigned_leads(leads)
    ids = {l["lead_id"] for l in counted}
    assert len(counted) == 8  # 5 unique + 3 shared-phone rows
    assert "sync_dup" not in ids  # same external id as L0 -> collapsed
    assert "L0" in ids
