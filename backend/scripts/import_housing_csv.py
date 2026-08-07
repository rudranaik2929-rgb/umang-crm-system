"""Import Housing.com leads from a CSV export (e.g. the client's 33-row export).

Uses the production pipeline (`create_integrated_lead`) with the composite
dedupe key phone + project_id + lead_date, so:
  - already-imported rows are skipped (duplicate, never overwritten)
  - same customer + different project  -> separate leads
  - re-running this script is safe

Usage (from backend/):
    python3 scripts/import_housing_csv.py /path/to/housing_export.csv
    python3 scripts/import_housing_csv.py export.csv --dry-run
    python3 scripts/import_housing_csv.py export.csv --date-format dmy

Column matching is fuzzy (case/space-insensitive). Recognised synonyms:
  phone: phone, phone number, mobile, contact number
  name:  name, customer name, lead name, lead_name
  project_id: project id, project_id, project, property id
  project_name: project name, project_name, property name
  locality / city / service / price
  date: lead date, lead_date, enquiry date, date, created_date, timestamp
"""
import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from app import legacy_core as core  # noqa: E402

DATE_FORMATS = {
    "iso": ["%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"],
    "dmy": ["%d-%m-%Y", "%d/%m/%Y", "%d-%m-%Y %H:%M:%S", "%d %b %Y", "%d-%b-%Y"],
    "mdy": ["%m/%d/%Y", "%m-%d-%Y"],
}

KEY_FIELD = {
    "phone": ("phone", "phone_number", "mobile", "mobile_number", "contact_number"),
    "name": ("name", "customer_name", "lead_name", "full_name"),
    "project_id": ("project_id", "property_project_id", "project", "property_id"),
    "project_name": ("project_name", "project name", "property_name"),
    "locality": ("locality", "locality_name", "area"),
    "city": ("city", "city_name"),
    "price": ("price", "price_range", "budget", "budget_range", "price_budget"),
    "lead_date": ("lead_date", "lead date", "enquiry date", "enquiry_date", "date", "created date", "created_date", "created_at", "timestamp", "lead_received_at"),
}


def _normalize_header(h: str) -> str:
    return " ".join(str(h).strip().lower().replace("_", " ").split())


def _match_header(h: str, aliases) -> bool:
    h = _normalize_header(h)
    return any(_normalize_header(a) == h for a in aliases)


def _build_mapping(headers) -> dict:
    mapping = {}
    for field, aliases in KEY_FIELD.items():
        for h in headers:
            if _match_header(h, aliases):
                mapping[field] = h
                break
    return mapping


def _parse_date(value: str, fmt: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    for pattern in DATE_FORMATS.get(fmt, DATE_FORMATS["dmy"] + DATE_FORMATS["iso"]):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            continue
    # ISO fallthrough
    val = value.replace("T", " ").split(" ")[0]
    if len(val) == 10 and val[4] == "-":
        return val
    return value


def main() -> int:
    ap = argparse.ArgumentParser(description="Import Housing.com leads from CSV export.")
    ap.add_argument("csv", help="Path to the CSV export")
    ap.add_argument("--dry-run", action="store_true", help="Count only; insert nothing")
    ap.add_argument("--date", choices=("iso", "dmy", "mdy"), default="dmy",
                    help="Date format in the export columns (default dmy = DD-MM-YYYY)")
    ap.add_argument("--out", help="Write JSON report to this file")
    args = ap.parse_args()

    path = Path(args.csv)
    if not path.exists():
        print(f"ERROR: file not found: {path}")
        return 1

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("ERROR: empty header / not a CSV")
            return 1
        mapping = _build_mapping(reader.fieldnames)
        rows = list(reader)

    print(f"Mapping: {json.dumps(mapping, indent=2)}")

    report = {
        "file": str(path),
        "date_format": args.date,
        "received": len(rows),
        "inserted": [],
        "duplicates": [],
        "skipped": [],
        "missing_mandatory_fields": [],
        "dry_run": args.dry_run,
    }

    for idx, row in enumerate(rows, start=2):
        phone = core.normalize_phone(row.get(mapping.get("phone") or ""))
        email = core.clean_text(row.get("email", "") or row.get("Email", "")) or core.clean_text(mapping.get("email") and row.get(mapping["email"]))
        name = core.clean_text(row.get(mapping.get("name") or "")) or "Valued Customer"
        project_id = core.clean_text(row.get(mapping.get("project_id") or ""))
        project_name = core.clean_text(row.get(mapping.get("project_name") or ""))
        lead_date = _parse_date(row.get(mapping.get("lead_date") or ""), args.date)
        payload = {
            "lead_id": f"csv-row-{idx}",
            "lead_phone": phone,
            "lead_name": name,
            "project_id": project_id,
            "project_name": project_name,
            "lead_date": lead_date,
            "integration_uuid": "csv_import",
        }
        if mapping.get("locality"):
            payload["locality"] = row.get(mapping["locality"])
        if mapping.get("city"):
            payload["city"] = row.get(mapping["city"])
        if mapping.get("price"):
            payload["price_range"] = row.get(mapping["price"])

        label = f"row {idx} ({phone or name or '?'})"

        if not phone and not email:
            report["missing_mandatory_fields"].append(label)
            report["skipped"].append({"row": label, "reason": "missing_phone_or_email"})
            continue

        if args.dry_run:
            existing = core._find_existing_by_external_id(core.clean_text(payload.get("lead_id")), "Housing.com")
            if not existing:
                existing = core.housing_composite_exists(phone, project_id, core.housing_lead_date_key(payload))
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
        "duplicates": len(report["duplicates"]),
        "skipped": len(report["skipped"]),
        "missing_mandatory_fields": len(report["missing_mandatory_fields"]),
    }
    text = json.dumps(report, indent=2, default=str)
    print(text)
    if args.out:
        Path(args.out).write_text(text)
        print(f"Report written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())