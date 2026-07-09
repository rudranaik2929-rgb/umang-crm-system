import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_strip_activity_actor_prefix():
    assert main.strip_activity_actor_prefix("[Ravi] Hello") == "Hello"
    assert main.strip_activity_actor_prefix("Hello") == "Hello"


def test_format_activity_note_text_strips_existing_prefix():
    class Actor:
        name = "Ravi"
        acting_as_employee_id = None

    body = main.format_activity_note_text(Actor(), "[Ravi] Customer callback tomorrow")
    assert body == "[Ravi] Customer callback tomorrow"


def test_is_editable_lead_note_activity():
    assert main.is_editable_lead_note_activity({"type": "call_note"})
    assert main.is_editable_lead_note_activity({"type": "visit_note"})
    assert not main.is_editable_lead_note_activity({"type": "stage_change_positive"})


def test_ensure_lead_note_access_allows_any_role():
    class Telecaller:
        role = "telecaller"
        employee_id = "emp_tc"

    lead = {"lead_id": "lead_1", "assigned_to": "emp_other"}
    main.ensure_lead_note_access(Telecaller(), lead)


def test_ensure_lead_update_access_allows_remarks_on_any_lead():
    class Booking:
        role = "booking"
        employee_id = "emp_booking"

    lead = {"lead_id": "lead_1", "assigned_to": "emp_other"}
    main.ensure_lead_update_access(Booking(), lead, main.LeadUpdate(notes="Walk-in prefers 2BHK"))


def test_ensure_lead_update_access_blocks_workflow_for_non_assignee():
    import pytest
    from fastapi import HTTPException

    class Telecaller:
        role = "telecaller"
        employee_id = "emp_tc"
        acting_as_employee_id = None
        user_id = None
        email = None

    lead = {"lead_id": "lead_1", "assigned_to": "emp_other"}
    with pytest.raises(HTTPException) as exc:
        main.ensure_lead_update_access(Telecaller(), lead, main.LeadUpdate(stage="positive"))
    assert exc.value.status_code == 403


def test_ensure_lead_edit_access_uses_partial_name_match():
    class Telecaller:
        role = "telecaller"
        employee_id = "emp_trupti"
        acting_as_employee_id = None
        user_id = None
        email = None

    lead = {"lead_id": "lead_1", "assigned_to": "Trupti"}
    employee = {"employee_id": "emp_trupti", "name": "Trupti Lade", "user_id": "u1"}

    original_sb_select = main.sb_select
    original_lookup = main._lookup_employee

    def mock_lookup(field, value):
        if field == "employee_id" and value == "emp_trupti":
            return employee
        return None

    def mock_sb_select(table, params=None):
        if table == "employees" and params and "emp_trupti" in str(params):
            return [employee]
        return original_sb_select(table, params)

    main.sb_select = mock_sb_select
    main._lookup_employee = mock_lookup
    try:
        main.ensure_lead_edit_access(Telecaller(), lead)
    finally:
        main.sb_select = original_sb_select
        main._lookup_employee = original_lookup


def test_ensure_lead_edit_access_matches_assigned_user_id():
    class Telecaller:
        role = "telecaller"
        employee_id = "user_61ea2268a864"
        acting_as_employee_id = "user_61ea2268a864"
        user_id = "user_61ea2268a864"
        email = "umangsales020@gmail.com"

    employee = {
        "employee_id": "emp_bf700d434343",
        "name": "Khyati Shah",
        "user_id": "user_61ea2268a864",
    }
    lead = {"lead_id": "lead_1", "assigned_to": "user_61ea2268a864"}

    original_lookup = main._lookup_employee
    original_exists = main._employee_id_exists

    def mock_lookup(field, value):
        if field == "email" and value == "umangsales020@gmail.com":
            return employee
        if field == "user_id" and value == "user_61ea2268a864":
            return employee
        if field == "employee_id" and value == "emp_bf700d434343":
            return employee
        return None

    main._lookup_employee = mock_lookup
    main._employee_id_exists = lambda eid: eid == "emp_bf700d434343"
    try:
        main.ensure_lead_edit_access(Telecaller(), lead)
    finally:
        main._lookup_employee = original_lookup
        main._employee_id_exists = original_exists
