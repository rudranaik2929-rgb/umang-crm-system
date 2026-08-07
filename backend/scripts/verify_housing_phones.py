"""Verify the 4 Housing.com customers each produced a SEPARATE lead per project.

Read-only. Queries the CRM leads table for the verification phone numbers and
prints phone + project + lead_received_at + lead_id so you can confirm that the
same customer with multiple project enquiries created multiple leads
(7977229056 = 3 projects, 7617803752 / 8379004050 / 9930504887 = 2 projects each).

Usage (from backend/):
    python3 scripts/verify_housing_phones.py
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app import legacy_core as core  # noqa: E402

PHONES = ["7977229056", "7617803752", "8379004050", "9930504887"]


def main() -> int:
    rows = core.sb_select_in(
        "leads",
        "phone",
        [f"91{p}" for p in PHONES],
        extra_params={"source": "eq.Housing.com", "order": "phone.asc", "select": "lead_id,name,phone,property_project_id,project_name,lead_received_at,external_lead_id,created_at,raw_payload"},
    )
    if not rows:
        print("No Housing.com leads found for those phones.")
        print("Run the migration + resync first, then re-run this script.")
        return 1

    from collections import defaultdict

    by_phone = defaultdict(list)
    for row in rows:
        phone = str(row.get("phone") or "").lstrip("91") or "?"
        by_phone[phone].append(row)

    print(f"{'Phone':<12} {'Project ID':<14} {'Project Name':<24} {'Lead Date':<12} Lead ID")
    print("-" * 90)
    for phone in PHONES:
        found = by_phone.get(phone, [])
        projects = {core.clean_text(r.get("property_project_id")) or core.clean_text((r.get("raw_payload") or {}).get("project_id")) or "—" for r in found}
        print(f"{phone:<12}  {len(found)} lead(s), {len(projects)} project(s)")
        for r in found:
            raw = r.get("raw_payload")
            proj = core.clean_text(r.get("property_project_id")) or core.clean_text((raw or {}).get("project_id")) if isinstance(raw, dict) else core.clean_text(r.get("property_project_id"))
            pname = core.clean_text(r.get("project_name")) or core.clean_text((raw or {}).get("project_name")) if isinstance(raw, dict) else core.clean_text(r.get("project_name"))
            day = (r.get("lead_received_at") or r.get("created_at") or "")[:10]
            print(f"{'':<12} {str(proj or '—'):<14} {str(pname or '—'):<24} {day:<12} {r.get('lead_id')}")
        total_projects = len({(
            core.clean_text(r.get("property_project_id")) or core.clean_text((r.get("raw_payload") or {}).get("project_id"))
        ) for r in found})
        print(f"  -> distinct projects: {total_projects}")
    return 0


if __name__ == "__main__":
    sys.exit(main())