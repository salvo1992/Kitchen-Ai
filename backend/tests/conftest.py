import os
import io
import base64
import uuid
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

if not BASE_URL:
    raise RuntimeError("EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL not set")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _make_realistic_jpeg_bytes():
    # Real visual features: gradient + shapes + text-like lines
    img = Image.new("RGB", (256, 256), (240, 230, 200))
    d = ImageDraw.Draw(img)
    for i in range(256):
        d.line([(0, i), (256, i)], fill=(200 - i // 3, 150, 100 + i // 4))
    d.rectangle([30, 30, 120, 120], fill=(180, 60, 40), outline=(0, 0, 0), width=3)
    d.ellipse([140, 140, 230, 230], fill=(80, 140, 90), outline=(0, 0, 0), width=3)
    # simulate menu text lines
    for y in range(40, 220, 20):
        d.line([(140, y), (230, y)], fill=(20, 20, 20), width=2)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@pytest.fixture(scope="session")
def jpeg_bytes():
    return _make_realistic_jpeg_bytes()


@pytest.fixture(scope="session")
def jpeg_b64(jpeg_bytes):
    return base64.b64encode(jpeg_bytes).decode()


TEST_EMAIL = f"test_{uuid.uuid4().hex[:8]}@cucinasmart.dev"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "TEST Cucina User"


@pytest.fixture(scope="session")
def test_user_credentials():
    return {"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}


@pytest.fixture(scope="session")
def auth_token(api_client, test_user_credentials):
    """Sign up test user once for the entire session and return session_token."""
    r = api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return data["session_token"]


@pytest.fixture()
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
