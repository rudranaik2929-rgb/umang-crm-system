"""Booking document upload validation."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_detect_booking_document_pdf():
    ct, ext = main._detect_booking_document_type("agreement.pdf", "application/pdf", b"%PDF-1.4")
    assert ct == "application/pdf"
    assert ext == "pdf"


def test_detect_booking_document_jpeg():
    ct, ext = main._detect_booking_document_type("scan.jpg", "image/jpeg", b"\xff\xd8\xff\xe0")
    assert ct == "image/jpeg"
    assert ext == "jpg"


def test_detect_booking_document_rejects_other():
    with pytest.raises(HTTPException) as exc:
        main._detect_booking_document_type("notes.txt", "text/plain", b"hello")
    assert exc.value.status_code == 400


def test_normalize_booking_document_meta_requires_storage_path():
    assert main._normalize_booking_document_meta({"file_name": "x.pdf"}) is None
    meta = main._normalize_booking_document_meta({
        "file_name": "x.pdf",
        "storage_path": "bkg_1/doc_1.pdf",
        "content_type": "application/pdf",
    })
    assert meta["file_name"] == "x.pdf"
    assert meta["storage_path"] == "bkg_1/doc_1.pdf"
