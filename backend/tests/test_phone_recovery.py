"""Phone recovery from Housing.com raw payloads (masked pull API)."""
from app import legacy_core as main


def test_phone_from_raw_payload_masked_returns_empty():
    raw = {
        "lead_name": "Bhawar Singh Solanki",
        "lead_phone": None,
        "lead_email": None,
        "project_id": "312389",
    }
    assert main.phone_from_raw_payload(raw) == ""


def test_phone_from_raw_payload_lead_phone():
    raw = {"lead_phone": "919819191919", "lead_name": "A"}
    assert main.phone_from_raw_payload(raw) == "919819191919"


def test_phone_from_raw_payload_10_digit_normalized():
    raw = {"mobile": "9869122319"}
    assert main.phone_from_raw_payload(raw) == "919869122319"


def test_phone_from_raw_payload_nested_contact():
    raw = {"contact": {"phone": "9876543210"}}
    assert main.phone_from_raw_payload(raw) == "919876543210"


def test_phone_from_raw_payload_starred_placeholder_skipped():
    raw = {"phone": "**********", "mobile": "9822334455"}
    assert main.phone_from_raw_payload(raw) == "919822334455"


def test_phone_from_raw_payload_all_same_digits_skipped():
    raw = {"phone": "0000000000"}
    assert main.phone_from_raw_payload(raw) == ""


def test_phone_from_raw_payload_scan_any_numeric_value():
    raw = {"some_field": "(+91)-98691 22319", "lead_name": "x"}
    assert main.phone_from_raw_payload(raw) == "919869122319"


def test_enrich_lead_display_fields_recovers_phone():
    lead = {"lead_id": "L1", "name": "A", "phone": "", "source": "Housing.com",
            "raw_payload": {"lead_phone": "919819191919"}}
    row = main.enrich_lead_display_fields(lead)
    assert row["phone"] == "919819191919"


def test_enrich_lead_display_fields_keeps_existing_phone():
    lead = {"lead_id": "L1", "name": "A", "phone": "919999999999", "source": "Housing.com",
            "raw_payload": {"lead_phone": "919819191919"}}
    row = main.enrich_lead_display_fields(lead)
    assert row["phone"] == "919999999999"