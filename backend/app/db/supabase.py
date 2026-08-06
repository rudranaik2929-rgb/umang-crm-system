"""Supabase PostgREST client helpers."""
import logging
import time
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


_sb_columns_cache: Dict[str, bool] = {}


def sb_columns_exist(table: str, columns: List[str], ttl_sec: int = 300) -> bool:
    """Check (cached) that every column exists on the table via a probe SELECT."""
    key = f"{table}:{','.join(sorted(columns))}"
    cached = _sb_columns_cache.get(key)
    if cached and time.time() - cached[0] < ttl_sec:
        return cached[1]
    r = _http.get(
        sb_url(table),
        headers=sb_headers(),
        params={"select": ",".join(columns), "limit": "1"},
    )
    ok = r.status_code < 400
    _sb_columns_cache[key] = (time.time(), ok)
    if not ok:
        logging.warning(f"Supabase columns missing on {table} {columns}: {r.status_code} {r.text[:200]}")
    return ok


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


def sb_storage_url(bucket: str, path: str) -> str:
    clean_path = path.lstrip("/")
    return f"{SUPABASE_URL}/storage/v1/object/{bucket}/{clean_path}"


def sb_storage_upload(bucket: str, path: str, content: bytes, content_type: str, upsert: bool = True) -> bool:
    """Upload a file to Supabase Storage using the service role key."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        logging.error("Supabase storage upload skipped — URL or key not configured")
        return False
    clean_path = path.lstrip("/")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type or "application/octet-stream",
    }
    if upsert:
        headers["x-upsert"] = "true"
    r = _http.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{clean_path}",
        headers=headers,
        content=content,
    )
    if r.status_code >= 400:
        logging.error(f"Supabase storage upload {bucket}/{clean_path}: {r.status_code} {r.text[:300]}")
        return False
    return True


def sb_storage_download(bucket: str, path: str) -> Optional[Tuple[bytes, str]]:
    """Download a file from Supabase Storage. Returns (bytes, content_type) or None."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    clean_path = path.lstrip("/")
    r = _http.get(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{clean_path}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    if r.status_code >= 400:
        logging.error(f"Supabase storage download {bucket}/{clean_path}: {r.status_code} {r.text[:300]}")
        return None
    content_type = r.headers.get("content-type") or "application/octet-stream"
    return r.content, content_type


def sb_storage_delete(bucket: str, path: str) -> bool:
    """Remove a file from Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False
    clean_path = path.lstrip("/")
    r = _http.delete(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{clean_path}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    if r.status_code >= 400:
        logging.error(f"Supabase storage delete {bucket}/{clean_path}: {r.status_code} {r.text[:300]}")
        return False
    return True


def sb_storage_signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
    """Create a short-lived signed URL for private bucket objects."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    clean_path = path.lstrip("/")
    r = _http.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{clean_path}",
        headers={
            **sb_headers(),
            "Content-Type": "application/json",
        },
        json={"expiresIn": expires_in},
    )
    if r.status_code >= 400:
        logging.error(f"Supabase storage sign {bucket}/{clean_path}: {r.status_code} {r.text[:300]}")
        return None
    try:
        payload = r.json()
    except Exception:
        return None
    signed = payload.get("signedURL") or payload.get("signedUrl")
    if not signed:
        return None
    if signed.startswith("http"):
        return signed
    return f"{SUPABASE_URL}{signed}" if signed.startswith("/") else f"{SUPABASE_URL}/storage/v1{signed}"


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
    "sb_columns_exist",
    "sb_insert",
    "sb_insert_many",
    "sb_update",
    "sb_upsert",
    "sb_delete",
    "sb_delete_filter",
    "sb_patch_filter",
    "sb_select_in",
    "sb_storage_url",
    "sb_storage_upload",
    "sb_storage_download",
    "sb_storage_delete",
    "sb_storage_signed_url",
]
