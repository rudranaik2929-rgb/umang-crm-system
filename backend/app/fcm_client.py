"""Firebase Cloud Messaging via firebase-admin (Render: FCM_SERVICE_ACCOUNT_JSON)."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

FCM_PROJECT_ID = os.environ.get("FCM_PROJECT_ID", "")
FCM_SERVICE_ACCOUNT_JSON = os.environ.get("FCM_SERVICE_ACCOUNT_JSON", "")

_initialized = False
_on_invalid_token: Optional[Callable[[str], None]] = None


def set_invalid_token_handler(handler: Optional[Callable[[str], None]]) -> None:
    """Optional callback when FCM reports a dead token (deactivate in DB)."""
    global _on_invalid_token
    _on_invalid_token = handler


def init_firebase() -> bool:
    """Initialize Firebase Admin once at app startup."""
    global _initialized
    if _initialized:
        return True

    raw = (FCM_SERVICE_ACCOUNT_JSON or "").strip()
    if not raw:
        logger.info("FCM: FCM_SERVICE_ACCOUNT_JSON not set — push notifications disabled")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if firebase_admin._apps:
            _initialized = True
            return True

        if raw.startswith("{"):
            service_account_info = json.loads(raw)
        else:
            cred = credentials.Certificate(raw)
            firebase_admin.initialize_app(cred)
            _initialized = True
            project = FCM_PROJECT_ID or "file"
            logger.info("Firebase Admin initialized for FCM (project=%s)", project)
            return True

        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        _initialized = True
        project = service_account_info.get("project_id") or FCM_PROJECT_ID
        logger.info("Firebase Admin initialized for FCM (project=%s)", project)
        return True
    except json.JSONDecodeError as exc:
        logger.error("FCM: invalid FCM_SERVICE_ACCOUNT_JSON — %s", exc)
        return False
    except Exception as exc:
        logger.error("Firebase Admin init failed: %s", exc)
        return False


def fcm_configured() -> bool:
    return _initialized or bool((FCM_SERVICE_ACCOUNT_JSON or "").strip())


def send_fcm_to_token(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> bool:
    """Send one push notification. Returns True on success."""
    if not token or not title:
        return False
    if not init_firebase():
        return False

    from firebase_admin import messaging

    payload_data = {k: str(v) for k, v in (data or {}).items()}
    payload_data.setdefault("title", title)
    payload_data.setdefault("body", (body or "")[:500])
    link = payload_data.get("url", "/notifications")

    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=(body or "")[:500],
        ),
        data=payload_data,
        token=token,
        webpush=messaging.WebpushConfig(
            fcm_options=messaging.WebpushFCMOptions(link=link),
            notification=messaging.WebpushNotification(
                title=title,
                body=(body or "")[:500],
                icon="/icons/icon-192.png",
            ),
        ),
        android=messaging.AndroidConfig(priority="high"),
    )

    try:
        messaging.send(message)
        return True
    except messaging.UnregisteredError:
        logger.info("FCM token unregistered — removing: %s…", token[:12])
        if _on_invalid_token:
            _on_invalid_token(token)
        return False
    except messaging.SenderIdMismatchError:
        logger.warning("FCM sender ID mismatch for token %s…", token[:12])
        return False
    except Exception as exc:
        logger.warning("FCM send failed: %s", exc)
        return False


def send_fcm_batch(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    ok = 0
    failed: List[str] = []
    for tok in tokens:
        if send_fcm_to_token(tok, title, body, data):
            ok += 1
        else:
            failed.append(tok)
    return {"sent": ok, "failed": len(failed), "failed_tokens": failed}
