"""Assign Leads "Unassigned" must count the SAME leads as Dashboard "Open Leads".

Regression: the Assign Leads box filtered to owner-less leads while the
Dashboard box counted every open pipeline lead, so the two screens could differ
by a lead (265 vs 266). Both now share one rule.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from app import main  # noqa: E402

EMP = [{"employee_id": "e1", "name": "Alok Tiwari", "role": "telecaller",
        "active": True, "user_id": "u1"}]


def _lead(lid, **extra):
    row = {"lead_id": lid, "status": "active", "stage": "new", "source": "manual",
           "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
           "phone": f"9{lid}"}
    row.update(extra)
    return row


def _book():
    leads = [_lead(f"U{i}") for i in range(20)]
    leads += [
        _lead("assigned_open", assigned_to="e1"),          # owned but untouched
        _lead("legacy_name", assigned_to="ghost"),          # unknown owner
        _lead("booking", stage="booking"),
        _lead("registration", stage="registration"),
        _lead("loan", stage="loan"),
        _lead("handoff", priority="booking_handoff"),
        _lead("negative", status="negative"),
        _lead("hot", stage="positive", priority="hot"),
        _lead("closed", stage="closed"),
        _lead("broker", stage="broker"),
    ]
    return leads


def test_box_equals_dashboard_open_leads():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    facets = main.compute_assign_workspace_facets(leads, EMP)
    assert facets["inquiry_status"]["unassigned"] == buckets["open_leads"]


def test_box_equals_its_own_drilldown_list():
    leads = _book()
    facets = main.compute_assign_workspace_facets(leads, EMP)
    listed = main.filter_assign_workspace_leads(
        leads, "all", "all", "unassigned", "", "", EMP)
    assert facets["inquiry_status"]["unassigned"] == len(listed)


def test_box_and_dashboard_are_the_same_lead_ids():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    listed = main.filter_assign_workspace_leads(
        leads, "all", "all", "unassigned", "", "", EMP)
    list_ids = {l["lead_id"] for l in listed}
    dashboard_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "open_leads", today)}
    assert list_ids == dashboard_ids


def test_owned_but_untouched_lead_counts_in_both():
    """The exact off-by-one case: assigned to an employee, still stage new."""
    leads = _book()
    rows = main.filter_assign_workspace_leads(
        leads, "all", "all", "unassigned", "", "", EMP)
    assert "assigned_open" in {l["lead_id"] for l in rows}


def test_worked_leads_never_count_as_open():
    leads = _book()
    rows = main.filter_assign_workspace_leads(
        leads, "all", "all", "unassigned", "", "", EMP)
    ids = {l["lead_id"] for l in rows}
    for worked in ("booking", "registration", "loan", "negative", "hot", "closed"):
        assert worked not in ids


def test_box_is_never_larger_than_total_leads():
    leads = _book()
    today = datetime.now(timezone.utc).date().isoformat()
    buckets = main.compute_lead_bucket_counts(leads, today)
    assert buckets["open_leads"] <= buckets["all"]
    total_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "all", today)}
    open_ids = {l["lead_id"] for l in main.filter_lead_bucket(leads, "open_leads", today)}
    assert open_ids <= total_ids


def test_stats_assignment_matches_box_and_dashboard():
    """/stats/assignment unassigned_count (AssignLeadsPanel) agrees with both."""
    leads = _book()
    expected = sum(1 for l in main.pipeline_lead_universe(leads) if main.assign_unassigned_lead(l))
    today = datetime.now(timezone.utc).date().isoformat()
    assert expected == main.compute_lead_bucket_counts(leads, today)["open_leads"]
    assert expected == main.compute_assign_workspace_facets(leads, EMP)["inquiry_status"]["unassigned"]


def test_ownerless_diagnostic_is_still_available():
    """The old owner-less number stays exposed for anyone who needs it."""
    leads = _book()
    facets = main.compute_assign_workspace_facets(leads, EMP)
    ownerless = facets["inquiry_status"]["unassigned_ownerless"]
    # Same universe the facet walks: deduped (by external id) pipeline leads.
    pipeline = [l for l in main.dedupe_leads_by_external_id(leads) if main.is_pipeline_lead(l)]
    assert ownerless == len([l for l in pipeline if main.is_lead_unassigned(l, EMP)])
    # It is a genuinely different question: owner-less leads include ones already
    # worked into negative/hot/closed, which are not open leads at all.
    assert ownerless != facets["inquiry_status"]["unassigned"]
