"""Iteration 15 backend tests - Smart Kitchen AI non-food pantry + AI expiry OCR.

Coverage:
- POST /api/pantry non-food (disposable/cleaning/hygiene/home) → kind, is_estimate, expires_at defaults
- POST /api/pantry food/fridge no expiry → unchanged (null)
- GET /api/pantry/duration-estimate → default and learned
- POST /api/pantry/{id}/finished → learn duration, qty=0, add to shopping with aisle
- POST /api/shopping aisle forcing for non-food names
- POST /api/shopping/to-pantry non-food location without expiry
- GET /api/products/barcode/<code>  (Nutella food; toothpaste accept whatever external returns)
- POST /api/ai/read-expiry  (Gemini vision, ~15-30s)
- GET /api/household members include 'diet' key
- POST /api/ai/expiring-recipe ignores non_food
"""
import os
import io
import base64
import uuid
import time
import pytest
import requests
from datetime import date, timedelta
from PIL import Image, ImageDraw, ImageFont

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")

CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"


@pytest.fixture(scope="module")
def chef_token():
    r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=15)
    if r.status_code != 200:
        r2 = requests.post(f"{BASE_URL}/api/auth/signup", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD, "name": "Chef Test"}, timeout=15)
        assert r2.status_code == 200, r2.text
        return r2.json()["session_token"]
    return r.json()["session_token"]


@pytest.fixture()
def chef_headers(chef_token):
    return {"Authorization": f"Bearer {chef_token}", "Content-Type": "application/json"}


# ------------------- Pantry non-food creation -------------------

class TestPantryNonFood:
    created_ids: list = []

    def _post(self, chef_headers, payload):
        r = requests.post(f"{BASE_URL}/api/pantry", json=payload, headers=chef_headers, timeout=15)
        assert r.status_code == 200, f"{payload} -> {r.status_code} {r.text}"
        data = r.json()
        self.created_ids.append(data["id"])
        return data

    def test_disposable_default_21d(self, chef_headers):
        unique = f"TEST_Tovaglioli_{uuid.uuid4().hex[:6]}"
        d = self._post(chef_headers, {"name": unique, "location": "disposable"})
        today = date.today()
        exp = date.fromisoformat(d["expires_at"][:10])
        delta = (exp - today).days
        assert d["kind"] == "non_food", d
        assert d["is_estimate"] is True
        assert 20 <= delta <= 22, f"expected ~21d got {delta}"
        assert d["purchased_at"] == today.isoformat()

    def test_cleaning_default_45d(self, chef_headers):
        unique = f"TEST_Detersivo_{uuid.uuid4().hex[:6]}"
        d = self._post(chef_headers, {"name": unique, "location": "cleaning"})
        delta = (date.fromisoformat(d["expires_at"][:10]) - date.today()).days
        assert d["kind"] == "non_food" and d["is_estimate"] is True
        assert 44 <= delta <= 46, f"expected ~45d got {delta}"

    def test_hygiene_default_30d(self, chef_headers):
        unique = f"TEST_Dentifricio_{uuid.uuid4().hex[:6]}"
        d = self._post(chef_headers, {"name": unique, "location": "hygiene"})
        delta = (date.fromisoformat(d["expires_at"][:10]) - date.today()).days
        assert d["kind"] == "non_food" and d["is_estimate"] is True
        assert 29 <= delta <= 31, f"expected ~30d got {delta}"

    def test_food_fridge_no_expiry(self, chef_headers):
        unique = f"TEST_FoodFridge_{uuid.uuid4().hex[:6]}"
        d = self._post(chef_headers, {"name": unique, "location": "fridge"})
        assert d["kind"] == "food"
        assert d["is_estimate"] is False
        assert d.get("expires_at") in (None, "")

    @classmethod
    def teardown_class(cls):
        # best-effort cleanup via a fresh signin
        try:
            tok = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=10).json()["session_token"]
            headers = {"Authorization": f"Bearer {tok}"}
            for pid in cls.created_ids:
                requests.delete(f"{BASE_URL}/api/pantry/{pid}", headers=headers, timeout=10)
        except Exception:
            pass


