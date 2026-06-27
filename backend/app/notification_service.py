"""Central notification service — in-app + FCM push for Umang CRM."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from app.fcm_client import fcm_configured, send_fcm_batch

logger = logging.getLogger(__name__)

# Notification type constants
TYPE_LEAD_ASSIGNED = "lead_assigned"
TYPE_LEAD_REMOVED = "lead_reassigned_removed"
TYPE_LEAD_UPDATED = "lead_updated"
TYPE_NOTE_ADDED = "note_added"
TYPE_MANAGER_COMMENT = "manager_comment"
TYPE_FACEBOOK_LEAD = "facebook_lead"
TYPE_HOUSING_LEAD = "housing_lead"
TYPE_FOLLOW_UP_REMINDER = "follow_up_reminder"
TYPE_FOLLOW_UP_OVERDUE = "follow_up_overdue"
TYPE_LEAD_CLOSED = "lead_closed"
TYPE_LEAD_WON = "lead_won"
TYPE_LEAD_LOST = "lead_lost"
TYPE_BROADCAST = "broadcast"
TYPE_SYSTEM = "system"

TYPE_TO_PREF: Dict[str, str] = {
    TYPE_LEAD_ASSIGNED: "lead_assigned",
    TYPE_LEAD_REMOVED: "lead_assigned",
    TYPE_LEAD_UPDATED: "lead_updated",
    TYPE_NOTE_ADDED: "comments",
    TYPE_MANAGER_COMMENT: "comments",
    TYPE_FACEBOOK_LEAD: "facebook_leads",
    TYPE_HOUSING_LEAD: "housing_leads",
    TYPE_FOLLOW_UP_REMINDER: "reminders",
    TYPE_FOLLOW_UP_OVERDUE: "reminders",
    TYPE_LEAD_CLOSED: "lead_updated",
    TYPE_LEAD_WON: "lead_updated",
    TYPE_LEAD_LOST: "lead_updated",
    TYPE_BROADCAST: "system_alerts",
    TYPE_SYSTEM: "system_alerts",
}

MANAGER_ROLES = ("admin", "manager")

_sb_insert: Optional[Callable] = None
_sb_select: Optional[Callable] = None
_sb_update: Optional[Callable] = None
_sb_delete: Optional[Callable] = None
_gen_id: Optional[Callable] = None
_now_utc: Optional[Callable] = None
_session_cache: Optional[Dict[str, Any]] = None
_resolve_receiver: Optional[Callable[[str], Optional[str]]] = None


def configure(
    *,
    sb_insert,
    sb_select,
    sb_update,
    sb_delete,
    gen_id,
    now_utc,
    session_cache: Dict[str, Any],
    resolve_receiver: Optional[Callable[[str], Optional[str]]] = None,
) -> None:
    global _sb_insert, _sb_select, _sb_update, _sb_delete, _gen_id, _now_utc, _session_cache, _resolve_receiver
    _sb_insert = sb_insert
    _sb_select = sb_select
    _sb_update = sb_update
    _sb_delete = sb_delete
    _gen_id = gen_id
    _now_utc = now_utc
    _session_cache = session_cache
    _resolve_receiver = resolve_receiver


def _canonical_receiver(receiver_id: Optional[str]) -> Optional[str]:
    if not receiver_id:
        return None
    ref = str(receiver_id).strip()
    if not ref:
        return None
    if _resolve_receiver:
        resolved = _resolve_receiver(ref)
        if resolved:
            return resolved
    return ref


def _now_iso() -> str:
    return _now_utc().isoformat() if _now_utc else datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "ntf") -> str:
    return _gen_id(prefix) if _gen_id else f"{prefix}_{int(datetime.now().timestamp() * 1000)}"


def list_manager_recipient_ids() -> List[str]:
    """Employee IDs for admin + manager roles (notification receivers)."""
    rows = _sb_select("employees", {
        "role": "in.(admin,manager)",
        "active": "eq.true",
        "select": "employee_id,user_id",
    }) or []
    ids: List[str] = []
    for row in rows:
        for candidate in (row.get("employee_id"), row.get("user_id")):
            if candidate and candidate not in ids:
                ids.append(candidate)
    return ids


def get_user_preferences(user_id: str) -> Dict[str, bool]:
    rows = _sb_select("notification_preferences", {
        "user_id": f"eq.{user_id}",
        "select": "*",
        "limit": "1",
    }) or []
    if rows:
        return rows[0]
    return {
        "lead_assigned": True,
        "lead_updated": True,
        "comments": True,
        "housing_leads": True,
        "facebook_leads": True,
        "reminders": True,
        "marketing": True,
        "system_alerts": True,
        "push_enabled": True,
    }


def preference_allows(user_id: str, notification_type: str) -> bool:
    prefs = get_user_preferences(user_id)
    key = TYPE_TO_PREF.get(notification_type, "system_alerts")
    val = prefs.get(key, True)
    if val is False:
        return False
    return True


def _strip_nulls(data: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if v is not None}


def _persist_notification(n: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Insert notification — retries with core columns if extended schema is missing."""
    if not _sb_insert:
        return None

    full = _strip_nulls(n)
    result = _sb_insert("notifications", full)
    if result is not None:
        return result if isinstance(result, dict) else full

    logger.warning(
        "Notification full insert failed — retrying minimal columns user=%s type=%s",
        n.get("user_id"),
        n.get("type"),
    )
    minimal = _strip_nulls({
        "notification_id": n["notification_id"],
        "user_id": n["user_id"],
        "lead_id": n.get("lead_id"),
        "type": n.get("type", "workflow"),
        "title": n["title"],
        "message": n["message"],
        "is_read": False,
        "created_at": n.get("created_at"),
    })
    result = _sb_insert("notifications", minimal)
    if result is not None:
        merged = {**minimal, **(result if isinstance(result, dict) else {})}
        return merged

    logger.error(
        "Notification insert failed completely user=%s notification_id=%s",
        n.get("user_id"),
        n.get("notification_id"),
    )
    return None


