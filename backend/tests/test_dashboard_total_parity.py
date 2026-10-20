"""Dashboard "Total Leads" and Assign Leads must always report one number.

Regression: the Dashboard used to exclude the Booking department from its total
while Assign Leads included it, so the two pages showed different figures
(6090 vs 6057). Both now count `pipeline_lead_universe`, and the Lead Overview
+ Booking Overview slices add up to that total exactly.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from app import main  # noqa: E402

EMPLOYEES = [{"employee_id": "e1", "name": "Admin", "role": "admin", "active": True}]


def _lead(lid, **extra):
    row = {
        "lead_id": lid,
        "status": "active",
        "stage": "new",
        "source": "manual",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
        "phone": f"9{lid}",
    }
    row.update(extra)
    return row


def _book():
    leads = [_lead(f"N{i}") for i in range(40)]
    leads += [_lead(f"B{i}", stage="booking") for i in range(6)]
    leads += [_lead(f"R{i}", stage="registration") for i in range(4)]
    leads += [_lead(f"L{i}", stage="loan") for i in range(2)]
    # Excluded from BOTH screens: broker pool + a true sync duplicate.
    leads += [_lead("BR1", stage="broker"), _lead("BR2", lead_type="brokerage")]
    leads += [_lead("DUP1", external_lead_id="SAME"), _lead("DUP2", external_lead_id="SAME")]
    return leads


def test_dashboard_total_equals_assign_leads_total():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    assign_total = len(main.filter_assign_workspace_leads(leads, "all", "all", "all", "", "", EMPLOYEES))
    assert buckets["all"] == assign_total


def test_total_leads_is_shared_universe():
    leads = _book()
    assert len(main.pipeline_lead_universe(leads)) == main.compute_lead_bucket_counts(
        leads, datetime.now(timezone.utc).date().isoformat()
    )["all"]


def test_booking_leads_are_inside_total():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    total_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "all", today)}
    booking_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "booking", today)}
    reg_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "registration", today)}
    assert booking_ids and reg_ids
    assert (booking_ids | reg_ids) <= total_ids
    assert buckets["booking_partition_sum"] == len(booking_ids) + len(reg_ids)


def test_overview_plus_booking_equals_total():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    assert buckets["partition_sum"] + buckets["booking_partition_sum"] == buckets["all"]


def test_every_box_count_matches_its_drilldown():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    for key in main.LEAD_BUCKET_KEYS:
        assert buckets[key] == len(main.filter_lead_bucket(leads, key, today)), key


def test_assign_workspace_narrowing_filters_never_add_leads():
    """Filters may only remove rows — the same universe is the ceiling."""
    leads = _book()
    universe = len(main.filter_assign_workspace_leads(leads, "all", "all", "all", "", "", EMPLOYEES))
    for status in ("new", "positive", "registration", "booking"):
        narrowed = main.filter_assign_workspace_leads(leads, status, "all", "all", "", "", EMPLOYEES)
        assert len(narrowed) <= universe
    for src in ("manual", "housing", "meta", "brokerage"):
        narrowed = main.filter_assign_workspace_leads(leads, "all", src, "all", "", "", EMPLOYEES)
        assert len(narrowed) <= universe
