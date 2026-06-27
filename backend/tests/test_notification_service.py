import sys
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import notification_service as ns  # noqa: E402


def test_type_to_pref_mapping():
    assert ns.TYPE_TO_PREF[ns.TYPE_LEAD_ASSIGNED] == "lead_assigned"
    assert ns.TYPE_TO_PREF[ns.TYPE_FACEBOOK_LEAD] == "facebook_leads"


def test_preference_allows_default():
    ns.configure(
        sb_insert=MagicMock(),
        sb_select=MagicMock(return_value=[]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: p,
        now_utc=MagicMock(),
        session_cache={"notifications": []},
    )
    assert ns.preference_allows("emp_1", ns.TYPE_LEAD_ASSIGNED) is True


def test_preference_blocks_when_disabled():
    ns.configure(
        sb_insert=MagicMock(),
        sb_select=MagicMock(return_value=[{"lead_assigned": False, "push_enabled": True}]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: p,
        now_utc=MagicMock(),
        session_cache={"notifications": []},
    )
    assert ns.preference_allows("emp_1", ns.TYPE_LEAD_ASSIGNED) is False


def test_preference_allows_when_null_in_db():
    ns.configure(
        sb_insert=MagicMock(),
        sb_select=MagicMock(return_value=[{"lead_assigned": None}]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: p,
        now_utc=MagicMock(),
        session_cache={"notifications": []},
    )
    assert ns.preference_allows("emp_1", ns.TYPE_LEAD_ASSIGNED) is True


def test_persist_notification_falls_back_to_minimal_columns():
    calls = []

    def fake_insert(table, data):
        calls.append(dict(data))
        if len(calls) == 1:
            return None
        return data

    ns.configure(
        sb_insert=fake_insert,
        sb_select=MagicMock(return_value=[]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: f"{p}_x",
        now_utc=MagicMock(return_value=__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
        session_cache={"notifications": []},
    )
    ns.get_active_fcm_tokens = MagicMock(return_value=[])

    result = ns.create_notification(
        "emp_1",
        "Test",
        "Hello",
        type_=ns.TYPE_LEAD_ASSIGNED,
    )
    assert result is not None
    assert len(calls) == 2
    assert "metadata" not in calls[1]
    assert calls[1]["user_id"] == "emp_1"


def test_notify_lead_assigned_message_contains_customer():
    mock_insert = MagicMock(return_value={"notification_id": "ntf_1"})
    mock_select = MagicMock(return_value=[])
    ns.configure(
        sb_insert=mock_insert,
        sb_select=mock_select,
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: f"{p}_test",
        now_utc=MagicMock(return_value=__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
        session_cache={"notifications": []},
    )
    ns.get_active_fcm_tokens = MagicMock(return_value=[])

    lead = {
        "lead_id": "lead_1",
        "name": "Amit Sharma",
        "phone": "9876543210",
        "property_type": "2BHK",
        "budget": "50L",
    }
    result = ns.notify_lead_assigned("emp_1", lead, sender_id="mgr_1")
    assert result is not None
    mock_insert.assert_called_once()
    payload = mock_insert.call_args[0][1]
    assert "Amit Sharma" in payload["message"]
    assert payload["type"] == ns.TYPE_LEAD_ASSIGNED
    assert payload["title"] == "Lead assigned"
