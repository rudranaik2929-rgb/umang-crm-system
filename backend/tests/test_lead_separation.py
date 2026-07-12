import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def _lead(**kwargs):
    base = {
        "lead_id": "l1",
        "name": "Default",
        "phone": "9999999999",
        "status": "active",
        "stage": "assigned",
        "assigned_to": "emp1",
    }
    base.update(kwargs)
    return base


def test_booking_manual_lead_not_in_unassigned_filter():
    employees = [{"employee_id": "emp1", "name": "A", "active": True}]
    booking_walkin = _lead(
        lead_id="b1",
        name="Booking Client",
        assigned_to=None,
        stage="booking",
        priority="handoff_booking",
        source="booking_manual",
    )
    telecaller_new = _lead(lead_id="t1", assigned_to=None, stage="new", source="housing")

    assert main.is_dept_queue_lead(booking_walkin) is True
    assert main.is_lead_unassigned(booking_walkin, employees) is False
    assert main.is_lead_unassigned(telecaller_new, employees) is True

    filtered = main.filter_assign_workspace_leads(
        [booking_walkin, telecaller_new],
        assigned_to="unassigned",
        employees=employees,
    )
    assert {row["lead_id"] for row in filtered} == {"t1"}


def test_handoff_booking_positive_stage_not_unassigned():
    employees = [{"employee_id": "emp1", "name": "A", "active": True}]
    handoff = _lead(
        lead_id="h1",
        assigned_to=None,
        stage="positive",
        priority="handoff_booking",
    )
    assert main.is_lead_unassigned(handoff, employees) is False


def test_unassigned_queue_keeps_separate_manual_rows_same_phone():
    same_phone = "9876543210"
    housing = _lead(
        lead_id="h1",
        name="Housing Lead",
        phone=same_phone,
        assigned_to=None,
        stage="new",
        source="Housing.com",
        external_lead_id="ext-1",
        created_at="2026-06-01T10:00:00+00:00",
    )
    manual = _lead(
        lead_id="m1",
        name="Booking Client",
        phone=same_phone,
        assigned_to=None,
        stage="new",
        source="booking_manual",
        created_at="2026-06-28T10:00:00+00:00",
    )
    queue = main.compute_unassigned_queue([housing, manual])
    assert {row["lead_id"] for row in queue} == {"h1", "m1"}
    names = {row["lead_id"]: row["name"] for row in queue}
    assert names["h1"] == "Housing Lead"
    assert names["m1"] == "Booking Client"


def test_merge_leads_prefers_db_when_newer():
    cache_row = {
        "lead_id": "l1",
        "name": "Stale Cache Name",
        "updated_at": "2026-06-01T10:00:00+00:00",
    }
    db_row = {
        "lead_id": "l1",
        "name": "Correct DB Name",
        "updated_at": "2026-06-28T10:00:00+00:00",
    }
    main.SESSION_CACHE["leads"] = [cache_row]
    merged = main.merge_leads_with_cache([db_row])
    assert merged[0]["name"] == "Correct DB Name"
    main.SESSION_CACHE["leads"] = []
