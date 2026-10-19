"""Outbound email for the login OTP.

Every login verification code is delivered to ONE administration mailbox —
never to the person who typed the password. Configure it with environment
variables so no secret lives in the repo:

    OTP_EMAIL       destination for every login code
                    (default: Umanghometechllp@gmail.com)
    SMTP_HOST       default: smtp.gmail.com
    SMTP_PORT       default: 587 (STARTTLS)
    SMTP_USER       SMTP username (the Gmail address)
    SMTP_PASSWORD   SMTP password / Gmail App Password
    SMTP_FROM       From header (default: SMTP_USER)

Alternative provider (used automatically when RESEND_API_KEY is set):
    RESEND_API_KEY
    RESEND_FROM     default: "Umang Properties CRM <onboarding@resend.dev>"

If nothing is configured the app keeps working but OTP emails cannot be sent;
`email_configured()` reports this so the API can return a clear, actionable
error instead of a silent failure.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_RECIPIENT = "Umanghometechllp@gmail.com"
DEFAULT_RESEND_FROM = "Umang Properties CRM <onboarding@resend.dev>"


def otp_recipient() -> str:
    """Every login OTP is delivered here — never to the person who logged in."""
    return (os.environ.get("OTP_EMAIL") or "").strip() or DEFAULT_RECIPIENT


def _smtp_config() -> dict:
    host = (os.environ.get("SMTP_HOST") or "smtp.gmail.com").strip() or "smtp.gmail.com"
    try:
        port = int((os.environ.get("SMTP_PORT") or "587").strip())
    except (TypeError, ValueError):
        port = 587
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = os.environ.get("SMTP_PASSWORD") or ""
    sender = (os.environ.get("SMTP_FROM") or "").strip() or user
    return {"host": host, "port": port, "user": user, "password": password, "sender": sender}


def email_configured() -> bool:
    """True when we have enough configuration to actually deliver mail."""
    if (os.environ.get("RESEND_API_KEY") or "").strip():
        return True
    cfg = _smtp_config()
    return bool(cfg["user"] and cfg["password"])


def _send_via_resend(api_key: str, sender: str, to: str, subject: str, text: str, html: str) -> bool:
    try:
        payload = {"from": sender, "to": [to], "subject": subject, "text": text}
        if html:
            payload["html"] = html
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error("Resend send failed (%s): %s", resp.status_code, (resp.text or "")[:300])
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — never let mail failure crash a request
        logger.error("Resend send error: %s", exc)
        return False


def _send_via_smtp(cfg: dict, to: str, subject: str, text: str, html: str) -> bool:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["sender"]
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20.0) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — never let mail failure crash a request
        logger.error("SMTP send failed: %s", exc)
        return False


def send_email(to: str, subject: str, text: str, html: str = "") -> bool:
    """Send one email. Resend wins when configured, otherwise SMTP."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    if api_key:
        sender = (os.environ.get("RESEND_FROM") or "").strip() or DEFAULT_RESEND_FROM
        return _send_via_resend(api_key, sender, to, subject, text, html)
    cfg = _smtp_config()
    if not (cfg["user"] and cfg["password"]):
        logger.warning(
            "Email not configured — set SMTP_USER + SMTP_PASSWORD (Gmail App Password) "
            "or RESEND_API_KEY in the backend environment."
        )
        return False
    return _send_via_smtp(cfg, to, subject, text, html)


def send_otp_email(code: str, login_email: str, device_label: str = "") -> bool:
    """Deliver a login code to the administration mailbox."""
    to = otp_recipient()
    who = login_email or "a user"
    device_line = f"Device: {device_label}" if device_label else ""
    subject = f"Umang Properties CRM — login code {code}"
    text = (
        "Umang Properties CRM — login verification\n\n"
        f"Code: {code}\n\n"
        f"Signing in as: {who}\n"
        + (f"{device_line}\n" if device_line else "")
        + "\nEnter this code in the app to finish signing in. It expires in 10 minutes.\n"
        "If this wasn't expected you can ignore this email — nobody can sign in without the code.\n"
    )
    device_html = f"<br/>Device: {device_label}" if device_label else ""
    html = (
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px">'
        '<h2 style="margin:0 0 4px">Umang Properties CRM</h2>'
        '<p style="color:#475569;margin:0 0 18px">Login verification code</p>'
        f'<p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:0 0 18px">{code}</p>'
        f'<p style="color:#475569;margin:0 0 6px">Signing in as <b>{who}</b>{device_html}</p>'
        '<p style="color:#94A3B8;font-size:12px;margin:14px 0 0">'
        "Expires in 10 minutes. If this wasn\u2019t expected, ignore this email.</p>"
        "</div>"
    )
    return send_email(to, subject, text, html)
