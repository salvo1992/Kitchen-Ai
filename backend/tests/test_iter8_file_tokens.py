"""Iteration 8: TTL index removal for file_tokens + upload-base64/files token flow + recipe image_url."""
import os
import base64
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"

# tiny 1x1 red PNG data URI
PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
PNG_DATA_URI = f"data:image/png;base64,{PNG_B64}"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def chef_token():
    r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD})
    if r.status_code != 200:
        # try signup first
        requests.post(f"{BASE_URL}/api/auth/signup", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD, "name": "Chef Test"})
        r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth_hdrs(chef_token):
    return {"Authorization": f"Bearer {chef_token}"}


# ---------- backend healthy ----------
def test_root_ok():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True


# ---------- mongo index check ----------
def test_file_tokens_index_no_ttl():
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            info = await client[DB_NAME].file_tokens.index_information()
            return info
        finally:
            client.close()

    info = asyncio.get_event_loop().run_until_complete(_run()) if not asyncio.get_event_loop().is_running() else asyncio.new_event_loop().run_until_complete(_run())
    # ensure no TTL index
    for name, spec in info.items():
        assert "expireAfterSeconds" not in spec, f"TTL index still present on file_tokens: {name} -> {spec}"
    # ensure compound token+path index exists
    assert "token_1_path_1" in info, f"missing token_1_path_1 index; got {list(info.keys())}"


# ---------- upload flow ----------
@pytest.fixture(scope="module")
def uploaded(auth_hdrs):
    r = requests.post(f"{BASE_URL}/api/upload-base64", headers=auth_hdrs, json={"image_base64": PNG_DATA_URI})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data and "token" in data and "path" in data
    assert data["url"].startswith("/api/files/")
    assert f"token={data['token']}" in data["url"]
    return data


def test_upload_base64_returns_url_and_token(uploaded):
    assert uploaded["url"].startswith("/api/files/")
    assert uploaded["token"]


def test_get_file_with_query_token_no_auth(uploaded):
    url = f"{BASE_URL}{uploaded['url']}"
    r = requests.get(url)  # NO Authorization header
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("image/")


def test_get_file_wrong_token_returns_401(uploaded):
    url = f"{BASE_URL}/api/files/{uploaded['path']}?token=deadbeefnothing"
    r = requests.get(url)
    assert r.status_code == 401


def test_get_file_bearer_no_query_token_ok(uploaded, auth_hdrs):
    url = f"{BASE_URL}/api/files/{uploaded['path']}"
    r = requests.get(url, headers=auth_hdrs)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("image/")


# ---------- recipes PATCH with image_url ----------
def test_recipe_patch_and_get_with_image(auth_hdrs, uploaded):
    # create a recipe
    payload = {"title": "TEST Iter8 Recipe", "ingredients": [{"name": "acqua", "qty": 1, "unit": "l"}], "steps": ["step 1"]}
    r = requests.post(f"{BASE_URL}/api/recipes", headers=auth_hdrs, json=payload)
    assert r.status_code == 200, r.text
    rid = r.json().get("id") or r.json().get("recipe_id")
    assert rid, r.json()

    # patch with image_url
    patch = {"image_url": uploaded["url"]}
    r = requests.patch(f"{BASE_URL}/api/recipes/{rid}", headers=auth_hdrs, json=patch)
    assert r.status_code == 200, r.text

    # get recipe back and check image_url persisted
    r = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=auth_hdrs)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec.get("image_url") == uploaded["url"], rec

    # list
    r = requests.get(f"{BASE_URL}/api/recipes", headers=auth_hdrs)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    assert isinstance(items, list)
    assert any((it.get("id") or it.get("recipe_id")) == rid for it in items)

    # cleanup
    requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=auth_hdrs)
