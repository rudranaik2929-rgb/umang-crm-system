import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_postgrest_user_id_filter_quotes_names_with_spaces():
    filt = main._postgrest_user_id_filter(["emp_abc", "Khyati Shah"])
    assert filt == 'in.(emp_abc,"Khyati Shah")'


def test_notification_matches_legacy_workflow_assignments():
    note = {"type": "workflow", "title": "Lead assigned", "message": "Har has been assigned to you."}
    assert main._notification_matches_type_filter(note, "lead_assigned") is True
    assert main._notification_matches_type_filter(note, "lead_updated") is False


def test_notification_matches_new_lead_assigned_type():
    note = {"type": "lead_assigned", "title": "Lead assigned", "message": "Test has been assigned to you."}
    assert main._notification_matches_type_filter(note, "lead_assigned") is True
