"""Clicking an Assign Leads box must return exactly the leads that box counted.

Regression: with an employee selected, the "Unassigned" box showed a number but
clicking it (inquiry_status=unassigned) returned an EMPTY list, because that
filter used the old ownerless-only rule while the box used the shared
open-leads rule. Every box must agree with its own drill-down, for the company
view and for any selected employee.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from app import main  # noqa: E402

EMP = [
    {"employee_id": "e1", "name": "Alok Tiwari", "role": "telecaller", "active": True, "user_id": "u1"},
    {"employee_id": "e2", "name": "Khyati Shah", "role": "telecaller", "active": True, "user_id": "u2"},
]

# Every inquiry-status key the UI can select.
KEYS = [
    "unassigned", "open_leads", "new", "active", "hot", "cold", "visited",
    "not_interested", "low_budget", "ringing", "follow_up", "missed_leads", "booked",
]


def _lead(lid, **extra):
    row = {"lead_id": lid, "status": "active", "stage": "new", "source": "manual",
           "created_at": "2026-07-01T00:00:00+00:00", "phone": f"9{lid}"}
    row.update(extra)
    return row


def _book():
    return [
        _lead("a1", assigned_to="e1"),
        _lead("a2", assigned_to="e1", stage="assigned"),
        _lead("a3", assigned_to="e1", stage="positive", priority="hot"),
        _lead("a4", assigned_to="e1", stage="positive", priority="cold"),
        _lead("a5", assigned_to="e1", stage="site_visit"),
        _lead("a6", assigned_to="e1", stage="booking"),
        _lead("a7", assigned_to="e1", stage="registration"),
        _lead("a8", assigned_to="e1", status="negative"),
        _lead("a9", assigned_to="e1", call_status="ringing"),
        _lead("a10", assigned_to="e1", follow_up_at="2099-01-01T09:00:00+00:00"),
        _lead("a11", assigned_to="e1", status="negative", priority="low_budget"),
        _lead("k1", assigned_to="e2"),
        _lead("k2", assigned_to="e2", stage="positive", priority="hot"),
        _lead("f1"),
        _lead("f2", stage="assigned"),
    ]


def _assert_all_boxes_match_lists(scope):
    leads = _book()
    facets = main.compute_assign_workspace_facets(leads, EMP, scope)
    for key in KEYS:
        box = facets["inquiry_status"].get(key, 0)
        listed = main.filter_assign_workspace_leads(leads, key, "all", scope, "", "", EMP)
        assert box == len(listed), f"scope={scope} key={key}: box={box} list={len(listed)}"


def test_company_view_boxes_match_their_lists():
    _assert_all_boxes_match_lists("all")


def test_each_employee_boxes_match_their_lists():
    _assert_all_boxes_match_lists("e1")
    _assert_all_boxes_match_lists("e2")


def test_unassigned_box_is_never_empty_while_it_shows_a_number():
    """The exact regression, for an employee who owns open leads."""
    leads = _book()
    facets = main.compute_assign_workspace_facets(leads, EMP, "e1")
    box = facets["inquiry_status"]["unassigned"]
    listed = main.filter_assign_workspace_leads(leads, "unassigned", "all", "e1", "", "", EMP)
    assert box > 0
    assert len(listed) == box


def test_open_leads_and_unassigned_return_the_same_leads():
    leads = _book()
    for scope in ("all", "e1", "e2"):
        a = main.filter_assign_workspace_leads(leads, "unassigned", "all", scope, "", "", EMP)
        b = main.filter_assign_workspace_leads(leads, "open_leads", "all", scope, "", "", EMP)
        assert {l["lead_id"] for l in a} == {l["lead_id"] for l in b}, scope


def test_ownerless_definition_is_not_used_for_the_unassigned_box():
    """A lead owned by the selected employee still counts as the Unassigned box."""
    leads = _book()
    listed = main.filter_assign_workspace_leads(leads, "unassigned", "all", "e1", "", "", EMP)
    ids = {l["lead_id"] for l in listed}
    # a1/a2 are owned by e1 and still open — they must appear.
    assert {"a1", "a2"} <= ids


def test_worked_leads_never_appear_in_the_open_box():
    leads = _book()
    listed = main.filter_assign_workspace_leads(leads, "unassigned", "all", "e1", "", "", EMP)
    ids = {l["lead_id"] for l in listed}
    for worked in ("a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11"):
        assert worked not in ids, worked
