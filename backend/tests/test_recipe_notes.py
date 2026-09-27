"""Test recipe notes/rating PATCH persistence used by RecipeNotes.tsx."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-14436.preview.emergentagent.com").rstrip("/")
EMAIL = "chef@cucina.ai"
PASSWORD = "CucinaSmart2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        # try signup then signin
        requests.post(f"{BASE_URL}/api/auth/signup", json={"email": EMAIL, "password": PASSWORD, "name": "Chef Test"})
        r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def recipe_id(headers):
    body = {
        "title": "TEST_NotesRecipe",
        "time_min": 15,
        "servings": 2,
        "ingredients": [{"name": "pasta", "qty": 200, "unit": "g"}],
        "steps": ["boil", "serve"],
    }
    r = requests.post(f"{BASE_URL}/api/recipes", json=body, headers=headers)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    yield rid
    requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=headers)


def test_patch_rating_persists(headers, recipe_id):
    r = requests.patch(f"{BASE_URL}/api/recipes/{recipe_id}", json={"rating": 4, "notes": "Ottima"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["rating"] == 4
    assert data["notes"] == "Ottima"
    # GET back
    r2 = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["rating"] == 4
    assert r2.json()["notes"] == "Ottima"


def test_patch_rating_null_clears(headers, recipe_id):
    r = requests.patch(f"{BASE_URL}/api/recipes/{recipe_id}", json={"rating": None, "notes": ""}, headers=headers)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}", headers=headers)
    body = r2.json()
    assert body.get("rating") in (None, 0)
    assert body.get("notes", "") == ""


def test_rating_appears_in_list(headers, recipe_id):
    requests.patch(f"{BASE_URL}/api/recipes/{recipe_id}", json={"rating": 5}, headers=headers)
    r = requests.get(f"{BASE_URL}/api/recipes", headers=headers)
    assert r.status_code == 200
    items = r.json()["items"]
    found = next((it for it in items if it["id"] == recipe_id), None)
    assert found is not None
    assert found.get("rating") == 5
