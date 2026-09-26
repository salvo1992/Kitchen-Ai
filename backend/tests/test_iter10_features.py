"""Iteration 10: Recipe rating/notes persistence via PATCH /api/recipes/{id}.

Covers:
 - PATCH {rating: 4, notes: "meno sale"} persists and GET returns rating/notes
 - PATCH {rating: null} clears the rating
 - GET /api/recipes list items include rating field
"""
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


# ---------- auth ----------
@pytest.fixture(scope="module")
def chef_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/signin",
        json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        s = requests.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD, "name": "Chef Test"},
            timeout=15,
        )
        assert s.status_code == 200, f"signup failed: {s.status_code} {s.text}"
        return s.json()["session_token"]
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def h(chef_token):
    return {"Authorization": f"Bearer {chef_token}", "Content-Type": "application/json"}


# ---------- recipe create/update rating & notes ----------
@pytest.fixture(scope="module")
def recipe_id(h):
    payload = {
        "title": "TEST Iter10 Ricetta",
        "description": "test recipe for rating/notes",
        "ingredients": [{"name": "pasta", "qty": 100, "unit": "g"}],
        "steps": ["cuoci"],
        "time_min": 10,
        "servings": 2,
    }
    r = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    yield rid
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=h, timeout=10)
    except Exception:
        pass


def test_patch_rating_and_notes_persists(h, recipe_id):
    r = requests.patch(
        f"{BASE_URL}/api/recipes/{recipe_id}",
        json={"rating": 4, "notes": "meno sale"},
        headers=h,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("rating") == 4, body
    assert body.get("notes") == "meno sale", body

    # GET verifies persistence
    g = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}", headers=h, timeout=15)
    assert g.status_code == 200, g.text
    gb = g.json()
    assert gb.get("rating") == 4
    assert gb.get("notes") == "meno sale"


def test_patch_rating_null_clears(h, recipe_id):
    # ensure it is set first
    requests.patch(
        f"{BASE_URL}/api/recipes/{recipe_id}",
        json={"rating": 5, "notes": "molto buona"},
        headers=h,
        timeout=15,
    )
    # clear rating
    r = requests.patch(
        f"{BASE_URL}/api/recipes/{recipe_id}",
        json={"rating": None},
        headers=h,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    g = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}", headers=h, timeout=15)
    assert g.status_code == 200
    gb = g.json()
    assert gb.get("rating") in (None, 0), f"rating not cleared: {gb.get('rating')}"
    # notes preserved
    assert gb.get("notes") == "molto buona"


def test_recipes_list_includes_rating(h, recipe_id):
    # Set rating on our recipe
    requests.patch(
        f"{BASE_URL}/api/recipes/{recipe_id}",
        json={"rating": 3, "notes": "buona"},
        headers=h,
        timeout=15,
    )
    r = requests.get(f"{BASE_URL}/api/recipes", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    assert isinstance(items, list) and len(items) > 0
    found = [x for x in items if x.get("id") == recipe_id]
    assert found, f"created recipe {recipe_id} not in list"
    assert found[0].get("rating") == 3, found[0]
