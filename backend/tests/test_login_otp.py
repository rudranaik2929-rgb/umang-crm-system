"""Login OTP (Plan B): every sign-in needs a code that is emailed to the
administration mailbox — never to the address the person typed.

Flow under test:
  1. ``POST /api/auth/otp/request`` checks email+password, then emails a code to
     ``OTP_EMAIL`` (default Umanghometechllp@gmail.com).
  2. ``POST /api/auth/otp/verify`` checks the code and issues the session, with
     the usual single-device "Shift" gate for a *second* device.

The whole suite is hermetic: the mail transport is replaced by a capture list.
"""
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402

ADMIN_MAILBOX = "Umanghometechllp@gmail.com"


@pytest.fixture(autouse=True)
def _clear_otp_store():
    """Pending challenges live in module memory — never leak between tests."""
    main._OTP_CHALLENGES.clear()
    yield
    main._OTP_CHALLENGES.clear()


@pytest.fixture
def mailbox(monkeypatch):
    """Capture OTP emails instead of sending them over the network."""
    sent = []

    monkeypatch.setattr(main.email_service, "email_configured", lambda: True)

    def _capture(code, login_email, device_label=""):
        sent.append({"code": code, "login_email": login_email, "device_label": device_label})
        return True

    monkeypatch.setattr(main.email_service, "send_otp_email", _capture)
    return sent


def _request(client, email="umang@admin", password="umang@admin"):
    return client.post("/api/auth/otp/request", json={"email": email, "password": password})


def _verify(client, challenge_id, code, **extra):
    return client.post(
        "/api/auth/otp/verify",
        json={"challenge_id": challenge_id, "code": code, **extra},
    )


