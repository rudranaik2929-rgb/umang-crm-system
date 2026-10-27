"""Team Lead / region ownership and per-request lead scoping.

Ownership chain for every lead:

    Admin pool  ->  Team Lead (leads.team_lead_id)  ->  Employee (leads.assigned_to)

* Admin pool:      team_lead_id empty AND no assigned employee.
* Team Lead pool:  team_lead_id set, no assigned employee.
* Employee:        assigned_to set. The employee's team lead owns it.

A lead with no team_lead_id but an assigned employee belongs to that employee's
team lead. That covers every lead assigned before team leads existed, so after
the migration no lead drops out of every team's view.

Scoping: a Team Lead request sets ``_TEAM_SCOPE`` (see ``legacy_core.get_current_user``);
``fetch_all_leads_merged`` and the employee lists then return only that team's rows.
Admin requests and background threads are never scoped.
"""
import contextvars
import logging
import re
import threading
import time
from typing import Any, Callable, Dict, Iterable, List, Optional

from app.db.supabase import sb_columns_exist, sb_select

TEAM_LEAD_ROLE = "team_lead"
LEGACY_MANAGER_ROLE = "manager"
ALL_REGIONS = "*"
# Team Lead login without an employee profile: scoped to nothing rather than everything.
NO_TEAM = "__no_team__"

LEAD_TEAM_COLUMNS = ["team_lead_id", "team_lead_assigned_at", "team_lead_assigned_by"]
EMPLOYEE_TEAM_COLUMNS = ["team_lead_id", "regions"]

_DIRECTORY_TTL_SEC = 30.0


def normalize_role(role: Optional[str]) -> str:
    """'manager' rows (pre-migration) behave exactly like 'team_lead'."""
    r = (role or "").strip().lower()
    return TEAM_LEAD_ROLE if r == LEGACY_MANAGER_ROLE else r


def is_team_lead_role(role: Optional[str]) -> bool:
    return normalize_role(role) == TEAM_LEAD_ROLE


def _columns_ready(table: str, columns: List[str]) -> bool:
    # A network error while probing must not break lead handling: report "not
    # ready" and let the caller fall back to the pre-migration behaviour.
    try:
        return bool(sb_columns_exist(table, columns))
    except Exception as exc:  # pragma: no cover - network
        logging.warning("column probe failed for %s: %s", table, exc)
        return False


def lead_team_columns_ready() -> bool:
    return _columns_ready("leads", LEAD_TEAM_COLUMNS)


def employee_team_columns_ready() -> bool:
    return _columns_ready("employees", EMPLOYEE_TEAM_COLUMNS)


def regions_table_ready() -> bool:
    return _columns_ready("regions", ["region_id", "name", "keywords", "active"])


