"""Iteration 9 smoke regression: rebrand Smart Kitchen AI + core auth/CRUD endpoints."""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"


# ---------- Root & branding ----------
def test_root_returns_smart_kitchen_ai():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("app") == "Smart Kitchen AI", data
    assert data.get("ok") is True, data


# ---------- Auth ----------
@pytest.fixture(scope="module")
def chef_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/signin",
        json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        # attempt to create the seed account (idempotent-ish)
        s = requests.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD, "name": "Chef Test"},
            timeout=15,
        )
        assert s.status_code == 200, f"signup failed: {s.status_code} {s.text}"
        return s.json()["session_token"]
    data = r.json()
    assert "session_token" in data and "user" in data
    assert data["user"]["email"] == CHEF_EMAIL
    return data["session_token"]


def test_signin_chef_returns_token(chef_token):
    assert chef_token and isinstance(chef_token, str) and len(chef_token) > 20


def test_auth_me(chef_token):
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {chef_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == CHEF_EMAIL


# ---------- Core listing endpoints ----------
@pytest.mark.parametrize("path,key", [
    ("/api/recipes", "items"),
    ("/api/pantry", "items"),
    ("/api/shopping", "items"),
])
def test_list_endpoints_200(chef_token, path, key):
    r = requests.get(
        f"{BASE_URL}{path}",
        headers={"Authorization": f"Bearer {chef_token}"},
        timeout=20,
    )
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text}"
    body = r.json()
    assert key in body, f"{path} missing '{key}' in {body}"
    assert isinstance(body[key], list)


def test_household_endpoint(chef_token):
    r = requests.get(
        f"{BASE_URL}/api/household",
        headers={"Authorization": f"Bearer {chef_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # household may be None or an object; members is always a list
    assert "household" in body
    assert "members" in body and isinstance(body["members"], list)