def get_active_fcm_tokens(user_id: str) -> List[str]:
    """Collect FCM tokens for employee_id and linked user_id."""
    ids: List[str] = []
    for candidate in (user_id,):
        if candidate and candidate not in ids:
            ids.append(candidate)
    rows = _sb_select("employees", {
        "employee_id": f"eq.{user_id}",
        "select": "employee_id,user_id",
        "limit": "1",
    }) or []
    if not rows:
        rows = _sb_select("employees", {
            "user_id": f"eq.{user_id}",
            "select": "employee_id,user_id",
            "limit": "1",
        }) or []
    if rows:
        for candidate in (rows[0].get("employee_id"), rows[0].get("user_id")):
            if candidate and candidate not in ids:
                ids.append(candidate)

    tokens: List[str] = []
    for uid in ids:
        token_rows = _sb_select("fcm_device_tokens", {
            "user_id": f"eq.{uid}",
            "is_active": "eq.true",
            "select": "fcm_token",
        }) or []
        tokens.extend(r["fcm_token"] for r in token_rows if r.get("fcm_token"))
    return list(dict.fromkeys(tokens))


def enqueue_push_retry(
    notification_id: str,
    user_id: str,
    fcm_token: str,
    payload: Dict[str, Any],
    error: str,
) -> None:
    row = {
        "queue_id": _new_id("npq"),
        "notification_id": notification_id,
        "user_id": user_id,
        "fcm_token": fcm_token,
        "payload": payload,
        "attempts": 1,
        "last_error": error[:500] if error else None,
        "next_retry_at": _now_iso(),
        "created_at": _now_iso(),
    }
    _sb_insert("notification_push_queue", row)


