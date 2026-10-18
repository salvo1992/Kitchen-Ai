"""Iteration 18 backend smoke tests for auth identity, shop access and coach isolation."""

import os
import uuid

import requests


# Auth + access control + coach privacy smoke coverage for iteration 18
BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL not set")

CHEF_EMAIL = "chef@cucina.ai"
NONNA_EMAIL = "nonna@cucina.ai"
PASSWORD = "CucinaSmart2026"


def _signin(email: str, password: str):
    response = requests.post(
        f"{BASE_URL}/api/auth/signin",
        json={"email": email, "password": password},
        timeout=25,
    )
    assert response.status_code == 200, f"signin failed for {email}: {response.status_code} {response.text}"
    body = response.json()
    assert isinstance(body.get("session_token"), str) and body["session_token"]
    return body["session_token"], body.get("user", {}).get("user_id")


def _auth(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_signin_me_identity_distinct_between_chef_and_nonna():
    chef_token, chef_uid_from_signin = _signin(CHEF_EMAIL, PASSWORD)
    nonna_token, nonna_uid_from_signin = _signin(NONNA_EMAIL, PASSWORD)

    chef_me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(chef_token), timeout=20)
    nonna_me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(nonna_token), timeout=20)

    assert chef_me.status_code == 200
    assert nonna_me.status_code == 200
    chef_uid = chef_me.json().get("user", {}).get("user_id")
    nonna_uid = nonna_me.json().get("user", {}).get("user_id")

    assert chef_uid and nonna_uid
    assert chef_uid == chef_uid_from_signin
    assert nonna_uid == nonna_uid_from_signin
    assert chef_uid != nonna_uid


def test_shop_access_regular_users_no_admin_rights():
    chef_token, _ = _signin(CHEF_EMAIL, PASSWORD)
    nonna_token, _ = _signin(NONNA_EMAIL, PASSWORD)

    chef_access = requests.get(f"{BASE_URL}/api/shop/access", headers=_auth(chef_token), timeout=20)
    nonna_access = requests.get(f"{BASE_URL}/api/shop/access", headers=_auth(nonna_token), timeout=20)

    assert chef_access.status_code == 200
    assert nonna_access.status_code == 200
    assert chef_access.json().get("is_admin") is False
    assert nonna_access.json().get("is_admin") is False


def test_admin_endpoint_forbidden_for_non_admin_user():
    chef_token, _ = _signin(CHEF_EMAIL, PASSWORD)
    forbidden = requests.get(f"{BASE_URL}/api/admin/shop", headers=_auth(chef_token), timeout=20)
    assert forbidden.status_code in (401, 403)


def test_coach_history_isolation_between_accounts():
    chef_token, _ = _signin(CHEF_EMAIL, PASSWORD)
    nonna_token, _ = _signin(NONNA_EMAIL, PASSWORD)
    marker = f"TEST_ITER18_COACH_{uuid.uuid4().hex[:10]}"

    send = requests.post(
        f"{BASE_URL}/api/coach/message",
        json={"message": f"{marker} dammi un consiglio cena"},
        headers=_auth(chef_token),
        timeout=90,
    )
    assert send.status_code == 200, send.text
    items = send.json().get("items", [])
    assert len(items) == 2
    assert items[0].get("role") == "user"
    assert items[1].get("role") == "assistant"
    assert (items[1].get("content") or "").strip()

    chef_history = requests.get(f"{BASE_URL}/api/coach/history", headers=_auth(chef_token), timeout=20)
    nonna_history = requests.get(f"{BASE_URL}/api/coach/history", headers=_auth(nonna_token), timeout=20)
    assert chef_history.status_code == 200
    assert nonna_history.status_code == 200

    chef_text = "\n".join([m.get("content", "") for m in chef_history.json().get("items", [])])
    nonna_text = "\n".join([m.get("content", "") for m in nonna_history.json().get("items", [])])
    assert marker in chef_text
    assert marker not in nonna_text
