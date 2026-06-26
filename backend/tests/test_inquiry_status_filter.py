import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(**kwargs):
    base = {"lead_id": "l1", "status": "active", "stage": "assigned", "assigned_to": "emp1"}
    base.update(kwargs)
    return base


def test_parse_inquiry_status_filter_comma_separated():
    assert main.parse_inquiry_status_filter("ringing,not_interested") == ["ringing", "not_interested"]
    assert main.parse_inquiry_status_filter("all") == []


def test_lead_matches_multiple_inquiry_status_or_logic():
    ringing = _lead(call_status="ringing")
    not_interested = _lead(status="negative")
    low_budget = _lead(status="negative", priority="low_budget")
    hot = _lead(priority="hot", stage="positive")

    assert main.lead_matches_inquiry_filter(ringing, "ringing,not_interested") is True
    assert main.lead_matches_inquiry_filter(not_interested, "ringing,not_interested") is True
    assert main.lead_matches_inquiry_filter(low_budget, "low_budget,ringing") is True
    assert main.lead_matches_inquiry_filter(hot, "ringing,not_interested") is False
    assert main.lead_matches_inquiry_filter(hot, "hot,ringing") is True
