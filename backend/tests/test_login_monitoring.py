"""Login monitoring: session metadata, heartbeat, and the active-sessions feed.

These cover the "Who's logged in now" panel and the single-device metadata that
feeds it. Everything runs against the in-memory Supabase fake.
"""
import sys
import time
from pathlib import Path

from starlette.responses import Response

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _wait_for(predicate, timeout=2.0):
    """Daemon threads write the audit row asynchronously — poll briefly."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return predicate()


def _employee_user():
    return {
        "user_id": "user_tc_login",
        "email": "tc@example.com",
        "name": "TC Login",
        "role": "telecaller",
        "employee_id": "emp_login_1",
        "created_at": main.now_utc().isoformat(),
    }


def test_issue_session_persists_login_metadata(fake_db):
    fake_db.reset(seed={"users": [{
        "user_id": "user_tc_login",
        "email": "tc@example.com",
        "name": "TC Login",
        "role": "telecaller",
        "employee_id": "emp_login_1",
        # Present-but-null after login_monitoring.sql, so the column probe passes.
        "active_login_at": None,
        "active_last_seen_at": None,
        "last_login_at": None,
        "active_ip": None,
        "active_user_agent": None,
        "last_logout_at": None,
    }]})
    out = main.issue_session(_employee_user(), Response(), device_label="Mobile · Chrome")
    assert out["session_id"]

    row = fake_db.rows("users")[0]
    assert row["active_session_id"] == out["session_id"]
    assert row["active_device_label"] == "Mobile · Chrome"
    assert row.get("active_login_at") or row.get("session_updated_at")
    assert row.get("active_last_seen_at")
    assert main.USER_ACTIVE_SIDS["user_tc_login"] == out["session_id"]

    assert _wait_for(lambda: any(
        e.get("event") == "login" for e in fake_db.rows("login_events")
    )), "expected a login event to be recorded"


def test_issue_session_shift_logs_shift_event(fake_db):
    fake_db.reset(seed={
        "users": [{
            "user_id": "user_tc_login",
            "email": "tc@example.com",
            "name": "TC Login",
            "role": "telecaller",
            "employee_id": "emp_login_1",
            "active_session_id": "sid-old",
            "active_login_at": None,
            "active_last_seen_at": None,
            "last_login_at": None,
            "active_ip": None,
            "active_user_agent": None,
            "last_logout_at": None,
        }],
    })
    main._cache_active_session("user_tc_login", "sid-old", "Desktop · Chrome")
    main._SID_CACHE_AT["user_tc_login"] = time.time()

    main.issue_session(_employee_user(), Response(), device_label="Mobile · Chrome", force_shift=True)
    assert _wait_for(lambda: any(
        e.get("event") == "shift" for e in fake_db.rows("login_events")
    )), "expected a shift event to be recorded"


def test_heartbeat_endpoint_updates_last_seen(client, auth_user):
    r = client.get("/api/auth/heartbeat")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert auth_user.user_id in main.USER_ACTIVE_LAST_SEEN


def test_active_sessions_lists_logged_in_users(client, fake_db, auth_user):
    now = main.now_utc().isoformat()
    fake_db.reset(seed={
        "users": [
            {
                "user_id": "u_online", "email": "on@example.com", "name": "On Line",
                "role": "telecaller", "employee_id": "emp_1",
                "active_session_id": "sid-1", "active_device_label": "Mobile · Chrome",
                "session_updated_at": now, "active_login_at": now,
                "active_last_seen_at": now, "active_ip": "1.2.3.4",
            },
            {
                "user_id": "u_idle", "email": "idle@example.com", "name": "Idle User",
                "role": "manager", "employee_id": "emp_2",
                "active_session_id": "sid-2", "active_device_label": "Desktop · Safari",
                "session_updated_at": "2020-01-01T00:00:00+00:00",
                "active_login_at": "2020-01-01T00:00:00+00:00",
                "active_last_seen_at": "2020-01-01T00:00:00+00:00",
                "active_ip": "5.6.7.8",
            },
        ],
        "employees": [
            {"employee_id": "emp_1", "name": "On Line", "department": "Sales", "active": True,
             "last_lat": 19.0, "last_lng": 72.0, "last_seen_at": now},
            {"employee_id": "emp_2", "name": "Idle User", "department": "Ops", "active": True,
             "last_lat": None, "last_lng": None, "last_seen_at": None},
        ],
    })

    r = client.get("/api/auth/active-sessions")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    by_id = {s["user_id"]: s for s in body["sessions"]}
    assert by_id["u_online"]["logged_in"] is True
    assert by_id["u_online"]["online"] is True
    assert by_id["u_online"]["device"] == "Mobile · Chrome"
    assert by_id["u_online"]["location_live"] is True
    assert by_id["u_idle"]["online"] is False
    assert body["online_count"] == 1


def test_active_sessions_requires_admin_or_manager(client):
    main.app.dependency_overrides[main.get_current_user] = lambda: main.User(
        user_id="u_tc", email="tc2@example.com", name="TC",
        role="telecaller", created_at=main.now_utc(),
    )
    r = client.get("/api/auth/active-sessions")
    assert r.status_code == 403