def _clean(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", _clean(value).lower())


def coerce_regions(value: Any) -> List[str]:
    """jsonb / JSON string / list / comma text -> clean region names. ['*'] = all regions."""
    import json

    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            value = parsed if isinstance(parsed, list) else [text]
        except (ValueError, TypeError):
            value = [p for p in text.split(",")]
    if not isinstance(value, (list, tuple)):
        return []
    out: List[str] = []
    for item in value:
        name = _clean(item)
        if name and name not in out:
            out.append(name)
    if ALL_REGIONS in out:
        return [ALL_REGIONS]
    return out


class TeamDirectory:
    """Snapshot of employees with team membership and assignee resolution."""

    def __init__(
        self,
        employees: List[Dict[str, Any]],
        fuzzy_matcher: Optional[Callable[[Dict[str, Any], Dict[str, Any]], bool]] = None,
    ):
        self.employees = [e for e in employees if e.get("employee_id")]
        self.by_id: Dict[str, Dict[str, Any]] = {e["employee_id"]: e for e in self.employees}
        self._fuzzy = fuzzy_matcher
        self._exact: Dict[str, str] = {}
        for e in self.employees:
            eid = e["employee_id"]
            for value in (eid, e.get("user_id"), e.get("name")):
                key = _norm(value)
                if key:
                    self._exact.setdefault(key, eid)
        self._assignee_memo: Dict[str, Optional[str]] = {}
        self._lock = threading.Lock()

    # ---- membership ----
    def team_leads(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        return [
            e for e in self.employees
            if is_team_lead_role(e.get("role")) and (include_inactive or e.get("active", True) is not False)
        ]

    def is_team_lead(self, employee_id: Optional[str]) -> bool:
        e = self.by_id.get(_clean(employee_id))
        return bool(e and is_team_lead_role(e.get("role")))

    def team_lead_of_employee(self, employee_id: Optional[str]) -> Optional[str]:
        e = self.by_id.get(_clean(employee_id))
        if not e:
            return None
        if is_team_lead_role(e.get("role")):
            return e["employee_id"]
        return _clean(e.get("team_lead_id")) or None

    def team_member_ids(self, team_lead_id: Optional[str], include_lead: bool = True) -> List[str]:
        tl = _clean(team_lead_id)
        if not tl:
            return []
        ids = [
            e["employee_id"] for e in self.employees
            if _clean(e.get("team_lead_id")) == tl and e["employee_id"] != tl
        ]
        if include_lead and tl in self.by_id:
            ids.insert(0, tl)
        return ids

    # ---- lead ownership ----
    def employee_for_assignee(self, assigned_to: Any) -> Optional[str]:
        raw = _clean(assigned_to)
        if not raw:
            return None
        with self._lock:
            if raw in self._assignee_memo:
                return self._assignee_memo[raw]
        found = self._exact.get(_norm(raw))
        if not found and self._fuzzy is not None:
            probe = {"assigned_to": raw}
            for e in self.employees:
                try:
                    if self._fuzzy(probe, e):
                        found = e["employee_id"]
                        break
                except Exception:  # pragma: no cover - defensive
                    continue
        with self._lock:
            self._assignee_memo[raw] = found
        return found

    def lead_team_lead_id(self, lead: Dict[str, Any]) -> Optional[str]:
        explicit = _clean(lead.get("team_lead_id"))
        if explicit:
            return explicit
        eid = self.employee_for_assignee(lead.get("assigned_to"))
        return self.team_lead_of_employee(eid) if eid else None

    def lead_in_admin_pool(self, lead: Dict[str, Any]) -> bool:
        return not _clean(lead.get("assigned_to")) and not _clean(lead.get("team_lead_id"))


_fuzzy_matcher: Optional[Callable[[Dict[str, Any], Dict[str, Any]], bool]] = None
_directory_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_directory_lock = threading.Lock()


def set_assignee_matcher(fn: Callable[[Dict[str, Any], Dict[str, Any]], bool]) -> None:
    """legacy_core injects lead_assigned_to_employee (Excel first-name matching etc.)."""
    global _fuzzy_matcher
    _fuzzy_matcher = fn
    invalidate_team_directory()


def employee_select_columns() -> str:
    base = "employee_id,name,email,phone,role,department,location,active,user_id"
    if employee_team_columns_ready():
        base += ",team_lead_id,regions"
    return base


def get_team_directory(force: bool = False) -> TeamDirectory:
    now = time.time()
    with _directory_lock:
        cached = _directory_cache.get("data")
        if not force and cached is not None and (now - float(_directory_cache["ts"])) < _DIRECTORY_TTL_SEC:
            return cached
    try:
        rows = sb_select("employees", {"select": employee_select_columns(), "order": "name.asc"}) or []
    except Exception as exc:  # pragma: no cover - network
        logging.warning("team directory load failed: %s", exc)
        # Serve the last good snapshot; never cache a failure.
        return cached if cached is not None else TeamDirectory([], _fuzzy_matcher)
    for row in rows:
        row["role"] = normalize_role(row.get("role"))
        row["regions"] = coerce_regions(row.get("regions"))
    directory = TeamDirectory(rows, _fuzzy_matcher)
    with _directory_lock:
        # Never replace a good directory with an empty one from a failed read.
        if rows or cached is None:
            _directory_cache.update({"ts": now, "data": directory})
        else:
            logging.warning("team directory refresh returned no employees; keeping previous snapshot")
            directory = cached
    return directory


def invalidate_team_directory() -> None:
    with _directory_lock:
        _directory_cache.update({"ts": 0.0, "data": None})


# ---- per-request scope ----
_TEAM_SCOPE: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("team_scope", default=None)


def set_request_team_scope(team_lead_id: Optional[str]) -> None:
    _TEAM_SCOPE.set(team_lead_id)


def current_team_scope() -> Optional[str]:
    """Team Lead employee_id for a scoped request, NO_TEAM, or None (unscoped)."""
    return _TEAM_SCOPE.get()


def push_team_scope(team_lead_id: Optional[str]) -> contextvars.Token:
    """Temporarily change the scope (e.g. read every lead inside an admin action).
    Always pair with pop_team_scope(token) in a finally block."""
    return _TEAM_SCOPE.set(team_lead_id)


def pop_team_scope(token: contextvars.Token) -> None:
    _TEAM_SCOPE.reset(token)


def scope_leads(rows: List[Dict[str, Any]], team_lead_id: Optional[str] = None) -> List[Dict[str, Any]]:
    tl = team_lead_id if team_lead_id is not None else current_team_scope()
    if tl is None:
        return rows
    if tl == NO_TEAM:
        return []
    directory = get_team_directory()
    return [l for l in rows if directory.lead_team_lead_id(l) == tl]


def lead_in_scope(lead: Dict[str, Any], team_lead_id: Optional[str] = None) -> bool:
    return bool(scope_leads([lead], team_lead_id))


def scope_employees(rows: Iterable[Dict[str, Any]], team_lead_id: Optional[str] = None) -> List[Dict[str, Any]]:
    tl = team_lead_id if team_lead_id is not None else current_team_scope()
    rows = list(rows)
    if tl is None:
        return rows
    if tl == NO_TEAM:
        return []
    members = set(get_team_directory().team_member_ids(tl))
    return [e for e in rows if e.get("employee_id") in members]


def scope_cache_key() -> str:
    tl = current_team_scope()
    return "all" if tl is None else f"team:{tl}"


__all__ = [
    "TEAM_LEAD_ROLE",
    "LEGACY_MANAGER_ROLE",
    "ALL_REGIONS",
    "NO_TEAM",
    "LEAD_TEAM_COLUMNS",
    "EMPLOYEE_TEAM_COLUMNS",
    "normalize_role",
    "is_team_lead_role",
    "lead_team_columns_ready",
    "employee_team_columns_ready",
    "regions_table_ready",
    "coerce_regions",
    "TeamDirectory",
    "set_assignee_matcher",
    "employee_select_columns",
    "get_team_directory",
    "invalidate_team_directory",
    "set_request_team_scope",
    "current_team_scope",
    "push_team_scope",
    "pop_team_scope",
    "scope_leads",
    "lead_in_scope",
    "scope_employees",
    "scope_cache_key",
]
