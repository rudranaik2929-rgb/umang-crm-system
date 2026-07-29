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
        {"brokerage_amount": 10000, "brokerage_received": 10000},
        {"brokerage_amount": 5000, "brokerage_received": 2000},
        {"brokerage_amount": 2500},  # missing received → pending
        {"brokerage_amount": 0, "brokerage_received": 100},  # ignored
        {"agreement_status": "pending | Brokerage: 1500", "brokerage_received": 500},
        {"brokerage_amount": 8000, "brokerage_status": "received"},  # legacy full received
    ]
    split = main.booking_brokerage_by_status(bookings)
    assert split["received"] == 20500.0  # 10000 + 2000 + 500 + 8000
    assert split["pending"] == 6500.0  # 3000 + 2500 + 1000
    assert split["total"] == 27000.0


def test_booking_brokerage_received_amount_prefers_column():
    assert main.booking_brokerage_received_amount({"brokerage_amount": 10000, "brokerage_received": 3000}) == 3000.0
    assert main.booking_brokerage_received_amount({"brokerage_amount": 10000, "brokerage_status": "received"}) == 10000.0
    assert main.booking_brokerage_received_amount({"brokerage_amount": 10000}) == 0.0


def test_booking_brokerage_by_status_empty():
    split = main.booking_brokerage_by_status([])
    assert split == {"received": 0.0, "pending": 0.0, "total": 0.0}
