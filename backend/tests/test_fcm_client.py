import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import fcm_client  # noqa: E402


def test_fcm_not_configured_without_env(monkeypatch):
    monkeypatch.setattr(fcm_client, "FCM_SERVICE_ACCOUNT_JSON", "")
    monkeypatch.setattr(fcm_client, "_initialized", False)
    assert fcm_client.fcm_configured() is False
    assert fcm_client.init_firebase() is False


def test_init_firebase_with_json(monkeypatch):
    fake_sa = '{"type":"service_account","project_id":"test-proj","private_key":"x","client_email":"a@b.c"}'
    monkeypatch.setattr(fcm_client, "FCM_SERVICE_ACCOUNT_JSON", fake_sa)
    monkeypatch.setattr(fcm_client, "_initialized", False)

    mock_firebase = MagicMock()
    mock_firebase._apps = []
    mock_credentials = MagicMock()
    mock_firebase.credentials = mock_credentials
    mock_credentials.Certificate.return_value = MagicMock()

    with patch.dict(sys.modules, {"firebase_admin": mock_firebase}):
        assert fcm_client.init_firebase() is True
        mock_firebase.initialize_app.assert_called_once()