def send_push_for_notification(
    user_id: str,
    notification_id: str,
    title: str,
    message: str,
    lead_id: Optional[str] = None,
    notification_type: str = TYPE_SYSTEM,
) -> None:
    if not fcm_configured():
        return
    prefs = get_user_preferences(user_id)
    if not prefs.get("push_enabled", True):
        return
    tokens = get_active_fcm_tokens(user_id)
    if not tokens:
        return
    data = {
        "notification_id": notification_id,
        "type": notification_type,
        "lead_id": lead_id or "",
        "url": f"/telecaller?openLead={lead_id}" if lead_id else "/notifications",
    }
    result = send_fcm_batch(tokens, title, message, data)
    for tok in result.get("failed_tokens") or []:
        enqueue_push_retry(notification_id, user_id, tok, data, "FCM send failed")


def create_notification(
    receiver_id: Optional[str],
    title: str,
    message: str,
    *,
    lead_id: Optional[str] = None,
    type_: str = TYPE_SYSTEM,
    sender_id: Optional[str] = None,
    priority: str = "normal",
    metadata: Optional[Dict[str, Any]] = None,
    skip_push: bool = False,
) -> Optional[Dict[str, Any]]:
    """Insert in-app notification and optionally send FCM push."""
    receiver_id = _canonical_receiver(receiver_id)
    if not receiver_id or not _sb_insert:
        return None
    if not preference_allows(receiver_id, type_):
        logger.debug("Notification skipped by preference user=%s type=%s", receiver_id, type_)
        return None

    n = {
        "notification_id": _new_id("ntf"),
        "user_id": receiver_id,
        "sender_id": sender_id,
        "lead_id": lead_id,
        "type": type_,
        "title": title,
        "message": message,
        "priority": priority,
        "metadata": metadata or {},
        "is_read": False,
        "read_at": None,
        "created_at": _now_iso(),
    }
    saved = _persist_notification(n)
    if not saved:
        return None
    if _session_cache is not None:
        _session_cache.setdefault("notifications", []).insert(0, saved)

    if not skip_push:
        try:
            send_push_for_notification(
                receiver_id,
                saved["notification_id"],
                title,
                message,
                lead_id=lead_id,
                notification_type=type_,
            )
        except Exception:
            logger.exception("Push send failed for notification %s", saved.get("notification_id"))

    return saved


def notify_lead_assigned(
    employee_id: str,
    lead: Dict[str, Any],
    *,
    sender_id: Optional[str] = None,
    is_reassign: bool = False,
) -> Optional[Dict[str, Any]]:
    name = lead.get("name") or "Customer"
    phone = lead.get("phone") or ""
    prop = lead.get("property_type") or lead.get("location") or ""
    budget = lead.get("budget") or ""
    lines = [f"You have been assigned a new customer.", "", name]
    if phone:
        lines.append(phone)
    if prop:
        lines.append(str(prop))
    if budget:
        lines.append(f"Budget: {budget}")
    lines.append("")
    lines.append("Tap to open.")
    return create_notification(
        employee_id,
        "🏠 New Lead Assigned" if not is_reassign else "🏠 New Lead Assigned",
        "\n".join(lines),
        lead_id=lead.get("lead_id"),
        type_=TYPE_LEAD_ASSIGNED,
        sender_id=sender_id,
        priority="high",
        metadata={"customer_name": name, "phone": phone},
    )


def notify_lead_removed(old_employee_id: str, lead: Dict[str, Any], sender_id: Optional[str] = None) -> None:
    create_notification(
        old_employee_id,
        "Lead Removed",
        "This lead has been reassigned to another team member.",
        lead_id=lead.get("lead_id"),
        type_=TYPE_LEAD_REMOVED,
        sender_id=sender_id,
        priority="normal",
    )


def notify_lead_updated_for_managers(
    lead: Dict[str, Any],
    employee_name: str,
    status_label: str,
    sender_id: Optional[str] = None,
) -> None:
    name = lead.get("name") or "Customer"
    msg = f"Employee:\n{employee_name}\n\nCustomer:\n{name}\n\nStatus:\n{status_label}"
    for mgr_id in list_manager_recipient_ids():
        create_notification(
            mgr_id,
            "Lead Updated",
            msg,
            lead_id=lead.get("lead_id"),
            type_=TYPE_LEAD_UPDATED,
            sender_id=sender_id,
            priority="normal",
            metadata={"employee": employee_name, "status": status_label},
        )


