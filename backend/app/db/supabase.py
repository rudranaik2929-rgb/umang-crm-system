"""Supabase PostgREST client helpers."""
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config.settings import SUPABASE_KEY, SUPABASE_URL

_http = httpx.Client(timeout=60, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))
_read_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="sb-read")


def sb_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def sb_url(table: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{table}"


def sb_select(table: str, params: Optional[dict] = None) -> list:
    r = _http.get(sb_url(table), headers=sb_headers(), params=params or {})
    if r.status_code >= 400:
        logging.error(f"Supabase SELECT {table}: {r.status_code} {r.text[:300]}")
    return r.json() if r.status_code < 400 else []


def sb_select_parallel(specs: Dict[str, Tuple[str, Optional[dict]]]) -> Dict[str, list]:
    """Run multiple sb_select calls concurrently. specs: key -> (table, params)."""
    futures = {
        key: _read_pool.submit(sb_select, table, params)
        for key, (table, params) in specs.items()
    }
    out: Dict[str, list] = {}
    for key, fut in futures.items():
        try:
            out[key] = fut.result()
        except Exception as exc:  # pragma: no cover - defensive
            logging.error(f"Supabase parallel SELECT {key}: {exc}")
            out[key] = []
    return out


def sb_insert(table: str, data: Any):
    h = {**sb_headers(), "Prefer": "return=representation"}
    r = _http.post(sb_url(table), headers=h, json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase INSERT {table}: {r.status_code} {r.text[:300]}")
        return None
    if not r.text or not r.text.strip():
        return data
    try:
        rows = r.json()
        return rows[0] if isinstance(rows, list) and rows else rows
    except Exception:
        return data


def sb_insert_many(table: str, rows: List[Dict[str, Any]], chunk_size: int = 40) -> List[Dict[str, Any]]:
    """Batch insert — much faster than one HTTP call per row (Excel import)."""
    if not rows:
        return []
    h = {**sb_headers(), "Prefer": "return=representation"}
    inserted: List[Dict[str, Any]] = []
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        r = _http.post(sb_url(table), headers=h, json=chunk)
        if r.status_code >= 400:
            logging.error(f"Supabase INSERT MANY {table}: {r.status_code} {r.text[:300]}")
            for row in chunk:
                one = sb_insert(table, row)
                if one:
                    inserted.append(one)
            continue
        try:
            payload = r.json()
            if isinstance(payload, list):
                inserted.extend(payload)
            elif isinstance(payload, dict):
                inserted.append(payload)
        except Exception:
            inserted.extend(chunk)
    return inserted


def sb_update(table: str, pk_col: str, pk_val: Any, data: dict):
    h = {**sb_headers(), "Prefer": "return=representation"}
    r = _http.patch(f"{sb_url(table)}?{pk_col}=eq.{pk_val}", headers=h, json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase UPDATE {table}: {r.status_code} {r.text[:300]}")
        return None
    if not r.text or not r.text.strip():
        return {pk_col: pk_val, **data}
    try:
        rows = r.json()
        if isinstance(rows, list):
            return rows[0] if rows else None
        return rows if isinstance(rows, dict) else None
    except Exception:
        return {pk_col: pk_val, **data}


def sb_upsert(table: str, data: Dict[str, Any], on_conflict: str = "employee_id"):
    """Insert or update a single row (PostgREST merge-duplicates on conflict key)."""
    h = {
        **sb_headers(),
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    r = _http.post(
        sb_url(table),
        headers=h,
        params={"on_conflict": on_conflict},
        json=data,
    )
    if r.status_code >= 400:
        logging.error(f"Supabase UPSERT {table}: {r.status_code} {r.text[:300]}")
        return None
    if not r.text or not r.text.strip():
        return data
    try:
        rows = r.json()
        return rows[0] if isinstance(rows, list) and rows else rows
    except Exception:
        return data


def sb_delete(table: str, pk_col: str, pk_val: Any) -> bool:
    r = _http.delete(f"{sb_url(table)}?{pk_col}=eq.{pk_val}", headers=sb_headers())
    return r.status_code < 400


def sb_delete_filter(table: str, params: Optional[dict] = None) -> bool:
    """Bulk delete rows matching PostgREST filters (e.g. created_at=lt.{iso})."""
    r = _http.delete(sb_url(table), headers=sb_headers(), params=params or {})
    if r.status_code >= 400:
        logging.error(f"Supabase DELETE {table}: {r.status_code} {r.text[:300]}")
    return r.status_code < 400


def sb_patch_filter(table: str, match_params: str, data: Dict[str, Any]) -> Optional[str]:
    """PATCH rows matching PostgREST filter. Returns error text or None."""
    h = {**sb_headers(), "Prefer": "return=minimal"}
    r = _http.patch(f"{sb_url(table)}?{match_params}", headers=h, json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase PATCH {table}: {r.status_code} {r.text[:300]}")
        return f"{table}: {r.status_code} {r.text[:200]}"
    return None


def sb_select_in(
    table: str,
    col: str,
    values: List[Any],
    extra_params: Optional[dict] = None,
    chunk_size: int = 120,
) -> List[Dict[str, Any]]:
    """Fetch rows where col is in values — chunked to stay within URL limits."""
    clean = [v for v in values if v is not None and str(v).strip()]
    if not clean:
        return []
    rows: List[Dict[str, Any]] = []
    for i in range(0, len(clean), chunk_size):
        chunk = clean[i : i + chunk_size]
        if len(chunk) == 1:
            filt = f"eq.{chunk[0]}"
        else:
            filt = f"in.({','.join(str(v) for v in chunk)})"
        params = {**(extra_params or {}), col: filt}
        rows.extend(sb_select(table, params))
    return rows


__all__ = [
    "_http",
    "_read_pool",
    "sb_headers",
    "sb_url",
    "sb_select",
    "sb_select_parallel",
    "sb_insert",
    "sb_insert_many",
    "sb_update",
    "sb_upsert",
    "sb_delete",
    "sb_delete_filter",
    "sb_patch_filter",
    "sb_select_in",
]
