"""Regression: the lead list endpoints must not silently truncate large tables.

`/api/leads` used to default to `limit=200` and clamp at 500. The CRM holds
several thousand leads, so the Pipeline screen only ever received the newest
slice and every older lead — including leads a user had just created — was
invisible with no error anywhere. These tests pin the paging contract that
`fetchAllLeads` in the frontend relies on.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402

TOTAL = 1200  # > the old 500 ceiling


class _FakeUser:
    user_id = "u1"
    email = "admin@test.com"
    role = "admin"
    name = "Admin"
    acting_as_employee_id = None
    employee_id = None


def _seed(fake_db, n=TOTAL):
    rows = [
        {
            "lead_id": f"lead_{i:05d}",
            "name": f"Lead {i}",
            "phone": f"+9190000{i:06d}",
            "email": None,
            "source": "Housing.com",
            "stage": "new",
            "status": "active",
            "priority": "normal",
            "call_status": None,
            "assigned_to": None,
            "created_at": f"2026-09-{(i % 28) + 1:02d}T10:00:{i % 60:02d}Z",
            "updated_at": f"2026-09-{(i % 28) + 1:02d}T10:00:{i % 60:02d}Z",
        }
        for i in range(n)
    ]
    fake_db.reset(seed={"leads": rows, "employees": [], "bookings": [], "loans": []})
    # reset() deep-copies into the store, so hand back the live rows for editing.
    return fake_db.rows("leads")


@pytest.fixture
def api(fake_db):
    main.app.dependency_overrides[main.get_current_user] = lambda: _FakeUser()
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def test_leads_ceiling_allows_full_table(api, fake_db):
    _seed(fake_db)
    body = api.get("/api/leads", params={"limit": 99999}).json()
    assert len(body) == TOTAL, (
        f"/leads returned {len(body)} of {TOTAL} — the page ceiling is truncating again"
    )


def test_leads_default_page_is_not_the_old_200(api, fake_db):
    """An un-paged call must return the default page, which is now 1000."""
    _seed(fake_db)
    body = api.get("/api/leads").json()
    assert len(body) == main.LEADS_LIST_DEFAULT_LIMIT
    assert main.LEADS_LIST_DEFAULT_LIMIT > 200


def test_leads_pages_do_not_overlap_or_gap(api, fake_db):
    """Offset paging must tile the table exactly — this is what fetchAllLeads does."""
    _seed(fake_db)
    page_size = 500
    seen: list = []
    for offset in range(0, TOTAL, page_size):
        page = api.get("/api/leads", params={"limit": page_size, "offset": offset}).json()
        assert len(page) <= page_size
        seen.extend(l["lead_id"] for l in page)
    assert len(seen) == TOTAL
    assert len(set(seen)) == TOTAL, "pages overlapped — leads would be double-counted"
    assert set(seen) == {f"lead_{i:05d}" for i in range(TOTAL)}


def test_leads_offset_past_end_returns_empty(api, fake_db):
    _seed(fake_db)
    assert api.get("/api/leads", params={"limit": 100, "offset": TOTAL + 50}).json() == []


def test_leads_status_filter_still_applies_with_paging(api, fake_db):
    rows = _seed(fake_db)
    for i, row in enumerate(rows):
        if i % 2 == 0:
            row["status"] = "negative"
    fake_db.reset(seed={"leads": rows, "employees": [], "bookings": [], "loans": []})
    negative = api.get("/api/leads", params={"status_": "negative", "limit": 99999}).json()
    assert len(negative) == TOTAL // 2
    assert {l["status"] for l in negative} == {"negative"}


def test_booking_and_loan_queues_are_not_capped_by_postgrest(fake_db):
    """These read through a single sb_select; a >1000-row queue must still paginate."""
    rows = _seed(fake_db)
    for row in rows:
        row["priority"] = "hot"
    fake_db.reset(seed={"leads": rows, "employees": [], "bookings": [], "loans": []})
    main.app.dependency_overrides[main.get_current_user] = lambda: _FakeUser()
    try:
        client = TestClient(main.app)
        queue = client.get("/api/leads/booking-queue", params={"limit": 99999}).json()
        assert len(queue) == TOTAL, (
            f"booking queue returned {len(queue)} of {TOTAL} — sb_select_all not used?"
        )
    finally:
        main.app.dependency_overrides.clear()


def test_by_platform_bucket_reports_true_total(api, fake_db):
    """`total` must reflect the whole bucket, not the returned page."""
    _seed(fake_db)
    body = api.get("/api/leads/by-platform/housing", params={"limit": 50}).json()
    assert body["total"] == TOTAL
    assert len(body["leads"]) == 50
