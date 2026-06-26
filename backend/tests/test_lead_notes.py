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

    def mock_sb_select(table, params=None):
        if table == "employees" and params and "emp_trupti" in str(params):
            return [employee]
        return original_sb_select(table, params)

    main.sb_select = mock_sb_select
    try:
        main.ensure_lead_edit_access(Telecaller(), lead)
    finally:
        main.sb_select = original_sb_select
