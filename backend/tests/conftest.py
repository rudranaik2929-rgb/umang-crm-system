"""Shared pytest fixtures.

The whole suite is hermetic: Supabase is replaced by the in-memory fake in
``fake_supabase.py`` and auth is injected through FastAPI dependency overrides,
so no test touches the network or the production CRM.

Every test also starts from empty process-local caches. The backend keeps
leads/employees/stats in module-level RAM for speed, and without an explicit
reset those dicts leak between tests and make results order-dependent.
"""

import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Must be set before the app reads its settings, so config assertions exercise a
# properly configured deployment rather than the placeholder default.
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-used-in-production")
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app import main as core  # noqa: E402
from tests import fake_supabase  # noqa: E402


def _make_user(role: str = "admin", **overrides):
    """Build a User without touching the auth/session tables."""
    user = core.User(
        user_id=overrides.pop("user_id", "user_test_admin"),
        email=overrides.pop("email", "admin@test.com"),
        name=overrides.pop("name", "Test Admin"),
        role=role,
        employee_id=overrides.pop("employee_id", None),
        acting_as_employee_id=overrides.pop("acting_as_employee_id", None),
        created_at=core.now_utc(),
    )
    for key, value in overrides.items():
        setattr(user, key, value)
    return user


@pytest.fixture(autouse=True)
def isolated_runtime():
    """Reset Supabase fake + every in-process cache around each test."""
    fake_supabase.reset()
    fake_supabase.reset_runtime_caches()
    core.app.dependency_overrides.clear()
    yield
    core.app.dependency_overrides.clear()
    fake_supabase.reset_runtime_caches()
    fake_supabase.reset()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Fail loudly if any test reaches for a real TCP connection.

    The suite is meant to be fully in-memory; a stray unpatched sb_* helper or
    integration client must surface as an error, not a silent call to the live
    Supabase project or a third-party API. Guarding at the socket layer leaves
    the in-process TestClient (ASGI transport, no sockets) untouched.
    """
    import socket

    real_connect = socket.socket.connect
    real_connect_ex = socket.socket.connect_ex
    loopback = {"127.0.0.1", "::1", "localhost"}

    def _is_loopback(address) -> bool:
        # On Windows asyncio builds its event-loop self-pipe with
        # socket.socketpair(), which connects over loopback. That is not
        # network access, so it must stay allowed.
        return isinstance(address, tuple) and bool(address) and address[0] in loopback

    def _blocked(*args, **kwargs):
        raise RuntimeError(
            "Blocked outbound network call during tests — a helper was not "
            "patched against the in-memory Supabase fake."
        )

    def _connect(sock, address):
        if _is_loopback(address):
            return real_connect(sock, address)
        _blocked()

    def _connect_ex(sock, address):
        if _is_loopback(address):
            return real_connect_ex(sock, address)
        _blocked()

    monkeypatch.setattr(socket.socket, "connect", _connect)
    monkeypatch.setattr(socket.socket, "connect_ex", _connect_ex)
    monkeypatch.setattr(socket, "create_connection", _blocked)


@pytest.fixture
def fake_db(monkeypatch):
    """Route all sb_* helpers at the in-memory tables and return the fake."""
    fake_supabase.install(monkeypatch)
    fake_supabase.reset()
    return fake_supabase


@pytest.fixture
def auth_user(monkeypatch, fake_db):
    """An authenticated admin user, injected via dependency override.

    The override key must be the same function object the routes were declared
    with, so this cannot be a monkeypatch — ``Depends(get_current_user)`` is
    already bound at import time.

    A matching `users` row is seeded so endpoints that persist changes to the
    signed-in user (e.g. /auth/set-role) behave as they do in production.
    """
    user = _make_user("admin")
    fake_db.reset(seed={
        "users": [{
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "role": "admin",
            "dashboard_type": "admin",
        }],
    })
    core.app.dependency_overrides[core.get_current_user] = lambda: user
    return user


@pytest.fixture
def client(fake_db, auth_user):
    """TestClient wired to the fake DB with an authenticated admin."""
    from fastapi.testclient import TestClient

    return TestClient(core.app)
