"""In-memory stand-in for the Supabase PostgREST client.

The backend talks to Supabase through a thin set of helpers in
``app/db/supabase.py`` (``sb_select``, ``sb_insert``, ``sb_update``, ...). The
helpers build PostgREST query params such as ``{"user_id": "eq.emp_1",
"order": "created_at.desc", "limit": "500"}``.

This module reimplements that same surface against a plain dict of tables so
the whole API can be exercised with ``fastapi.testclient.TestClient`` without
network access and without writing anything to production.

It deliberately mirrors real PostgREST semantics:

* every filter parameter is ANDed together;
* ``select`` projects columns (``*`` means all);
* ``order`` honours ``.asc`` / ``.desc`` / ``.nullslast``;
* ``limit`` / ``offset`` paginate;
* missing tables behave like a table that does not exist, i.e. SELECT returns
  an error which the real client converts to ``[]``.

Only the query forms the backend actually emits are implemented — see
``app/legacy_core.py`` for the call sites.
"""

from __future__ import annotations

import copy
import re
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple

from app import main as core


# Table -> list of row dicts. Row order is insertion order, which is what a
# fresh Postgres table plus `order=created_at.desc` gives us in practice.
_tables: Dict[str, List[Dict[str, Any]]] = {}
_lock = threading.RLock()

# Tables the fake refuses to serve, so tests can assert the "column missing"
# / "table missing" fallbacks. `None` means "serve everything".
_missing_tables: set = set()
_columns_exist_override: Dict[str, bool] = {}


def reset(seed: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> None:
    """Clear all rows and optionally seed tables."""
    with _lock:
        _tables.clear()
        _missing_tables.clear()
        _columns_exist_override.clear()
        for table, rows in (seed or {}).items():
            _tables[table] = [copy.deepcopy(r) for r in rows]


def table(name: str) -> List[Dict[str, Any]]:
    """Direct access to a table's rows, for assertions."""
    with _lock:
        return _tables.setdefault(name, [])


def rows(name: str) -> List[Dict[str, Any]]:
    return [copy.deepcopy(r) for r in table(name)]


def set_missing_tables(*names: str) -> None:
    with _lock:
        _missing_tables.update(names)


def set_columns_exist(table_name: str, value: bool) -> None:
    with _lock:
        _columns_exist_override[table_name] = value


# --------------------------------------------------------------------------
# PostgREST filter parsing
# --------------------------------------------------------------------------

def _split_top_level(text: str) -> List[str]:
    """Split on commas that are not inside quotes or parentheses."""
    out: List[str] = []
    buf: List[str] = []
    depth = 0
    in_quote = False
    for ch in text:
        if ch == '"':
            in_quote = not in_quote
        if not in_quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "," and depth == 0:
                out.append("".join(buf))
                buf = []
                continue
        buf.append(ch)
    if buf:
        out.append("".join(buf))
    return [s.strip() for s in out if s.strip()]


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1].replace('\\"', '"')
    return value


def _cmp(op: str, left: Any, right: Any) -> bool:
    """PostgREST comparison with None ordering (NULLs sort last for lt/gt)."""
    if op == "eq":
        return left == right
    if op == "neq":
        # PostgREST `neq` excludes NULLs; every row here carries a status.
        return left is not None and left != right
    if left is None or right is None:
        return False
    try:
        if op == "lt":
            return left < right
        if op == "lte":
            return left <= right
        if op == "gt":
            return left > right
        if op == "gte":
            return left >= right
    except TypeError:
        return str(left) < str(right)
    return False


def _match_condition(row: Dict[str, Any], column: str, expr: str) -> bool:
    op, _, raw = expr.partition(".")
    op = op.lower()
    raw = raw.strip()

    if op == "is":
        want_null = raw.lower() == "null"
        return (row.get(column) is None) == want_null

    if op == "not":
        # PostgREST `not.<op>.<value>`, e.g. `not.is.null` (column IS NOT NULL).
        return not _match_condition(row, column, raw)

    if op == "in":
        inner = raw.strip()
        if inner.startswith("(") and inner.endswith(")"):
            inner = inner[1:-1]
        wanted = [_unquote(v) for v in _split_top_level(inner)]
        return row.get(column) in wanted

    if op in ("like", "ilike"):
        pattern = _unquote(raw).replace("%", "")
        actual = row.get(column)
        if actual is None:
            return False
        actual = str(actual)
        return pattern.lower() in actual.lower() if op == "ilike" else pattern in actual

    value = _unquote(raw)
    actual = row.get(column)

    if op == "eq":
        # PostgREST eq. against a text column should still match numeric input.
        return actual == value or (actual is not None and str(actual) == value)

    return _cmp(op, actual, value)


