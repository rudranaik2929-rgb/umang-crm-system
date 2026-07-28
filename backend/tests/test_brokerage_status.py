"""Unit tests for brokerage_status helpers (received vs pending split)."""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_normalize_brokerage_status_defaults_pending():
    assert main.normalize_brokerage_status(None) == "pending"
    assert main.normalize_brokerage_status("") == "pending"
    assert main.normalize_brokerage_status("PENDING") == "pending"
    assert main.normalize_brokerage_status("weird") == "pending"
    assert main.normalize_brokerage_status("received") == "received"
    assert main.normalize_brokerage_status(" Received ") == "received"


def test_booking_brokerage_by_status_splits_amounts():
    bookings = [
        {"brokerage_amount": 10000, "brokerage_status": "received"},
        {"brokerage_amount": 5000, "brokerage_status": "pending"},
        {"brokerage_amount": 2500},  # missing status → pending
        {"brokerage_amount": 0, "brokerage_status": "received"},  # ignored
        {"agreement_status": "pending | Brokerage: 1500", "brokerage_status": "received"},
    ]
    split = main.booking_brokerage_by_status(bookings)
    assert split["received"] == 11500.0  # 10000 + 1500
    assert split["pending"] == 7500.0  # 5000 + 2500
    assert split["total"] == 19000.0


def test_booking_brokerage_by_status_empty():
    split = main.booking_brokerage_by_status([])
    assert split == {"received": 0.0, "pending": 0.0, "total": 0.0}
