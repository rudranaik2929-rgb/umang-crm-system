"""Which leads does the CRM hide? Read-only Supabase + the real filter code.

Fetches every row of `public.leads` straight from PostgREST and replays the
backend's own filter chain (`app/legacy_core.py`) over it, so the numbers here
match what `/api/leads` and the dashboard would return.
"""
import os
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / "frontend" / ".env")

# The hosted anon key is enough to read (RLS permits it); fall back to whatever
# service-role key is present so this also works locally.
URL = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "").rstrip("/") or os.environ["SUPABASE_URL"].rstrip("/")
KEY = (
    os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or ""
)
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
PAGE = 1000


def fetch_all(table: str, select: str = "*") -> list:
    out, offset = [], 0
    with httpx.Client(timeout=120) as c:
        while True:
            r = c.get(
                f"{URL}/rest/v1/{table}",
                headers=HEADERS,
                params={"select": select, "limit": PAGE, "offset": offset},
            )
            r.raise_for_status()
            batch = r.json()
            out.extend(batch)
            if len(batch) < PAGE:
                return out
            offset += PAGE


def main() -> None:
    from app import main as core

    print(f"Supabase: {URL}")
    rows = fetch_all("leads", core.LEADS_CANONICAL_SELECT)
    total = len(rows)
    print(f"\nTOTAL lead rows in database: {total}\n")

    # ---- Stage 1: the hard date gate ------------------------------------
    kept_date = [l for l in rows if core.lead_is_since_start(l)]
    dropped_date = [l for l in rows if not core.lead_is_since_start(l)]
    print(f"[1] lead_is_since_start(INTEGRATION_LEAD_START="
          f"{core.INTEGRATION_LEAD_START})")
    print(f"    kept    {len(kept_date)}")
    print(f"    DROPPED {len(dropped_date)}   <-- invisible everywhere")
    if dropped_date:
        print("    dropped by source:", dict(Counter(
            (l.get('source') or 'none') for l in dropped_date).most_common()))
        print("    dropped by enquiry year-month:", dict(Counter(
            str(core.lead_enquiry_ts(l))[:7] for l in dropped_date).most_common(12)))

    # ---- Stage 2: Meta fake-leadgen filter --------------------------------
    fake_meta = [l for l in kept_date
                 if core.classify_lead_platform(l.get("source")) == "meta"
                 and not core.is_real_meta_lead(l)]
    kept_date = [l for l in kept_date if l not in fake_meta]
    print(f"\n[2] is_real_meta_lead()")
    print(f"    DROPPED {len(fake_meta)}  (Facebook rows failing the real-leadgen check)")

    # ---- Stage 3: broker pool ---------------------------------------------
    broker = [l for l in kept_date if core.is_broker_pool_lead(l)]
    kept_date = [l for l in kept_date if not core.is_broker_pool_lead(l)]
    print(f"\n[3] is_broker_pool_lead()")
    print(f"    moved to broker pool {len(broker)}")

    # ---- Stage 4: external-id dedupe --------------------------------------
    deduped = core.dedupe_leads_by_external_id(kept_date)
    print(f"\n[4] dedupe_leads_by_external_id()")
    print(f"    collapsed {len(kept_date) - len(deduped)} duplicate rows")

    print(f"\n=> VISIBLE pipeline leads: {len(deduped)} / {total} in database "
          f"({100.0 * len(deduped) / total:.1f}%)")
    print(f"=> HIDDEN:                 {total - len(deduped)}")

    # ---- Status / stage breakdown of the hidden ones ----------------------
    hidden = [l for l in rows if l not in deduped]
    print("\nHidden rows by status:", dict(Counter(
        (l.get('status') or 'none') for l in hidden).most_common()))
    print("Hidden rows by stage :", dict(Counter(
        (l.get('stage') or 'none') for l in hidden).most_common()))
    print("Visible rows by source:", dict(Counter(
        (l.get('source') or 'none') for l in deduped).most_common()))
    print("Visible rows by status:", dict(Counter(
        (l.get('status') or 'none') for l in deduped).most_common()))


if __name__ == "__main__":
    main()
