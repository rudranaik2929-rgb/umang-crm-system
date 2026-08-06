"""Environment and integration settings (Phase 2 extraction from legacy_core)."""
import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "240"))
WEBHOOK_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("WEBHOOK_RATE_LIMIT_MAX_REQUESTS", "120"))
RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() not in {"0", "false", "no"}

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SUPABASE_JWT_SECRET") or "change-me-in-production"
SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "7"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() not in {"0", "false", "no"}

_DEFAULT_CORS_ORIGINS = [
    "https://umanghometechllp.in",
    "https://www.umanghometechllp.in",
    "https://umang-home-tech.vercel.app",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
]
_cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else _DEFAULT_CORS_ORIGINS


def _ensure_www_cors_pair(origins: List[str]) -> List[str]:
    """Vercel often serves www while env only lists apex — allow both."""
    out = list(origins)
    pairs = [
        ("https://umanghometechllp.in", "https://www.umanghometechllp.in"),
        ("https://www.umanghometechllp.in", "https://umanghometechllp.in"),
    ]
    for a, b in pairs:
        if a in out and b not in out:
            out.append(b)
    return out


CORS_ORIGINS = _ensure_www_cors_pair(CORS_ORIGINS)
# Regex fallback — works even if Render env only lists one of www / apex.
CORS_ORIGIN_REGEX = os.environ.get(
    "CORS_ORIGIN_REGEX",
    r"^https://(www\.)?umanghometechllp\.in$|^https://umang-home-tech.*\.vercel\.app$|^http://localhost(:\d+)?$|^http://127\.0\.0\.1(:\d+)?$",
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://umanghometechllp.in").rstrip("/")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xlaiwmyyldxmuvopqomi.supabase.co")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or ""
)

STAGES = ["new", "assigned", "positive", "site_visit", "booking", "loan", "registration", "closed"]
ROLES = ["admin", "manager", "telecaller", "site_visit", "sales_executive", "booking", "loan", "marketing"]

INTERAKT_API_KEY = os.environ.get("INTERAKT_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
FACEBOOK_VERIFY_TOKEN = os.environ.get("FACEBOOK_VERIFY_TOKEN", "UMANGCRM123")
FACEBOOK_PAGE_ACCESS_TOKEN = os.environ.get("FACEBOOK_PAGE_ACCESS_TOKEN", "")
FACEBOOK_GRAPH_VERSION = os.environ.get("FACEBOOK_GRAPH_VERSION", "v20.0")
FACEBOOK_PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID", "")
FACEBOOK_FORM_ID = os.environ.get("FACEBOOK_FORM_ID", "")
META_FAKE_LEADGEN_IDS = {"444444444444", "0", "test"}
META_FAKE_PAGE_IDS = {"0", "test"}
FACEBOOK_AUTO_SYNC_ENABLED = os.environ.get("FACEBOOK_AUTO_SYNC_ENABLED", "true").lower() in ("1", "true", "yes")
FACEBOOK_AUTO_SYNC_INTERVAL_SEC = int(os.environ.get("FACEBOOK_AUTO_SYNC_INTERVAL_SEC", "30"))
FACEBOOK_AUTO_SYNC_WINDOW_SEC = int(os.environ.get("FACEBOOK_AUTO_SYNC_WINDOW_SEC", "7200"))
HOUSING_PROFILE_ID = os.environ.get("HOUSING_PROFILE_ID", "")
HOUSING_ENCRYPTION_KEY = os.environ.get("HOUSING_ENCRYPTION_KEY", "")
HOUSING_INTEGRATION_UUID = os.environ.get("HOUSING_INTEGRATION_UUID", "")
HOUSING_API_URL = os.environ.get("HOUSING_API_URL", "https://leads.housing.com/api/v0/get-builder-leads")
HOUSING_WEBHOOK_SECRET = os.environ.get("HOUSING_WEBHOOK_SECRET", HOUSING_INTEGRATION_UUID)
HOUSING_POLL_INITIAL_WINDOW_SEC = int(os.environ.get("HOUSING_POLL_INITIAL_WINDOW_SEC", "300"))
HOUSING_POLL_OVERLAP_SEC = int(os.environ.get("HOUSING_POLL_OVERLAP_SEC", "300"))
HOUSING_MANUAL_DEFAULT_WINDOW_SEC = int(os.environ.get("HOUSING_MANUAL_DEFAULT_WINDOW_SEC", "7200"))
HOUSING_API_MAX_RANGE_SEC = 2 * 86400
HOUSING_AUTO_SYNC_ENABLED = os.environ.get("HOUSING_AUTO_SYNC_ENABLED", "true").lower() in ("1", "true", "yes")
HOUSING_AUTO_SYNC_INTERVAL_SEC = int(os.environ.get("HOUSING_AUTO_SYNC_INTERVAL_SEC", "30"))
CRON_SECRET = os.environ.get("CRON_SECRET", "")
INTEGRATION_LEAD_START = os.environ.get("INTEGRATION_LEAD_START", "2026-08-01T00:00:00+05:30")