def _match_or(row: Dict[str, Any], expr: str) -> bool:
    body = expr.strip()
    if body.startswith("(") and body.endswith(")"):
        body = body[1:-1]
    return any(_match_condition(row, col, val) for col, val in (
        (part.split(".", 1)[0].strip(), part.split(".", 1)[1].strip())
        for part in _split_top_level(body) if "." in part
    ))


def _matches(row: Dict[str, Any], params: Dict[str, Any]) -> bool:
    for key, value in (params or {}).items():
        if key in ("select", "order", "limit", "offset", "on_conflict"):
            continue
        if key == "or":
            if not _match_or(row, str(value)):
                return False
            continue
        if not _match_condition(row, key, str(value)):
            return False
    return True


def _project(row: Dict[str, Any], select: Optional[str]) -> Dict[str, Any]:
    if not select or select.strip() == "*":
        return dict(row)
    return {col.strip(): row.get(col.strip()) for col in select.split(",") if col.strip()}


def _sort(rows: List[Dict[str, Any]], order: Optional[str]) -> List[Dict[str, Any]]:
    if not order:
        return rows
    # Postgres orders NULLs last for ASC by default; PostgREST exposes that with
    # `.nullslast`. Honour both so ordering assertions match production.
    nulls_last = "nullslast" in order
    clauses = [c.strip() for c in order.split(",") if c.strip()]
    keyed = list(rows)
    for clause in reversed(clauses):
        parts = clause.split(".")
        column = parts[0].strip()
        desc = "desc" in parts[1:]
        nulls_last = "nullslast" in parts[1:] or nulls_last
        keyed.sort(
            key=lambda r, c=column: (r.get(c) is None, r.get(c)),
            reverse=desc,
        )
    if nulls_last:
        keyed.sort(key=lambda r: r.get(column) is None)
    return keyed


def _query(table_name: str, params: Optional[dict]) -> List[Dict[str, Any]]:
    with _lock:
        if table_name in _missing_tables:
            return []
        source = _tables.setdefault(table_name, [])
        rows = [r for r in source if _matches(r, params or {})]
        rows = _sort(rows, (params or {}).get("order"))
        limit = (params or {}).get("limit")
        offset = (params or {}).get("offset")
        if offset:
            try:
                rows = rows[int(offset):]
            except (TypeError, ValueError):
                pass
        if limit:
            try:
                rows = rows[: int(limit)]
            except (TypeError, ValueError):
                pass
        select = (params or {}).get("select")
        return [_project(r, select) for r in rows]


# --------------------------------------------------------------------------
# sb_* replacements
# --------------------------------------------------------------------------

def fake_sb_select(table_name: str, params: Optional[dict] = None) -> list:
    return _query(table_name, params)


def fake_sb_select_parallel(specs: Dict[str, Tuple[str, Optional[dict]]]) -> Dict[str, list]:
    return {key: _query(t, p) for key, (t, p) in (specs or {}).items()}


def fake_sb_select_in(table_name: str, column: str, values: List[str], params: Optional[dict] = None):
    out: List[Dict[str, Any]] = []
    clean = [v for v in (values or []) if v]
    for chunk in (clean[i:i + 100] for i in range(0, len(clean), 100)):
        out.extend(_query(table_name, {**(params or {}), column: f"in.({','.join(chunk)})"}))
    return out


def fake_sb_insert(table_name: str, data: Any) -> Optional[Dict[str, Any]]:
    with _lock:
        row = copy.deepcopy(data)
        table(table_name).append(row)
        return copy.deepcopy(row)


def fake_sb_insert_many(table_name: str, data: List[Any], chunk_size: int = 40) -> List[Dict[str, Any]]:
    with _lock:
        inserted = []
        for item in data or []:
            row = copy.deepcopy(item)
            table(table_name).append(row)
            inserted.append(copy.deepcopy(row))
        return inserted


def fake_sb_update(table_name: str, pk_col: str, pk_val: Any, data: dict):
    with _lock:
        for row in table(table_name):
            if str(row.get(pk_col)) == str(pk_val):
                row.update(copy.deepcopy(data or {}))
                return copy.deepcopy(row)
        return None


