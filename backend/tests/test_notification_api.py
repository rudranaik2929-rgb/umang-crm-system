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


def test_fetch_notifications_queries_each_user_id(monkeypatch):
    """Every notification id goes out in a single PostgREST `in.()` filter.

    The implementation was refactored from one request per id to one combined
    query; this locks in the current shape so a regression that drops an id (or
    silently returns nothing) is caught here.
    """
    seen_filters: list = []
    user = main.User(
        user_id="user_khyati",
        email="khyati@umang.com",
        name="Khyati Shah",
        role="telecaller",
        employee_id="emp_khyati",
        acting_as_employee_id="emp_khyati",
        created_at=main.now_utc(),
    )

    def fake_select(table, params=None):
        params = params or {}
        if table != "employees":
            filt = params.get("user_id") or ""
            seen_filters.append(filt)
            # Rows keyed by emp_khyati match both the legacy eq. probe and the
            # combined in.() read that replaced the per-id queries.
            if "emp_khyati" in filt:
                return [{
                    "notification_id": "n1",
                    "user_id": "emp_khyati",
                    "title": "Lead assigned",
                    "type": "workflow",
                    "is_read": False,
                    "created_at": "2026-06-27T10:00:00+00:00",
                }]
            return []
        if params.get("employee_id") == "eq.emp_khyati":
            return [{
                "employee_id": "emp_khyati",
                "name": "Khyati Shah",
                "user_id": "user_khyati",
                "active": True,
            }]
        return []

    monkeypatch.setattr(main, "sb_select", fake_select)
    rows = main._fetch_notifications_for_user(user)
    assert len(rows) == 1
    assert rows[0]["notification_id"] == "n1"

    combined = [f for f in seen_filters if f and f.startswith("in.")]
    assert combined, f"expected a combined in.() filter, saw {seen_filters}"
    assert "emp_khyati" in combined[0]
    assert "user_khyati" in combined[0]
