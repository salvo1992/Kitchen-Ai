"""Backend tests for CucinaSmart AI - complete coverage of endpoints."""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


# ---------- Health ----------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_signup_creates_user_and_token(self, auth_token, test_user_credentials):
        # auth_token fixture triggered signup
        assert isinstance(auth_token, str) and len(auth_token) >= 32

    def test_signup_duplicate_email_400(self, api_client, test_user_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        assert r.status_code == 400

    def test_signin_success(self, api_client, test_user_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/signin", json={
            "email": test_user_credentials["email"],
            "password": test_user_credentials["password"],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data
        assert data["user"]["email"] == test_user_credentials["email"].lower()

    def test_signin_wrong_password_401(self, api_client, test_user_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/signin", json={
            "email": test_user_credentials["email"], "password": "wrongpass",
        })
        assert r.status_code == 401

    def test_me_with_bearer(self, api_client, auth_headers, test_user_credentials):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["user"]["email"] == test_user_credentials["email"].lower()

    def test_me_without_bearer_401(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_logout_invalidates_token(self, api_client, test_user_credentials):
        # sign up throw-away user
        r = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": f"TEST_logout_{os.urandom(4).hex()}@cucinasmart.dev",
            "password": "TestPass123!", "name": "TEST Logout"
        })
        assert r.status_code == 200
        token = r.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}
        # ensure valid
        assert api_client.get(f"{BASE_URL}/api/auth/me", headers=headers).status_code == 200
        # logout
        rl = api_client.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert rl.status_code == 200 and rl.json().get("ok") is True
        # now invalidated
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert r2.status_code == 401


