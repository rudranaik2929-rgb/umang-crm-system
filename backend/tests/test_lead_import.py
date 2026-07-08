import io
import sys
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


UMANG_HEADERS = [
    "Lead date",
    "Customer Name",
    "Mobile number",
    "Locality",
    "Source",
    "Assign to",
]

LEGACY_HEADERS = [
    "Lead Date",
    "Lead Name",
    "Phone Number",
    "Locality",
    "Configuration",
    "Price",
    "Building/Project Name",
    "Assign to",
]


def _build_xlsx_bytes(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def test_map_import_headers_umang_template():
    header_map = main.map_import_headers(UMANG_HEADERS)
    assert header_map["lead_date"] == 0
    assert header_map["name"] == 1
    assert header_map["phone"] == 2
    assert header_map["location"] == 3
    assert header_map["source"] == 4
    assert header_map["assign_to"] == 5


def test_map_import_headers_legacy_still_works():
    header_map = main.map_import_headers(LEGACY_HEADERS)
    assert header_map["name"] == 1
    assert header_map["phone"] == 2
    assert header_map["location"] == 3
    assert header_map["assign_to"] == 7


def test_normalize_phone_meta_style():
    assert main.normalize_phone("919973937387") == "919973937387"
    assert main.normalize_phone("9973937387") == "919973937387"
    assert main.normalize_phone("+919973937387") == "919973937387"
    assert main.normalize_phone("(+91)-9973937387") == "919973937387"
    assert main.normalize_phone("0919973937387") == "919973937387"


def test_locate_import_header_skips_blank_title_row():
    rows = [
        ["", "", ""],
        UMANG_HEADERS,
        ["30/12/2025", "mukesh", "919869122319", "Nalasopara West", "Facebook", "Khyati Shah"],
    ]
    idx, header_map = main.locate_import_header(rows)
    assert idx == 1
    assert "name" in header_map and "phone" in header_map


def test_sniff_upload_extension_from_zip_magic():
    xlsx = _build_xlsx_bytes([UMANG_HEADERS])
    assert main.sniff_upload_extension("", xlsx) == "xlsx"
    assert main.sniff_upload_extension("Untitled spreadsheet", xlsx) == "xlsx"


def test_load_excel_import_rows_parses_umang_sheet():
    xlsx = _build_xlsx_bytes([
        UMANG_HEADERS,
        ["30/12/2025", "mukesh", "919869122319", "Nalasopara West", "Facebook", "Khyati Shah"],
    ])
    rows, header_idx, header_map = main.load_excel_import_rows(xlsx)
    record = main.import_row_to_record(list(rows[header_idx + 1]), header_map)
    assert record["name"] == "mukesh"
    assert record["phone"] == "919869122319"
    assert record["location"] == "Nalasopara West"
    assert record["source"] == "Facebook"
    assert record["assign_to"] == "Khyati Shah"


def test_normalize_import_source_empty_defaults_bulk():
    assert main.normalize_import_source("") == "bulk_import"
    assert main.normalize_import_source("  ") == "bulk_import"


def test_parse_import_lead_date_mar_format():
    parsed = main.parse_import_lead_date("01-Mar-26")
    assert parsed is not None
    assert "2026" in parsed


def test_import_leads_endpoint_accepts_excel(monkeypatch):
    inserted_leads = []

    def fake_select_all(table, params=None):
        return [{"employee_id": "emp1", "name": "Khyati Shah", "email": "k@test.com", "active": True}]

    def fake_insert_many(table, rows):
        if table == "leads":
            inserted_leads.extend(rows)
        return list(rows)

    monkeypatch.setattr(main, "sb_select_all", fake_select_all)
    monkeypatch.setattr(main, "sb_insert_many", fake_insert_many)
    monkeypatch.setattr(main, "sb_update", lambda *args, **kwargs: {})
    monkeypatch.setattr(main, "log_activity", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "invalidate_leads_cache", lambda: None)
    monkeypatch.setattr(main, "invalidate_employees_cache", lambda: None)
    monkeypatch.setattr(main, "assign_lead_to_employee", lambda lid, lead, eid, cu, **kw: lead)
    main.SESSION_CACHE["leads"] = []

    admin = main.User(
        user_id="admin1",
        email="admin@test.com",
        name="Admin",
        role="admin",
        created_at=datetime.now(timezone.utc),
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: admin

    xlsx = _build_xlsx_bytes([
        UMANG_HEADERS,
        ["30/12/2025", "mukesh", "919869122319", "Nalasopara West", "Facebook", "Khyati Shah"],
    ])
    client = TestClient(main.app)
    try:
        res = client.post(
            "/api/leads/import",
            files={"file": ("Untitled spreadsheet.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "success"
        assert body["imported_count"] == 1
        assert len(inserted_leads) == 1
        assert inserted_leads[0]["name"] == "mukesh"
        assert inserted_leads[0]["phone"] == "919869122319"
        assert inserted_leads[0]["source"] == "Facebook"
    finally:
        main.app.dependency_overrides.clear()
