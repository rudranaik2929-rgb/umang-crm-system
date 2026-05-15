import os
import pytest
import requests
import subprocess
import json

BASE_URL = "https://umang-home-tech.onrender.com"


def _create_session_via_mongo(role="admin"):
    """Insert a user and session into MongoDB and return (user_id, session_token)."""
    js = """
var visitorId = 'user_test_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
var sessionToken = 'test_session_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
db.users.insertOne({
  user_id: visitorId,
  email: 'admin.test+' + Date.now() + '@umang.com',
  name: 'Admin Tester',
  picture: null,
  role: '%s',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: visitorId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('USER_ID=' + visitorId);
print('SESSION_TOKEN=' + sessionToken);
""" % role
    out = subprocess.check_output(["mongosh", "test_database", "--quiet", "--eval", js], text=True)
    user_id, token = None, None
    for line in out.splitlines():
        if line.startswith("USER_ID="):
            user_id = line.split("=", 1)[1].strip()
        elif line.startswith("SESSION_TOKEN="):
            token = line.split("=", 1)[1].strip()
    assert user_id and token, f"Could not parse mongo output: {out}"
    return user_id, token


@pytest.fixture(scope="session")
def admin_session():
    user_id, token = _create_session_via_mongo("admin")
    return {"user_id": user_id, "token": token}


@pytest.fixture(scope="session")
def auth_client(admin_session):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_session['token']}",
    })
    return s


@pytest.fixture
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL
