"""Resync Housing.com leads for a date range without creating duplicates.

Uses the same import pipeline as production (`create_integrated_lead`) which now
dedupes on the composite key phone + property_project_id + lead_date — so re-running
this command over an already-imported window only reports duplicates, never rewrites
existing leads and never inserts a second row for the same enquiry.

Usage (run from the backend/ directory so `app` is importable):

    python3 scripts/resync_housing.py --start 2026-08-07 --end 2026-08-07
    python3 scripts/resync_housing.py --start 2026-08-07 --end 2026-08-07 --dry-run
    python3 scripts/resync_housing.py --hours 24
"""
import argparse
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app import legacy_core as core  # noqa: E402
from app.config import settings  # noqa: E402

APP_TZ = core.APP_TZ


def parse_day(value: str) -> datetime:
    dt = datetime.strptime(value.strip(), "%Y-%m-%d")
    return dt.replace(tzinfo=APP_TZ)


def main() -> int:
    ap = argparse.ArgumentParser(description="Resync Housing.com leads (composite dedupe).")
    ap.add_argument("--start", help="Start date YYYY-MM-DD (IST). Default: today.")
    ap.add_argument("--end", help="End date YYYY-MM-DD (IST). Default: today.")
    ap.add_argument("--hours", type=int, help="Alternative: pull the last N hours.")
    ap.add_argument("--dry-run", action="store_true", help="Fetch and count only; insert nothing.")
    ap.add_argument("--out", help="Write JSON report to this file.")
    args = ap.parse_args()

    if not settings.HOUSING_PROFILE_ID or not settings.HOUSING_ENCRYPTION_KEY:
        print("ERROR: set HOUSING_PROFILE_ID and HOUSING_ENCRYPTION_KEY in backend/.env")
        return 1

    now = datetime.now(APP_TZ)
    if args.hours:
        end_dt = now
        start_dt = end_dt - timedelta(hours=max(args.hours, 1))
    else:
        end_dt = (parse_day(args.end) if args.end else now) + timedelta(days=1) - timedelta(seconds=1)
        start_dt = parse_day(args.start) if args.start else end_dt.replace(hour=0, minute=0, second=0)

    start_epoch = int(start_dt.timestamp())
    end_epoch = int(end_dt.timestamp())
    if end_epoch - start_epoch > settings.HOUSING_API_MAX_RANGE_SEC:
        print(f"ERROR: window larger than {settings.HOUSING_API_MAX_RANGE_SEC}s. Run per-day.")
        return 1

    print(f"Pulling Housing.com leads {start_dt.isoformat()} .. {end_dt.isoformat()}")
    params = core.housing_sync_params(start_epoch, end_epoch)
    r = core._http.get(settings.HOUSING_API_URL, params=params, timeout=60)
    if r.status_code >= 400:
        print(f"ERROR: Housing API returned {r.status_code}: {r.text[:300]}")
        return 1
    try:
        data = r.json()
    except Exception:
        print("ERROR: Housing API returned non-JSON response")
        return 1
    payloads = core.as_list_payload(data)

    report = {
        "window_start": start_dt.isoformat(),
        "window_end": end_dt.isoformat(),
        "received": len(payloads),
        "inserted": [],
        "updated": [],
        "duplicates": [],
        "skipped": [],
        "missing_mandatory_fields": [],
        "dry_run": args.dry_run,
    }

    for payload in payloads:
        phone = core.normalize_phone(core.pick_first(payload, ["lead_phone", "phone", "mobile", "phone_number"]))
        email = core.clean_text(core.pick_first(payload, ["email", "lead_email"]))
        external_id = core.clean_text(core.pick_first(payload, ["lead_id", "id", "enquiry_id", "uuid"]))
        label = phone or email or external_id or "unknown"

        if not phone and not email:
            report["missing_mandatory_fields"].append(label)
            report["skipped"].append({"row": label, "reason": "missing_phone_or_email"})
            continue
        if not core.should_import_housing_lead_on_sync(payload, start_epoch, end_epoch, mode="manual"):
            report["skipped"].append({"row": label, "reason": "lead_date_outside_window"})
            continue

        if args.dry_run:
            existing = core._find_existing_by_external_id(external_id, "Housing.com")
            if not existing:
                existing = core.housing_composite_exists(phone, core.clean_text(payload.get("project_id")), core.housing_lead_date_key(payload))
            report["duplicates" if existing else "inserted"].append(label)
            continue

        result = core.create_integrated_lead(payload, "Housing.com", actor=core.system_integration_actor())
        status = result.get("status")
        if status == "created":
            report["inserted"].append(result.get("lead_id") or label)
        elif status == "duplicate":
            report["duplicates"].append(result.get("lead_id") or label)
        else:
            report["skipped"].append({"row": label, "reason": result.get("reason", "unknown")})

    report["totals"] = {
        "received": report["received"],
        "inserted": len(report["inserted"]),
        "updated": len(report["updated"]),
        "duplicates": len(report["duplicates"]),
        "skipped": len(report["skipped"]),
        "missing_mandatory_fields": len(report["missing_mandatory_fields"]),
    }
    if not args.dry_run:
        try:
            report["final_db_count_in_window"] = len(
                core.sb_select("leads", {
                    "source": "eq.Housing.com",
                    "lead_received_at": f"gte.{start_dt.isoformat()}",
                    "and": f"(lead_received_at.lte.{end_dt.isoformat()})",
                    "select": "lead_id",
                })
            )
        except Exception as exc:  # column may not exist if migration not applied yet
            report["final_db_count_in_window"] = f"unavailable: {exc}"

    text = json.dumps(report, indent=2, default=str)
    print(text)
    if args.out:
        Path(args.out).write_text(text)
        print(f"Report written to {args.out}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    sys.exit(main())
