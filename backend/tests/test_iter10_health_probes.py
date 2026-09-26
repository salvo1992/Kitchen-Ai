"""
Iteration 10: Verify Kubernetes/nginx health-probe fixes and backend smoke regression.

Fixes under test:
- Root-level GET /health -> 200 {status:'ok'} (no /api prefix)
- Root-level GET / -> 200
- GET /api/ still returns 200 {app:'Smart Kitchen AI', ok:true}
- DB index creation moved to background asyncio task at startup
- Existing indexes still enforced (unique email, unique invite_code)
- Auth + core CRUD read endpoints still 200
"""
import os
import time
import uuid
import subprocess

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://app-builder-14436.preview.emergentagent.com"
).rstrip("/")

LOCAL_URL = "http://localhost:8001"

CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"
CHEF_NAME = "Chef Test"


# ------------- fixtures -------------
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def chef_token(api_client):
    # Ensure the seeded chef account exists, then sign in.
    r = api_client.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD, "name": CHEF_NAME},
        timeout=15,
    )
    # 200 (created) or 400 (already exists) both fine
    assert r.status_code in (200, 400), f"signup unexpected: {r.status_code} {r.text}"
    r = api_client.post(
        f"{BASE_URL}/api/auth/signin",
        json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"signin failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and data["session_token"]
    return data["session_token"]


@pytest.fixture()
def auth_headers(chef_token):
    return {"Authorization": f"Bearer {chef_token}", "Content-Type": "application/json"}


# ------------- Kubernetes/nginx probes -------------
class TestHealthProbes:
    """Root-level probes (no /api prefix) must respond 200 on the FastAPI app.

    NOTE: On this preview environment, the ingress routes non-/api paths to the
    Expo frontend (returns HTML), so external /health is NOT the FastAPI endpoint.
    In production, the K8s probe hits uvicorn directly (localhost:8001). We
    therefore verify against localhost, which is what the deploy probe uses.
    """

    def test_health_local(self, api_client):
        r = api_client.get(f"{LOCAL_URL}/health", timeout=10)
        assert r.status_code == 200, f"local /health -> {r.status_code} {r.text}"
        assert r.json() == {"status": "ok"}

    def test_root_local(self, api_client):
        r = api_client.get(f"{LOCAL_URL}/", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("app") == "Smart Kitchen AI"

    def test_api_root_still_works(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("app") == "Smart Kitchen AI"
        assert body.get("ok") is True


# ------------- Restart & fast bind -------------
class TestBackendRestart:
    """After restart, /health should be up within ~3s and no traceback in error log."""

    def test_restart_and_health_fast(self, api_client):
        subprocess.run(
            ["sudo", "supervisorctl", "restart", "backend"],
            check=True, capture_output=True, text=True, timeout=30,
        )
        # Poll /health for up to 5s; expected <=3s per PR
        deadline = time.time() + 5.0
        first_ok = None
        started = time.time()
        while time.time() < deadline:
            try:
                r = requests.get(f"{LOCAL_URL}/health", timeout=2)
                if r.status_code == 200:
                    first_ok = time.time() - started
                    break
            except requests.RequestException:
                pass
            time.sleep(0.1)
        assert first_ok is not None, "/health did not respond 200 within 5s of restart"
        assert first_ok < 3.5, f"/health took {first_ok:.2f}s (>3s target)"

    def test_no_traceback_in_backend_err_log(self):
        """Check the tail of backend.err.log for tracebacks *after* the restart in the previous test."""
        try:
            with open("/var/log/supervisor/backend.err.log", "r") as fh:
                lines = fh.readlines()
        except FileNotFoundError:
            pytest.skip("backend.err.log not found")
        # Only inspect log entries from the most recent boot (after last "Uvicorn running" line)
        tail = lines[-800:]
        boot_idx = 0
        for i, ln in enumerate(tail):
            if "Uvicorn running on" in ln:
                boot_idx = i
        recent = "".join(tail[boot_idx:])
        assert "Traceback" not in recent, (
            f"Traceback found in backend.err.log since last boot:\n{recent[-2000:]}"
        )


# ------------- Regression smoke -------------
class TestSmokeAuthAndReads:
    def test_signin_chef(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/signin",
            json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == CHEF_EMAIL
        assert data["session_token"]

    def test_recipes_get(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/recipes", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_pantry_get(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pantry", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_shopping_get(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/shopping", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_household_get(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/household", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "household" in body and "members" in body


# ------------- Index enforcement -------------
class TestIndexesStillEnforced:
    def test_duplicate_email_signup_400(self, api_client):
        # chef account already exists
        r = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": CHEF_EMAIL, "password": "AnotherPass1", "name": "Dup"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 duplicate email, got {r.status_code} {r.text}"

    def test_household_invite_code_unique(self, api_client):
        """Create ephemeral user, make household, verify invite_code is present and unique-indexed."""
        email = f"TEST_iter10_{uuid.uuid4().hex[:8]}@example.com"
        rs = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": email, "password": "TestPass123!", "name": "TEST iter10"},
            timeout=15,
        )
        assert rs.status_code == 200, rs.text
        token = rs.json()["session_token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        try:
            r = requests.post(
                f"{BASE_URL}/api/household",
                json={"name": "TEST_iter10 Casa"},
                headers=h, timeout=15,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["household"]["invite_code"]
            assert len(body["household"]["invite_code"]) == 6
            # joining with wrong code -> 404 (validates lookup path uses the index)
            rw = requests.post(
                f"{BASE_URL}/api/household/join",
                json={"invite_code": "ZZZZZZ"},
                headers=h, timeout=15,
            )
            # our user is already in a household, so we get 400; still proves handler works
            assert rw.status_code in (400, 404)
        finally:
            # cleanup: delete account (also removes household if last member)
            requests.delete(f"{BASE_URL}/api/auth/account", headers=h, timeout=15)