def notify_note_added(
    lead: Dict[str, Any],
    author_name: str,
    *,
    author_role: str,
    author_id: Optional[str],
    note_preview: str,
) -> None:
    lead_id = lead.get("lead_id")
    name = lead.get("name") or "Customer"
    preview = (note_preview or "")[:120]
    if author_role in MANAGER_ROLES:
        assignee = lead.get("assigned_to")
        if assignee:
            create_notification(
                assignee,
                "Manager Comment",
                f"{author_name} commented on {name}:\n{preview}",
                lead_id=lead_id,
                type_=TYPE_MANAGER_COMMENT,
                sender_id=author_id,
                priority="high",
            )
    else:
        for mgr_id in list_manager_recipient_ids():
            create_notification(
                mgr_id,
                "New Note Added",
                f"{author_name} added a note on {name}:\n{preview}",
                lead_id=lead_id,
                type_=TYPE_NOTE_ADDED,
                sender_id=author_id,
                priority="normal",
            )


def notify_integration_lead(source: str, lead: Dict[str, Any]) -> None:
    platform = (source or "").lower()
    if "facebook" in platform or platform == "meta":
        ntype = TYPE_FACEBOOK_LEAD
        title = "New Facebook Lead"
    elif "housing" in platform:
        ntype = TYPE_HOUSING_LEAD
        title = "New Housing Lead"
    else:
        return
    name = lead.get("name") or "New Lead"
    msg = f"Customer:\n{name}\n\nTap to assign."
    for mgr_id in list_manager_recipient_ids():
        create_notification(
            mgr_id,
            title,
            msg,
            lead_id=lead.get("lead_id"),
            type_=ntype,
            priority="high",
            metadata={"source": source},
        )


def notify_follow_up_reminder(employee_id: str, lead: Dict[str, Any], time_label: str) -> None:
    name = lead.get("name") or "Customer"
    create_notification(
        employee_id,
        "Follow-up Reminder",
        f"Customer:\n{name}\n\nTime:\n{time_label}",
        lead_id=lead.get("lead_id"),
        type_=TYPE_FOLLOW_UP_REMINDER,
        priority="high",
    )


def notify_follow_up_overdue(lead: Dict[str, Any], employee_name: str) -> None:
    name = lead.get("name") or "Customer"
    msg = f"Employee missed follow-up.\n\nEmployee: {employee_name}\nCustomer: {name}"
    for mgr_id in list_manager_recipient_ids():
        create_notification(
            mgr_id,
            "Follow-up Overdue",
            msg,
            lead_id=lead.get("lead_id"),
            type_=TYPE_FOLLOW_UP_OVERDUE,
            priority="high",
        )


def notify_lead_closed(lead: Dict[str, Any], employee_name: str, won: bool = True, reason: str = "") -> None:
    name = lead.get("name") or "Customer"
    if won:
        title = "Lead Closed Successfully"
        msg = f"Congratulations!\n\nLead Converted.\n\nCustomer: {name}\nClosed by: {employee_name}"
        ntype = TYPE_LEAD_WON
    else:
        title = "Lead Lost"
        msg = f"Customer: {name}\nReason: {reason or 'Not specified'}"
        ntype = TYPE_LEAD_LOST
    for mgr_id in list_manager_recipient_ids():
        create_notification(
            mgr_id,
            title,
            msg,
            lead_id=lead.get("lead_id"),
            type_=ntype,
            priority="normal" if won else "low",
        )


def broadcast_notification(title: str, message: str, *, sender_id: Optional[str] = None, priority: str = "normal") -> int:
    """Admin broadcast to all active employees."""
    rows = _sb_select("employees", {"active": "eq.true", "select": "employee_id"}) or []
    count = 0
    for row in rows:
        eid = row.get("employee_id")
        if eid and create_notification(
            eid,
            title,
            message,
            type_=TYPE_BROADCAST,
            sender_id=sender_id,
            priority=priority,
        ):
            count += 1
    return count