def fake_sb_upsert(table_name: str, data: Dict[str, Any], on_conflict: str = "employee_id"):
    with _lock:
        for row in table(table_name):
            if str(row.get(on_conflict)) == str(data.get(on_conflict)):
                row.update(copy.deepcopy(data))
                return copy.deepcopy(row)
        row = copy.deepcopy(data)
        table(table_name).append(row)
        return copy.deepcopy(row)


def fake_sb_delete(table_name: str, pk_col: str, pk_val: Any) -> bool:
    with _lock:
        before = len(table(table_name))
        kept = [r for r in table(table_name) if str(r.get(pk_col)) != str(pk_val)]
        _tables[table_name] = kept
        return len(kept) < before


def fake_sb_delete_filter(table_name: str, params: Optional[dict] = None) -> bool:
    with _lock:
        before = len(table(table_name))
        _tables[table_name] = [r for r in table(table_name) if not _matches(r, params or {})]
        return True


def fake_sb_patch_filter(table_name: str, match_params: str, data: Dict[str, Any]) -> Optional[str]:
    """`match_params` arrives as a raw query string, e.g. `employee_id=eq.emp_1`."""
    parsed: Dict[str, str] = {}
    for pair in (match_params or "").split("&"):
        if "=" in pair:
            key, _, value = pair.partition("=")
            parsed[key] = value
    with _lock:
        for row in table(table_name):
            if _matches(row, parsed):
                row.update(copy.deepcopy(data or {}))
    return None


def fake_sb_columns_exist(table_name: str, columns: List[str], ttl_sec: int = 300) -> bool:
    with _lock:
        if table_name in _columns_exist_override:
            return _columns_exist_override[table_name]
        if table_name in _missing_tables:
            return False
        rows = _tables.get(table_name)
        if not rows:
            # An empty table still has its columns in Postgres; only a missing
            # table makes the probe fail.
            return True
        return all(c in rows[0] for c in columns)


# Names in app/legacy_core.py's flat namespace, thanks to the star-import.
_SB_FUNCTIONS = {
    "sb_select": fake_sb_select,
    "sb_select_parallel": fake_sb_select_parallel,
    "sb_select_in": fake_sb_select_in,
    "sb_insert": fake_sb_insert,
    "sb_insert_many": fake_sb_insert_many,
    "sb_update": fake_sb_update,
    "sb_upsert": fake_sb_upsert,
    "sb_delete": fake_sb_delete,
    "sb_delete_filter": fake_sb_delete_filter,
    "sb_patch_filter": fake_sb_patch_filter,
    "sb_columns_exist": fake_sb_columns_exist,
}


def install(monkeypatch) -> None:
    """Point every sb_* helper at the in-memory tables.

    ``app.notification_service`` captured the real helpers into private module
    globals (``_sb_insert`` & co.) via ``configure()`` at import time, so patching
    ``core.sb_*`` alone leaves it talking to the network. Re-point those too.
    """
    for name, impl in _SB_FUNCTIONS.items():
        monkeypatch.setattr(core, name, impl)
    silence_notifications(monkeypatch)


def silence_notifications(monkeypatch) -> None:
    """Re-point notification_service's captured sb_* globals at inert stubs.

    Any test that installs its own sb_* fake (rather than ``install()``) must
    call this too, or notifications will try to reach the network.
    """
    from app import notification_service as notify_svc

    def _select(table, params=None):
        return []

    def _insert(table, data):
        return dict(data) if isinstance(data, dict) else data

    def _update(table, pk_col, pk_val, data):
        return dict(data)

    for private, impl in (
        ("_sb_insert", _insert),
        ("_sb_select", _select),
        ("_sb_update", _update),
        ("_sb_delete", lambda *a, **k: True),
    ):
        monkeypatch.setattr(notify_svc, private, impl, raising=False)


def reset_runtime_caches() -> None:
    """Drop every process-local cache so tests cannot leak state into each other."""
    core.flush_all_runtime_caches()
    core.SESSION_CACHE.update({k: [] for k in core.SESSION_CACHE})
    for cache in (
        getattr(core, "_employees_cache", None),
        getattr(core, "_user_profile_cache", None),
        getattr(core, "_assignment_stats_cache", None),
        getattr(core, "_employee_stats_cache", None),
        getattr(core, "_dashboard_stats_cache", None),
        getattr(core, "_graph_cache", None),
    ):
        if isinstance(cache, dict):
            if "ts" in cache:
                cache["ts"] = 0.0
                cache["data"] = None
            else:
                cache.clear()
    for setter in ("_LEGACY_NOTIFICATION_MIGRATED",):
        bucket = getattr(core, setter, None)
        if isinstance(bucket, set):
            bucket.clear()