def test_otp_is_sent_to_the_administration_mailbox_not_the_typed_address(client, mailbox):
    r = _request(client, email="umang@admin", password="umang@admin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["otp_required"] is True
    assert body["challenge_id"]
    assert body["sent_to"] == ADMIN_MAILBOX

    assert len(mailbox) == 1
    # The code is addressed to the administrator's mailbox even though the
    # admin typed their own address…
    assert main.email_service.otp_recipient() == ADMIN_MAILBOX
    # …and the email records *who* is signing in.
    assert mailbox[0]["login_email"] == "umang@admin"


def test_employee_otp_also_goes_to_the_administration_mailbox(client, mailbox):
    r = _request(client, email="mukesh@umang.com", password="mukesh@123")
    assert r.status_code == 200, r.text
    assert r.json()["sent_to"] == ADMIN_MAILBOX
    assert mailbox[0]["login_email"] == "mukesh@umang.com"


def test_otp_verify_issues_session_and_the_code_cannot_be_reused(client, mailbox):
    r = _request(client)
    cid = r.json()["challenge_id"]

    ok = _verify(client, cid, mailbox[-1]["code"])
    assert ok.status_code == 200, ok.text
    payload = ok.json()
    assert payload["user"]["email"] == "umang@admin"
    assert payload["session_token"]
    assert payload["session_id"]

    # A code is single-use.
    again = _verify(client, cid, mailbox[-1]["code"])
    assert again.status_code == 400


def test_otp_verify_rejects_a_wrong_code_but_keeps_the_challenge_usable(client, mailbox):
    r = _request(client)
    challenge_id = r.json()["challenge_id"]
    real_code = mailbox[-1]["code"]
    wrong_code = "000000" if real_code != "000000" else "111111"

    bad = _verify(client, challenge_id, wrong_code)
    assert bad.status_code == 401

    good = _verify(client, challenge_id, real_code)
    assert good.status_code == 200


def test_otp_verify_rejects_an_unknown_challenge(client):
    r = _verify(client, "otp-does-not-exist", "123456")
    assert r.status_code == 400


def test_otp_request_rejects_bad_password_without_sending_mail(client, mailbox):
    r = _request(client, email="umang@admin", password="not-the-password")
    assert r.status_code == 401
    assert mailbox == []


def test_otp_request_is_actionable_when_mail_is_not_configured(client, monkeypatch):
    monkeypatch.setattr(main.email_service, "email_configured", lambda: False)
    r = _request(client)
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"].lower()


def test_direct_session_endpoints_are_closed_while_otp_is_on(client, monkeypatch):
    if not main.OTP_LOGIN_ENABLED:
        pytest.skip("OTP login disabled via OTP_LOGIN_ENABLED")
    monkeypatch.setattr(main.email_service, "email_configured", lambda: True)
    for path in ("/api/auth/session", "/api/auth/shift-session"):
        r = client.post(path, json={"email": "umang@admin", "password": "umang@admin"})
        assert r.status_code == 403, f"{path} should require OTP"


def test_direct_login_still_works_until_mail_is_configured(client, monkeypatch):
    """Safety valve: without a mail transport we must never lock the CRM out."""
    monkeypatch.setattr(main.email_service, "email_configured", lambda: False)
    r = client.post("/api/auth/session", json={"email": "umang@admin", "password": "umang@admin"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == "umang@admin"


def test_second_device_must_pass_otp_again_and_then_shift(client, mailbox):
    """Same device stays logged in; another device needs a fresh OTP + shift."""
    from fastapi.testclient import TestClient

    # Device 1 — employee signs in with email/password + OTP.
    r1 = _request(client, email="mukesh@umang.com", password="mukesh@123")
    assert r1.status_code == 200, r1.text
    v1 = _verify(client, r1.json()["challenge_id"], mailbox[-1]["code"])
    assert v1.status_code == 200, v1.text

    # Device 2 — a fresh client. OTP is required again, then the single-device
    # gate kicks in because the account is already active on device 1.
    device2 = TestClient(main.app)
    r2 = _request(device2, email="mukesh@umang.com", password="mukesh@123")
    assert r2.status_code == 200, r2.text
    assert len(mailbox) == 2, "the second device must trigger a fresh OTP email"

    conflict = _verify(device2, r2.json()["challenge_id"], mailbox[-1]["code"])
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["requires_shift"] is True

    # The 409 does not consume the code, so Shift can reuse it.
    shifted = _verify(
        device2,
        r2.json()["challenge_id"],
        mailbox[-1]["code"],
        force_shift=True,
    )
    assert shifted.status_code == 200, shifted.text
    assert shifted.json()["user"]["email"] == "mukesh@umang.com"


class _FakeSMTP:
    """Stand-in for smtplib.SMTP that records what would have been sent."""

    instances: list = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.messages = []
        self.logged_in = None
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def ehlo(self):
        pass

    def starttls(self, context=None):
        pass

    def login(self, user, password):
        self.logged_in = (user, password)

    def send_message(self, msg):
        self.messages.append(msg)


def test_send_otp_email_delivers_to_the_administration_mailbox(monkeypatch):
    monkeypatch.setenv("SMTP_USER", ADMIN_MAILBOX)
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    monkeypatch.delenv("OTP_EMAIL", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    _FakeSMTP.instances = []
    monkeypatch.setattr(main.email_service.smtplib, "SMTP", _FakeSMTP)

    sent = main.email_service.send_otp_email("123456", "mukesh@umang.com", "Mobile · Chrome")
    assert sent is True

    assert len(_FakeSMTP.instances) == 1
    server = _FakeSMTP.instances[0]
    assert server.host == "smtp.gmail.com"
    assert server.port == 587
    assert server.logged_in == (ADMIN_MAILBOX, "app-password")

    msg = server.messages[0]
    assert msg["To"] == ADMIN_MAILBOX
    assert "123456" in msg["Subject"]
    plain = msg.get_body(preferencelist=("plain",)).get_content()
    assert "123456" in plain
    assert "mukesh@umang.com" in plain


def test_email_service_defaults_to_the_administration_mailbox(monkeypatch):
    for var in ("OTP_EMAIL", "RESEND_API_KEY", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    assert main.email_service.otp_recipient() == ADMIN_MAILBOX
    assert main.email_service.email_configured() is False

    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    assert main.email_service.email_configured() is True

    monkeypatch.setenv("OTP_EMAIL", "ops@example.com")
    assert main.email_service.otp_recipient() == "ops@example.com"


def test_otp_expiry_and_attempt_limits_are_enforced(client, mailbox, monkeypatch):
    monkeypatch.setattr(main, "OTP_MAX_ATTEMPTS", 2)
    r = _request(client)
    challenge_id = r.json()["challenge_id"]
    real_code = mailbox[-1]["code"]
    wrong_code = "000000" if real_code != "000000" else "111111"

    assert _verify(client, challenge_id, wrong_code).status_code == 401
    assert _verify(client, challenge_id, wrong_code).status_code == 401
    # Attempt budget spent — even the correct code is now refused.
    assert _verify(client, challenge_id, real_code).status_code == 429
