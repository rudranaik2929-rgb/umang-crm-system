"""Unit tests for single-device login (session lock / Shift)."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.responses import Response

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_session_state():
    main.USER_ACTIVE_SIDS.clear()
    main.USER_ACTIVE_DEVICES.clear()
    main._SID_CACHE_AT.clear()
    main.LOCAL_SESSIONS.clear()
    yield
    main.USER_ACTIVE_SIDS.clear()
    main.USER_ACTIVE_DEVICES.clear()
    main._SID_CACHE_AT.clear()
    main.LOCAL_SESSIONS.clear()


def test_role_requires_single_device_exempts_admin():
    assert main.role_requires_single_device("admin") is False
    assert main.role_requires_single_device("telecaller") is True
    assert main.role_requires_single_device("manager") is True
    assert main.role_requires_single_device("sales_executive") is True
    assert main.role_requires_single_device(None) is False


def test_raise_if_session_conflict_blocks_second_login(monkeypatch):
    uid = "user_tc_test"
    main._cache_active_session(uid, "sid-old", "Mobile · Chrome")
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: ("sid-old", "Mobile · Chrome"))

    with pytest.raises(HTTPException) as ei:
        main.raise_if_session_conflict(
            {"user_id": uid, "role": "telecaller"},
            force_shift=False,
        )
    assert ei.value.status_code == 409
    detail = ei.value.detail
    assert detail["requires_shift"] is True
    assert "Mobile" in detail["active_device"]


def test_raise_if_session_conflict_allows_force_shift(monkeypatch):
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: ("sid-old", "Desktop · Chrome"))
    main.raise_if_session_conflict(
        {"user_id": "user_tc_test", "role": "telecaller"},
        force_shift=True,
    )


def test_raise_if_session_conflict_skips_admin(monkeypatch):
    called = {"n": 0}

    def boom(*a, **k):
        called["n"] += 1
        return ("sid", "x")

    monkeypatch.setattr(main, "load_active_session", boom)
    main.raise_if_session_conflict({"user_id": "user_admin001", "role": "admin"}, force_shift=False)
    assert called["n"] == 0


def test_raise_if_session_conflict_allows_first_login(monkeypatch):
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: (None, None))
    main.raise_if_session_conflict(
        {"user_id": "user_new", "role": "telecaller"},
        force_shift=False,
    )


def test_validate_jwt_session_id_rejects_stale_sid(monkeypatch):
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: ("sid-new", "Laptop"))
    with pytest.raises(HTTPException) as ei:
        main.validate_jwt_session_id("user_tc", "telecaller", "sid-old")
    assert ei.value.status_code == 401
    assert "Session moved" in ei.value.detail


def test_validate_jwt_session_id_allows_matching_sid(monkeypatch):
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: ("sid-ok", "Laptop"))
    main.validate_jwt_session_id("user_tc", "telecaller", "sid-ok")


def test_validate_jwt_session_id_skips_when_no_lock(monkeypatch):
    monkeypatch.setattr(main, "load_active_session", lambda user_id, force_db=False: (None, None))
    main.validate_jwt_session_id("user_tc", "telecaller", None)


def test_issue_session_shift_invalidates_old_token(monkeypatch):
    updates = []
    monkeypatch.setattr(main, "sb_insert", lambda *a, **k: None)
    monkeypatch.setattr(main, "sb_delete", lambda *a, **k: True)
    monkeypatch.setattr(main, "sb_update", lambda table, pk, pk_val, data: updates.append(data) or data)
    monkeypatch.setattr(main, "COOKIE_SECURE", False)

    user = {
        "user_id": "user_mukesh001",
        "email": "mukesh@umang.com",
        "name": "Mukesh Sharma",
        "role": "telecaller",
        "employee_id": "emp_1b7760567ae6",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    # Seed an old in-memory session
    main.LOCAL_SESSIONS["old-token"] = {
        "user": dict(user),
        "expires_at": "2099-01-01T00:00:00+00:00",
        "sid": "sid-old",
    }
    main._cache_active_session(user["user_id"], "sid-old", "Mobile · Chrome")

    resp = Response()
    out = main.issue_session(user, resp, device_label="Desktop · Chrome", force_shift=True)
    assert out["session_token"]
    assert out["session_id"]
    assert "old-token" not in main.LOCAL_SESSIONS
    assert main.USER_ACTIVE_SIDS[user["user_id"]] == out["session_id"]

    # Old sid must be rejected
    with pytest.raises(HTTPException) as ei:
        main.validate_jwt_session_id(user["user_id"], "telecaller", "sid-old")
    assert ei.value.status_code == 401

    # New sid allowed
    main.validate_jwt_session_id(user["user_id"], "telecaller", out["session_id"])


def test_session_conflict_payload_shape():
    p = main.session_conflict_payload("Mobile · Safari")
    assert p["requires_shift"] is True
    assert p["active_device"] == "Mobile · Safari"
    assert "Shift" in p["message"] or "shift" in p["message"].lower() or "move" in p["message"].lower()
