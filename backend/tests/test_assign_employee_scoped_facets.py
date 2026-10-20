"""Advanced Search "Assigned To" must scope the Assign Leads boxes to that employee.

Regression: picking an employee filtered the list but left the box counts
company-wide, so the boxes never changed when you chose a different person.
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
        _lead("k1", assigned_to="e2"),
        _lead("k2", assigned_to="e2", stage="positive", priority="hot"),
        _lead("free1"),
        _lead("free2", stage="assigned"),
    ]


def test_box_total_follows_the_selected_employee():
    leads = _book()
    alok = main.compute_assign_workspace_facets(leads, EMP, "e1")
    khyati = main.compute_assign_workspace_facets(leads, EMP, "e2")
    company = main.compute_assign_workspace_facets(leads, EMP, "all")
    assert alok["inquiry_status"]["all"] == 3
    assert khyati["inquiry_status"]["all"] == 2
    assert company["inquiry_status"]["all"] == 7
    assert alok["inquiry_status"]["all"] != khyati["inquiry_status"]["all"]


def test_boxes_match_the_list_for_every_employee():
    leads = _book()
    for who in ("all", "e1", "e2", "unassigned"):
        facets = main.compute_assign_workspace_facets(leads, EMP, who)
        listed = main.filter_assign_workspace_leads(leads, "all", "all", who, "", "", EMP)
        assert facets["inquiry_status"]["all"] == len(listed), who


def test_employee_scoped_boxes_only_contain_their_own_leads():
    leads = _book()
    alok_leads = main.filter_assign_workspace_leads(leads, "all", "all", "e1", "", "", EMP)
    assert {l["lead_id"] for l in alok_leads} == {"a1", "a2", "a3"}
    facets = main.compute_assign_workspace_facets(leads, EMP, "e1")
    assert facets["inquiry_status"]["all"] == len(alok_leads)


def test_open_box_is_scoped_too():
    leads = _book()
    alok = main.compute_assign_workspace_facets(leads, EMP, "e1")
    # a1 + a2 are open; a3 is hot/positive and therefore not open.
    assert alok["inquiry_status"]["unassigned"] == 2
    khyati = main.compute_assign_workspace_facets(leads, EMP, "e2")
    # k1 is open; k2 is hot/positive.
    assert khyati["inquiry_status"]["unassigned"] == 1


def test_default_and_all_are_company_wide():
    leads = _book()
    default = main.compute_assign_workspace_facets(leads, EMP)
    explicit = main.compute_assign_workspace_facets(leads, EMP, "all")
    assert default["inquiry_status"] == explicit["inquiry_status"]


def test_unassigned_scope_is_the_open_leads_universe():
    leads = _book()
    facets = main.compute_assign_workspace_facets(leads, EMP, "unassigned")
    listed = main.filter_assign_workspace_leads(leads, "all", "all", "unassigned", "", "", EMP)
    assert facets["inquiry_status"]["all"] == len(listed)
    # Unassigned means "open leads", so these two boxes always agree.
    assert facets["inquiry_status"]["unassigned"] == facets["inquiry_status"]["all"]