# ---------- Recipes CRUD ----------
class TestRecipes:
    _rid = None

    def test_create_recipe(self, api_client, auth_headers):
        payload = {
            "title": "TEST Spaghetti al Pomodoro",
            "description": "Classica ricetta",
            "ingredients": [{"name": "spaghetti", "qty": 200, "unit": "g"}],
            "steps": ["Bollire acqua", "Cuocere pasta", "Condire"],
            "time_min": 20, "servings": 2, "tags": ["primo"], "favorite": False,
        }
        r = api_client.post(f"{BASE_URL}/api/recipes", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["id"].startswith("rec_")
        assert j["title"] == payload["title"]
        assert len(j["steps"]) == 3
        TestRecipes._rid = j["id"]

    def test_list_recipes(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["id"] == TestRecipes._rid for i in items)

    def test_get_recipe_by_id(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/recipes/{TestRecipes._rid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == TestRecipes._rid

    def test_patch_recipe(self, api_client, auth_headers):
        r = api_client.patch(f"{BASE_URL}/api/recipes/{TestRecipes._rid}",
                             json={"favorite": True, "time_min": 25}, headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["favorite"] is True and j["time_min"] == 25

    def test_delete_recipe(self, api_client, auth_headers):
        r = api_client.delete(f"{BASE_URL}/api/recipes/{TestRecipes._rid}", headers=auth_headers)
        assert r.status_code == 200
        # verify deleted
        r2 = api_client.get(f"{BASE_URL}/api/recipes/{TestRecipes._rid}", headers=auth_headers)
        assert r2.status_code == 404


# ---------- Pantry CRUD ----------
class TestPantry:
    _pid = None

    def test_create_pantry_item(self, api_client, auth_headers):
        payload = {"name": "TEST pomodori", "qty": 3, "unit": "pz",
                   "location": "fridge", "expires_at": "2026-12-31"}
        r = api_client.post(f"{BASE_URL}/api/pantry", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["id"].startswith("pan_")
        assert j["location"] == "fridge"
        TestPantry._pid = j["id"]

    def test_list_pantry_location_filter(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pantry?location=fridge", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["id"] == TestPantry._pid for i in items)
        assert all(i["location"] == "fridge" for i in items)

    def test_list_pantry_all(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pantry", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)

    def test_patch_pantry(self, api_client, auth_headers):
        r = api_client.patch(f"{BASE_URL}/api/pantry/{TestPantry._pid}",
                             json={"qty": 5, "location": "pantry"}, headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["qty"] == 5 and j["location"] == "pantry"

    def test_delete_pantry(self, api_client, auth_headers):
        r = api_client.delete(f"{BASE_URL}/api/pantry/{TestPantry._pid}", headers=auth_headers)
        assert r.status_code == 200


# ---------- Shopping list ----------
class TestShopping:
    _sid = None

    def test_create_shopping(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/shopping",
                            json={"name": "TEST latte", "qty": 1, "unit": "L", "aisle": "Latticini"},
                            headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["id"].startswith("shp_")
        TestShopping._sid = j["id"]

    def test_list_shopping(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/shopping", headers=auth_headers)
        assert r.status_code == 200
        assert any(i["id"] == TestShopping._sid for i in r.json()["items"])

    def test_patch_shopping_check(self, api_client, auth_headers):
        r = api_client.patch(f"{BASE_URL}/api/shopping/{TestShopping._sid}",
                             json={"checked": True}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["checked"] is True

    def test_clear_checked(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/shopping/clear-checked", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["deleted"] >= 1
        # verify item gone
        r2 = api_client.get(f"{BASE_URL}/api/shopping", headers=auth_headers)
        assert not any(i["id"] == TestShopping._sid for i in r2.json()["items"])

    def test_delete_shopping(self, api_client, auth_headers):
        # create + delete separate item
        r = api_client.post(f"{BASE_URL}/api/shopping",
                            json={"name": "TEST pane", "aisle": "Panificio"}, headers=auth_headers)
        sid = r.json()["id"]
        rd = api_client.delete(f"{BASE_URL}/api/shopping/{sid}", headers=auth_headers)
        assert rd.status_code == 200


# ---------- Meals ----------
class TestMeals:
    _mid = None

    def test_create_meal(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/meals",
                            json={"date": "2026-01-15", "slot": "cena",
                                  "title": "TEST Risotto", "notes": "buono"},
                            headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["id"].startswith("mea_")
        TestMeals._mid = j["id"]

    def test_list_meals_range(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/meals?start=2026-01-01&end=2026-01-31",
                           headers=auth_headers)
        assert r.status_code == 200
        assert any(i["id"] == TestMeals._mid for i in r.json()["items"])

    def test_list_meals_outside_range(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/meals?start=2027-01-01&end=2027-01-31",
                           headers=auth_headers)
        assert r.status_code == 200
        assert not any(i["id"] == TestMeals._mid for i in r.json()["items"])

    def test_delete_meal(self, api_client, auth_headers):
        r = api_client.delete(f"{BASE_URL}/api/meals/{TestMeals._mid}", headers=auth_headers)
        assert r.status_code == 200


# ---------- AI ----------
class TestAI:
    def test_ai_chat_and_history(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/ai/chat",
                            json={"message": "Ciao, suggerisci un primo veloce."},
                            headers=auth_headers, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "reply" in j and isinstance(j["reply"], str) and len(j["reply"]) > 0
        assert "session_id" in j
        sid = j["session_id"]
        # history
        rh = api_client.get(f"{BASE_URL}/api/ai/history?session_id={sid}", headers=auth_headers)
        assert rh.status_code == 200
        msgs = rh.json()["items"]
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles

    def test_ai_what_can_i_cook_empty_pantry(self, api_client, auth_headers):
        # create isolated user
        import uuid
        email = f"TEST_cook_{uuid.uuid4().hex[:6]}@cucinasmart.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/signup",
                            json={"email": email, "password": "TestPass123!", "name": "cook"})
        assert r.status_code == 200
        t = r.json()["session_token"]
        h = {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}
        rc = api_client.post(f"{BASE_URL}/api/ai/what-can-i-cook", json={}, headers=h, timeout=60)
        assert rc.status_code == 200
        j = rc.json()
        assert "suggestions" in j
        assert j["suggestions"] == []
        assert "message" in j

    def test_ai_what_can_i_cook_with_ingredients(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/ai/what-can-i-cook",
                            json={"ingredients": ["pomodoro", "pasta", "aglio", "olio"]},
                            headers=auth_headers, timeout=120)
        assert r.status_code == 200
        j = r.json()
        assert "suggestions" in j
        # AI may occasionally return empty; ensure list type
        assert isinstance(j["suggestions"], list)
        if j["suggestions"]:
            first = j["suggestions"][0]
            assert "title" in first

    def test_ai_import_photo(self, api_client, auth_headers, jpeg_b64):
        r = api_client.post(f"{BASE_URL}/api/ai/import-photo",
                            json={"image_base64": jpeg_b64},
                            headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "meals" in j
        assert isinstance(j["meals"], list)


# ---------- Upload / Files ----------
class TestUpload:
    def test_upload_and_fetch(self, api_client, auth_headers, auth_token, jpeg_bytes):
        # remove default JSON content-type for multipart
        h = {"Authorization": f"Bearer {auth_token}"}
        files = {"file": ("test.jpg", jpeg_bytes, "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/upload", files=files, headers=h, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "path" in j and "url" in j and "token" in j
        assert j["url"].startswith("/api/files/")
        assert f"token={j['token']}" in j["url"]

        # fetch with token
        rf = requests.get(f"{BASE_URL}{j['url']}", timeout=60)
        assert rf.status_code == 200, rf.text
        assert rf.content[:2] == b"\xff\xd8"  # JPEG SOI marker
        assert rf.headers.get("content-type", "").startswith("image/")

        # fetch with Bearer (no token)
        rf2 = requests.get(f"{BASE_URL}/api/files/{j['path']}", headers=h, timeout=60)
        assert rf2.status_code == 200

        # unauthorized without any auth
        rf3 = requests.get(f"{BASE_URL}/api/files/{j['path']}", timeout=60)
        assert rf3.status_code == 401
