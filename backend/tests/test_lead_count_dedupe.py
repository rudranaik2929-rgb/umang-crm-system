import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(lead_id: str, phone: str, source: str = "bulk_import", **extra):
    return {"lead_id": lead_id, "phone": phone, "source": source, "stage": "new", "status": "active", **extra}


def test_platform_total_counts_every_excel_row_even_with_same_phone():
    leads = [
        _lead("lead_1", "+919867007181"),
        _lead("lead_2", "+919867007181"),
        _lead("lead_3", "+919000325348"),
    ]
    breakdown = main.compute_platform_breakdown(leads)
    assert breakdown["total"] == 3


def test_platform_total_still_collapses_integration_external_id_duplicates():
    leads = [
        _lead("lead_a", "+911111111111", source="Housing.com", external_lead_id="housing-99"),
        _lead("lead_b", "+911111111111", source="Housing.com", external_lead_id="housing-99"),
    ]
    breakdown = main.compute_platform_breakdown(leads)
    assert breakdown["total"] == 1


def test_all_bucket_matches_platform_total():
    leads = [
        _lead("lead_1", "+919867007181"),
        _lead("lead_2", "+919867007181"),
    ]
    bucket = main.filter_lead_bucket(leads, "all", "2026-03-01")
    assert len(bucket) == 2
