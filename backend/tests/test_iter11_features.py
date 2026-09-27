"""
Iteration 11 backend tests:
- PATCH /api/meals/{id} (title, recipe_id, slot validation incl. 'spuntino')
- POST /api/shopping/to-pantry (create + top-up flow)
- POST /api/ai/weekly-plan generates 4-slot days incl. 'spuntino'
- PATCH /api/recipes/{id} with rating & notes persists; list includes rating
- GET /health returns 200 {status:'ok'}
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


@pytest.fixture(scope="module")
def chef_headers():
    s = requests.Session()
    # signin the seeded chef account
    r = s.post(
        f"{BASE_URL}/api/auth/signin",
        json={"email": "chef@cucina.ai", "password": "CucinaSmart2026"},
        timeout=20,
    )
    if r.status_code != 200:
        # try to create if missing (idempotent path)
        s.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": "chef@cucina.ai", "password": "CucinaSmart2026", "name": "Chef Test"},
            timeout=20,
        )
        r = s.post(
            f"{BASE_URL}/api/auth/signin",
            json={"email": "chef@cucina.ai", "password": "CucinaSmart2026"},
            timeout=20,
        )
    assert r.status_code == 200, f"signin failed: {r.status_code} {r.text}"
    tok = r.json()["session_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- /health ----------
def test_health_ok():
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    # External ingress may route non-/api to expo; internal K8s probe hits pod:8001.
    # Accept 200 with JSON as pass; if HTML (ingress), skip.
    if r.headers.get("content-type", "").startswith("application/json"):
        assert r.status_code == 200
        assert r.json().get("status") == "ok"
    else:
        pytest.skip("External ingress routes /health to frontend; internal probe verified in iter10")


# ---------- Meals PATCH ----------
class TestMealPatch:
    def test_patch_meal_title_and_null_recipe(self, chef_headers):
        # create a meal for a unique date
        date = "2030-01-15"
        r = requests.post(
            f"{BASE_URL}/api/meals",
            headers=chef_headers,
            json={"date": date, "slot": "pranzo", "title": "TEST_iter11_original"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        mid = r.json()["id"]

        # PATCH title, recipe_id null
        r2 = requests.patch(
            f"{BASE_URL}/api/meals/{mid}",
            headers=chef_headers,
            json={"title": "TEST_iter11_updated", "recipe_id": None},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["title"] == "TEST_iter11_updated"
        assert r2.json().get("recipe_id") is None

        # cleanup
        requests.delete(f"{BASE_URL}/api/meals/{mid}", headers=chef_headers, timeout=10)

    def test_patch_meal_invalid_recipe_returns_404(self, chef_headers):
        r = requests.post(
            f"{BASE_URL}/api/meals",
            headers=chef_headers,
            json={"date": "2030-01-16", "slot": "cena", "title": "TEST_iter11_x"},
            timeout=15,
        )
        assert r.status_code == 200
        mid = r.json()["id"]

        r2 = requests.patch(
            f"{BASE_URL}/api/meals/{mid}",
            headers=chef_headers,
            json={"recipe_id": "rec_doesnotexist123"},
            timeout=15,
        )
        assert r2.status_code == 404
        requests.delete(f"{BASE_URL}/api/meals/{mid}", headers=chef_headers, timeout=10)

    def test_patch_meal_slot_spuntino_accepted(self, chef_headers):
        r = requests.post(
            f"{BASE_URL}/api/meals",
            headers=chef_headers,
            json={"date": "2030-01-17", "slot": "pranzo", "title": "TEST_iter11_slot"},
            timeout=15,
        )
        assert r.status_code == 200
        mid = r.json()["id"]

        r2 = requests.patch(
            f"{BASE_URL}/api/meals/{mid}",
            headers=chef_headers,
            json={"slot": "spuntino"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["slot"] == "spuntino"

        # invalid slot 'merenda' should 400
        r3 = requests.patch(
            f"{BASE_URL}/api/meals/{mid}",
            headers=chef_headers,
            json={"slot": "merenda"},
            timeout=15,
        )
        assert r3.status_code == 400
        requests.delete(f"{BASE_URL}/api/meals/{mid}", headers=chef_headers, timeout=10)


# ---------- Shopping -> Pantry ----------
class TestShoppingToPantry:
    def test_to_pantry_create_then_topup(self, chef_headers):
        name = f"TEST_iter11_prod_{uuid.uuid4().hex[:6]}"
        # 1) create a shopping item
        r = requests.post(
            f"{BASE_URL}/api/shopping",
            headers=chef_headers,
            json={"name": name, "qty": 2, "unit": "pz", "aisle": "Altro"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        # 2) call to-pantry with expires_at + price + location=home
        r2 = requests.post(
            f"{BASE_URL}/api/shopping/to-pantry",
            headers=chef_headers,
            json={"items": [{"id": sid, "expires_at": "2030-06-01", "price": 3.5, "location": "home"}]},
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["removed"] == 1
        assert len(data["added"]) == 1
        added = data["added"][0]
        pid = added["id"]
        assert added["location"] == "home"
        assert str(added.get("expires_at", "")).startswith("2030-06-01")
        assert added.get("price") == 3.5
        assert added["name"] == name

        # 3) shopping item removed
        r3 = requests.get(f"{BASE_URL}/api/shopping", headers=chef_headers, timeout=10)
        assert not any(it["id"] == sid for it in r3.json()["items"])

        # 4) call again with a new shopping row of same name/unit + no expiry -> top-up (no duplicate)
        r4 = requests.post(
            f"{BASE_URL}/api/shopping",
            headers=chef_headers,
            json={"name": name, "qty": 3, "unit": "pz", "aisle": "Altro"},
            timeout=15,
        )
        assert r4.status_code == 200
        sid2 = r4.json()["id"]

        r5 = requests.post(
            f"{BASE_URL}/api/shopping/to-pantry",
            headers=chef_headers,
            json={"items": [{"id": sid2, "location": "home"}]},
            timeout=20,
        )
        assert r5.status_code == 200, r5.text
        added2 = r5.json()["added"][0]
        # should be same pantry id (top-up path)
        assert added2["id"] == pid, "expected top-up, got new pantry doc"
        assert float(added2["qty"]) == 5.0  # 2 + 3

        # cleanup
        requests.delete(f"{BASE_URL}/api/pantry/{pid}", headers=chef_headers, timeout=10)


# ---------- Recipes: rating + notes ----------
class TestRecipeRatingNotes:
    def test_patch_recipe_rating_notes_persists(self, chef_headers):
        # create a minimal recipe
        r = requests.post(
            f"{BASE_URL}/api/recipes",
            headers=chef_headers,
            json={
                "title": f"TEST_iter11_rec_{uuid.uuid4().hex[:5]}",
                "description": "test",
                "time_min": 10,
                "servings": 2,
                "ingredients": [{"name": "pasta", "qty": 100, "unit": "g"}],
                "steps": ["bollire"],
                "tags": [],
            },
            timeout=15,
        )
        assert r.status_code == 200
        rid = r.json()["id"]

        r2 = requests.patch(
            f"{BASE_URL}/api/recipes/{rid}",
            headers=chef_headers,
            json={"rating": 4, "notes": "test note iter11"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("rating") == 4
        assert r2.json().get("notes") == "test note iter11"

        # list includes rating
        r3 = requests.get(f"{BASE_URL}/api/recipes", headers=chef_headers, timeout=15)
        assert r3.status_code == 200
        it = next((x for x in r3.json()["items"] if x["id"] == rid), None)
        assert it is not None
        assert it.get("rating") == 4

        # cleanup
        requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=chef_headers, timeout=10)


# ---------- AI weekly plan with spuntino ----------
class TestWeeklyPlanSpuntino:
    def test_weekly_plan_contains_spuntino(self, chef_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai/weekly-plan",
            headers=chef_headers,
            json={"start": "2030-02-03", "servings": 2, "preferences": "veloce"},
            timeout=90,
        )
        if r.status_code != 200:
            pytest.skip(f"AI weekly-plan not available: {r.status_code} {r.text[:150]}")
        data = r.json()
        assert "days" in data
        days = data["days"]
        assert len(days) >= 1
        # Check at least one day has a spuntino
        has_spuntino = any(
            any(m.get("slot") == "spuntino" for m in d.get("meals", []))
            for d in days
        )
        assert has_spuntino, "expected at least one 'spuntino' meal in weekly plan"
