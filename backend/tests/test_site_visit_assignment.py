"""Tests for Assign Site Visitor + Site Visit Assigned performance metric."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(lead_id: str, **extra):
    assigned_at = datetime.now(timezone.utc) - timedelta(hours=10)
    row = {
        "lead_id": lead_id,
        "assigned_to": "tele1",
        "status": "active",
        "stage": "assigned",
        "assigned_at": assigned_at.isoformat(),
        "call_status": "ringing",
    }
    row.update(extra)
    return row


def test_site_visit_assigned_visible_to_assigner_and_assignee():
    leads = [
        _lead(
            "shared1",
            site_visitor_id="sales1",
            site_visit_assigned_by="tele1",
            site_visit_assigned_at=datetime.now(timezone.utc).isoformat(),
        ),
        _lead("other", assigned_to="tele2", call_status="ringing"),
        _lead(
            "shared2",
            assigned_to="tele2",
            site_visitor_id="sales1",
            site_visit_assigned_by="tele2",
            site_visit_assigned_at=datetime.now(timezone.utc).isoformat(),
        ),
    ]
    tele = {"employee_id": "tele1", "name": "Tele One", "user_id": "u-tele1"}
    sales = {"employee_id": "sales1", "name": "Sales One", "user_id": "u-sales1"}

    tele_rows = main.filter_site_visit_assigned_leads(leads, tele)
    sales_rows = main.filter_site_visit_assigned_leads(leads, sales)

    assert {l["lead_id"] for l in tele_rows} == {"shared1"}
    assert {l["lead_id"] for l in sales_rows} == {"shared1", "shared2"}


def test_site_visit_assigned_does_not_disturb_exclusive_buckets():
    leads = [
        _lead(
            "ringing_shared",
            site_visitor_id="sales1",
            site_visit_assigned_by="tele1",
            site_visit_assigned_at=datetime.now(timezone.utc).isoformat(),
            call_status="ringing",
        ),
        _lead("hot1", priority="hot", stage="positive", call_status=None),
    ]
    stats = main.compute_employee_assignment_stats(leads, "telecaller")
    # Exclusive boxes unchanged — Site Visit Assigned is additive, not in workflow sum.
    assert stats["emp_ringing"] == 1
    assert stats["emp_hot"] == 1
    assert stats["assigned_total"] == 2
    assert "emp_site_visit_assigned" not in stats  # computed separately from all_leads

    tele = {"employee_id": "tele1", "name": "Tele"}
    assert main.compute_site_visit_assigned_count(leads, tele) == 1
    sales = {"employee_id": "sales1", "name": "Sales"}
    assert main.compute_site_visit_assigned_count(leads, sales) == 1


def test_personal_dashboard_site_visit_metric_matches_list():
    leads = [
        _lead(
            "sva1",
            site_visitor_id="sales1",
            site_visit_assigned_by="tele1",
            site_visit_assigned_at=datetime.now(timezone.utc).isoformat(),
        ),
        _lead("plain", call_status="ringing"),
    ]
    tele = {"employee_id": "tele1", "name": "Tele", "user_id": "u1"}
    counts = main.build_personal_dashboard_counts(
        leads, "telecaller", [], employee=tele, all_leads=leads,
    )
    items = main.personal_dashboard_metric_items(
        "site_visit_assigned", leads, "telecaller", [], employee=tele, all_leads=leads,
    )
    assert counts["site_visit_assigned"] == 1
    assert len(items) == 1
    assert items[0]["lead_id"] == "sva1"
    # Exclusive ringing still counts the same lead when it is also site-visit assigned
    assert counts["ringing"] == 2


def test_lead_is_site_visit_party_matches_ids():
    lead = _lead(
        "x",
        site_visitor_id="sales1",
        site_visit_assigned_by="tele1",
    )
    assert main.lead_is_site_visit_party(lead, {"employee_id": "sales1"})
    assert main.lead_is_site_visit_party(lead, {"employee_id": "tele1"})
    assert not main.lead_is_site_visit_party(lead, {"employee_id": "other"})