# ------------------- Duration-estimate + finished flow -------------------

class TestFinishedFlow:
    pantry_id = None
    shopping_id = None
    unique_name = f"TEST_Tovaglioli_fin_{uuid.uuid4().hex[:6]}"

    def test_01_default_estimate(self, chef_headers):
        r = requests.get(f"{BASE_URL}/api/pantry/duration-estimate",
                         params={"name": self.__class__.unique_name, "location": "disposable"}, headers=chef_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["days"] == 21
        assert data["source"] == "default"

    def test_02_create_pantry_non_food(self, chef_headers):
        r = requests.post(f"{BASE_URL}/api/pantry",
                          json={"name": self.__class__.unique_name, "location": "disposable"}, headers=chef_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        self.__class__.pantry_id = d["id"]
        # force purchased_at a few days back to make lasted_days computable
        from pymongo import MongoClient
        # Can't easily reach mongo w/o config; rely on today = 1 day
        # (lasted_days will be at least 1 because of max(1, ...))
        assert d["is_estimate"] is True

    def test_03_finished_reorder(self, chef_headers):
        pid = self.__class__.pantry_id
        assert pid, "pantry_id missing"
        r = requests.post(f"{BASE_URL}/api/pantry/{pid}/finished", json={"reorder": True}, headers=chef_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["lasted_days"] >= 1
        assert isinstance(data["new_estimate_days"], int)
        added = data.get("added_to_shopping")
        assert added is not None, "expected shopping entry on first finish"
        assert added["aisle"] == "Usa e getta"
        assert added["name"].lower().startswith("test_tovaglioli")
        self.__class__.shopping_id = added["id"]

        # pantry qty 0
        pantry_items = requests.get(f"{BASE_URL}/api/pantry", headers=chef_headers, timeout=10).json()["items"]
        row = next((p for p in pantry_items if p["id"] == pid), None)
        assert row is not None
        assert row["qty"] == 0

    def test_04_duration_now_learned(self, chef_headers):
        r = requests.get(f"{BASE_URL}/api/pantry/duration-estimate",
                         params={"name": self.__class__.unique_name, "location": "disposable"}, headers=chef_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["source"] == "learned", data

    def test_05_finished_no_duplicate(self, chef_headers):
        # Create a fresh pantry item with same name, then finish → should NOT add new shopping row
        r = requests.post(f"{BASE_URL}/api/pantry",
                          json={"name": self.__class__.unique_name, "location": "disposable"}, headers=chef_headers, timeout=10)
        pid2 = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/pantry/{pid2}/finished", json={"reorder": True}, headers=chef_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["added_to_shopping"] is None, f"expected no duplicate, got {data['added_to_shopping']}"
        # cleanup
        requests.delete(f"{BASE_URL}/api/pantry/{pid2}", headers=chef_headers, timeout=10)

    def test_06_finished_unknown_404(self, chef_headers):
        r = requests.post(f"{BASE_URL}/api/pantry/pan_doesnotexist/finished", json={"reorder": False}, headers=chef_headers, timeout=10)
        assert r.status_code == 404

    @classmethod
    def teardown_class(cls):
        try:
            tok = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=10).json()["session_token"]
            headers = {"Authorization": f"Bearer {tok}"}
            if cls.pantry_id:
                requests.delete(f"{BASE_URL}/api/pantry/{cls.pantry_id}", headers=headers, timeout=10)
            if cls.shopping_id:
                requests.delete(f"{BASE_URL}/api/shopping/{cls.shopping_id}", headers=headers, timeout=10)
        except Exception:
            pass


# ------------------- Shopping aisle forcing -------------------

class TestShoppingAisle:
    created: list = []

    def _post(self, chef_headers, payload):
        r = requests.post(f"{BASE_URL}/api/shopping", json=payload, headers=chef_headers, timeout=10)
        assert r.status_code == 200, f"{payload} -> {r.status_code} {r.text}"
        d = r.json()
        self.__class__.created.append(d["id"])
        return d

    def test_cleaning_forced(self, chef_headers):
        d = self._post(chef_headers, {"name": f"TEST_Detersivo piatti_{uuid.uuid4().hex[:4]}", "aisle": "Frutta e verdura"})
        assert d["aisle"] == "Pulizia casa", d

    def test_hygiene_forced(self, chef_headers):
        d = self._post(chef_headers, {"name": f"TEST_Dentifricio_{uuid.uuid4().hex[:4]}"})
        assert d["aisle"] == "Igiene e bagno", d

    def test_disposable_forced(self, chef_headers):
        d = self._post(chef_headers, {"name": f"TEST_Carta igienica_{uuid.uuid4().hex[:4]}"})
        assert d["aisle"] == "Usa e getta", d

    def test_food_unchanged(self, chef_headers):
        d = self._post(chef_headers, {"name": f"TEST_Mele_{uuid.uuid4().hex[:4]}", "aisle": "Frutta e verdura"})
        assert d["aisle"] == "Frutta e verdura", d

    @classmethod
    def teardown_class(cls):
        try:
            tok = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=10).json()["session_token"]
            headers = {"Authorization": f"Bearer {tok}"}
            for sid in cls.created:
                requests.delete(f"{BASE_URL}/api/shopping/{sid}", headers=headers, timeout=10)
        except Exception:
            pass


# ------------------- shopping/to-pantry non-food -------------------

class TestShoppingToPantry:
    pantry_id = None

    def test_to_pantry_cleaning(self, chef_headers):
        unique = f"TEST_Vetril_{uuid.uuid4().hex[:4]}"
        r = requests.post(f"{BASE_URL}/api/shopping", json={"name": unique, "aisle": "Pulizia casa", "checked": True}, headers=chef_headers, timeout=10)
        sid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/shopping/to-pantry",
                           json={"items": [{"id": sid, "location": "cleaning"}]}, headers=chef_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["added"], data
        p = data["added"][0]
        assert p["kind"] == "non_food", p
        assert p["is_estimate"] is True
        assert p["location"] == "cleaning"
        self.__class__.pantry_id = p["id"]

    @classmethod
    def teardown_class(cls):
        try:
            tok = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=10).json()["session_token"]
            headers = {"Authorization": f"Bearer {tok}"}
            if cls.pantry_id:
                requests.delete(f"{BASE_URL}/api/pantry/{cls.pantry_id}", headers=headers, timeout=10)
        except Exception:
            pass


# ------------------- Barcode lookup -------------------

class TestBarcode:
    def test_food_nutella(self, chef_headers):
        r = requests.get(f"{BASE_URL}/api/products/barcode/3017620422003", headers=chef_headers, timeout=25)
        # External service may be slow or unavailable; accept both outcomes
        assert r.status_code == 200, r.text
        data = r.json()
        if data.get("found"):
            assert "kind" in data and "location" in data
            assert data["kind"] == "food", data
        else:
            pytest.skip(f"OFF returned not-found for 3017620422003: {data}")

    def test_toothpaste(self, chef_headers):
        # Try a known toothpaste EAN (Colgate 3600523391998 or 8700216255592)
        for code in ("3600523391998", "8700216255592"):
            r = requests.get(f"{BASE_URL}/api/products/barcode/{code}", headers=chef_headers, timeout=25)
            if r.status_code != 200:
                continue
            data = r.json()
            if data.get("found"):
                assert "kind" in data and "location" in data
                # if found via beauty, should be non_food/hygiene
                print(f"Barcode {code}: kind={data['kind']} location={data['location']} source={data.get('source')}")
                return
        pytest.skip("Open Beauty Facts did not return products for test codes (acceptable)")


# ------------------- AI read-expiry -------------------

def _make_expiry_image_b64() -> str:
    img = Image.new("RGB", (640, 320), (245, 240, 230))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
        small = font
    d.rectangle([20, 20, 620, 300], outline=(60, 60, 60), width=4)
    d.text((60, 60), "TOVAGLIOLI DI CARTA", fill=(10, 10, 10), font=font)
    d.text((60, 150), "Da consumarsi entro", fill=(30, 30, 30), font=small)
    d.text((60, 200), "12/05/2027", fill=(0, 0, 0), font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class TestReadExpiry:
    def test_read_expiry_png(self, chef_headers):
        b64 = _make_expiry_image_b64()
        r = requests.post(f"{BASE_URL}/api/ai/read-expiry", json={"image_base64": b64}, headers=chef_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        exp = data.get("expires_at")
        print(f"[read-expiry] raw={data.get('raw')} exp={exp} conf={data.get('confidence')}")
        if exp:
            # must be YYYY-MM-DD; tolerance: any valid date
            assert len(exp) == 10 and exp[4] == "-" and exp[7] == "-", f"bad format {exp}"
            # ideally 2027-05-12
            if exp != "2027-05-12":
                print(f"[warn] expected 2027-05-12, got {exp}")
        else:
            pytest.skip(f"OCR did not detect a date (raw={data.get('raw')})")

    def test_read_expiry_invalid_base64(self, chef_headers):
        r = requests.post(f"{BASE_URL}/api/ai/read-expiry", json={"image_base64": "not-base64-at-all!!!"}, headers=chef_headers, timeout=30)
        assert r.status_code in (400, 502), r.status_code


# ------------------- Household diet key -------------------

class TestHouseholdDiet:
    def test_members_include_diet_key(self, chef_headers):
        r = requests.get(f"{BASE_URL}/api/household", headers=chef_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        if data.get("household"):
            members = data["household"].get("members") or data.get("members") or []
            # try both shapes
            if not members and isinstance(data, dict):
                members = data.get("members", [])
            # the field returned by /household on this project
            members = data.get("members", []) if "members" in data else members
            print(f"[household] keys={list(data.keys())} members_count={len(members)}")
            for m in members:
                assert "diet" in m, f"member missing diet key: {m}"
        else:
            pytest.skip(f"chef not in a household: {data}")


# ------------------- Expiring recipe ignores non-food -------------------

class TestExpiringRecipeNonFood:
    created_ids: list = []

    def test_only_non_food_expiring_returns_400(self, chef_headers):
        # Clean out any food expiring items first by inspecting
        pre = requests.get(f"{BASE_URL}/api/pantry/expiring?days=3", headers=chef_headers, timeout=10).json()
        food_exp = [i for i in pre["items"] if i.get("kind") != "non_food"]
        if food_exp:
            pytest.skip(f"chef already has {len(food_exp)} food items expiring; cannot isolate")

        # Add a non-food item expiring in 2 days via PATCH (explicit expires_at)
        r = requests.post(f"{BASE_URL}/api/pantry",
                          json={"name": f"TEST_NF_Expiring_{uuid.uuid4().hex[:4]}", "location": "disposable",
                                "expires_at": (date.today() + timedelta(days=2)).isoformat()},
                          headers=chef_headers, timeout=10)
        assert r.status_code == 200
        self.__class__.created_ids.append(r.json()["id"])

        r2 = requests.post(f"{BASE_URL}/api/ai/expiring-recipe?days=3", headers=chef_headers, timeout=30)
        assert r2.status_code == 400, f"expected 400 when only non-food is expiring, got {r2.status_code} {r2.text}"

    @classmethod
    def teardown_class(cls):
        try:
            tok = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": CHEF_EMAIL, "password": CHEF_PASSWORD}, timeout=10).json()["session_token"]
            headers = {"Authorization": f"Bearer {tok}"}
            for pid in cls.created_ids:
                requests.delete(f"{BASE_URL}/api/pantry/{pid}", headers=headers, timeout=10)
        except Exception:
            pass
