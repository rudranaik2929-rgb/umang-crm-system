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


def test_rapid_assigns_merge_into_one_growing_message():
    import datetime as _dt
    now = _dt.datetime.now(_dt.timezone.utc)
    existing = {
        "notification_id": "ntf_existing",
        "user_id": "emp_1",
        "type": ns.TYPE_LEAD_ASSIGNED,
        "title": "Lead assigned",
        "message": "Rohit assigned 1 lead to you.",
        "sender_id": "mgr_1",
        "metadata": {"assignment_summary": True, "assigned_count": 1},
        "created_at": now.isoformat(),
    }
    mock_update = MagicMock(return_value=None)
    ns.configure(
        sb_insert=MagicMock(return_value={"notification_id": "ntf_new"}),
        sb_select=MagicMock(return_value=[existing]),
        sb_update=mock_update,
        sb_delete=MagicMock(),
        gen_id=lambda p: f"{p}_test",
        now_utc=MagicMock(return_value=now),
        session_cache={"notifications": []},
    )
    ns.get_active_fcm_tokens = MagicMock(return_value=[])

    # Assigning 2 more leads while a recent summary exists -> merge to 3, single row.
    result = ns.notify_bulk_leads_assigned("emp_1", 2, sender_id="mgr_1", manager_name="Rohit")
    assert result is not None
    mock_update.assert_called_once()
    patch = mock_update.call_args[0][3]
    assert patch["metadata"]["assigned_count"] == 3
    assert "3 leads" in patch["message"]
    assert "Rohit assigned 3 leads to you." == patch["message"]


def test_notify_lead_assigned_uses_summary_not_customer_name():
    mock_insert = MagicMock(return_value={"notification_id": "ntf_1"})
    ns.configure(
        sb_insert=mock_insert,
        sb_select=MagicMock(return_value=[]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: f"{p}_test",
        now_utc=MagicMock(return_value=__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
        session_cache={"notifications": []},
    )
    ns.get_active_fcm_tokens = MagicMock(return_value=[])

    lead = {"lead_id": "lead_1", "name": "Amit Sharma", "phone": "9876543210"}
    result = ns.notify_lead_assigned("emp_1", lead, sender_id="mgr_1", manager_name="Rohit")
    assert result is not None
    payload = mock_insert.call_args[0][1]
    assert "Amit Sharma" not in payload["message"]
    assert "Rohit assigned 1 lead" in payload["message"]
    assert payload["metadata"]["assignment_summary"] is True


def test_notify_bulk_leads_assigned():
    mock_insert = MagicMock(return_value={"notification_id": "ntf_bulk"})
    ns.configure(
        sb_insert=mock_insert,
        sb_select=MagicMock(return_value=[]),
        sb_update=MagicMock(),
        sb_delete=MagicMock(),
        gen_id=lambda p: f"{p}_test",
        now_utc=MagicMock(return_value=__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
        session_cache={"notifications": []},
    )
    ns.get_active_fcm_tokens = MagicMock(return_value=[])

    result = ns.notify_bulk_leads_assigned("emp_1", 34, sender_id="mgr_1", manager_name="Rohit")
    assert result is not None
    payload = mock_insert.call_args[0][1]
    assert "Rohit assigned 34 leads" in payload["message"]
    assert payload["type"] == ns.TYPE_LEAD_ASSIGNED
    assert payload["metadata"]["assignment_summary"] is True
