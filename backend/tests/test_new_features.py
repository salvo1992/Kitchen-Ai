"""Backend tests for the NEW CucinaSmart AI features:
- Barcode lookup via Open Food Facts
- Recipe → Shopping (to-shopping) with pantry & duplicate handling
- Recipe ingredient normalization ('200 g', 'q.b.', etc.)
- AI weekly plan generation + save
- Household create/join/leave (family sharing)
"""
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


def _to_num(v):
    try:
        return float(v)
    except Exception:
        return None


def _signup(client):
    email = f"TEST_new_{uuid.uuid4().hex[:8]}@cucinasmart.dev"
    r = client.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": "TestPass123!", "name": "TEST New"})
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return email, tok, {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Barcode lookup ----------
class TestBarcode:
    def test_barcode_known_nutella(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/products/barcode/3017624010701", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["found"] is True
        assert j["barcode"] == "3017624010701"
        assert isinstance(j.get("name"), str) and "nutella" in j["name"].lower()
        # extra keys expected by the client
        for k in ["brand", "qty", "unit", "location"]:
            assert k in j

    def test_barcode_unknown(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/products/barcode/0000000000000", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("found") is False
        assert j.get("barcode") == "0000000000000"

    def test_barcode_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products/barcode/3017624010701", timeout=15)
        assert r.status_code == 401


# ---------- Recipe ingredient normalization ----------
class TestRecipeIngredientNorm:
    def test_normalize_string_and_qb(self, api_client, auth_headers):
        payload = {
            "title": "TEST Normalize",
            "ingredients": [
                {"name": "farina", "qty": "200 g", "unit": ""},   # qty is a string with unit inline
                {"name": "olio", "qty": "q.b.", "unit": ""},      # q.b.
                {"name": "uova", "qty": "2", "unit": "pz"},       # numeric string
                {"name": "sale", "qty": None},                    # missing qty
            ],
            "steps": ["mescola"],
        }
        r = api_client.post(f"{BASE_URL}/api/recipes", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        ings = {i["name"].lower(): i for i in r.json()["ingredients"]}
        # "200 g" as qty string → norm should parse number 200 and unit "g" is optional; check qty
        assert "farina" in ings and _to_num(ings["farina"]["qty"]) == 200
        assert "olio" in ings and (str(ings["olio"]["unit"]).lower().startswith("q") or "q.b." in str(ings["olio"]["unit"]).lower())
        assert "uova" in ings and _to_num(ings["uova"]["qty"]) == 2
        assert "sale" in ings and isinstance(ings["sale"]["qty"], (int, float))
        # cleanup
        api_client.delete(f"{BASE_URL}/api/recipes/{r.json()['id']}", headers=auth_headers)


# ---------- Recipe → Shopping ----------
class TestRecipeToShopping:
    def test_to_shopping_flow(self, api_client, auth_headers):
        # create isolated user so the state is clean
        _, _, h = _signup(api_client)

        # pantry item that should be recognized as already in pantry (matches "pomodori")
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "pomodori", "qty": 3, "unit": "pz", "location": "pantry"}, headers=h)

        # recipe with 3 ingredients: pomodori (in pantry), spaghetti (new), basilico (new)
        rp = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Pasta al pomodoro",
            "ingredients": [
                {"name": "spaghetti", "qty": 200, "unit": "g"},
                {"name": "pomodori pelati", "qty": 400, "unit": "g"},
                {"name": "basilico", "qty": 1, "unit": "mazzo"},
            ],
            "steps": ["boil", "sauce", "mix"],
        }, headers=h)
        assert rp.status_code == 200
        rid = rp.json()["id"]

        # first call: 2 added, 1 in_pantry
        r1 = api_client.post(f"{BASE_URL}/api/recipes/{rid}/to-shopping", headers=h)
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert set(j1.keys()) >= {"added", "in_pantry", "already_listed"}
        assert len(j1["added"]) == 2, j1
        assert any("pomodor" in n.lower() for n in j1["in_pantry"])
        assert j1["already_listed"] == []
        # verify aisle guessed and note attached
        for it in j1["added"]:
            assert it["note"].startswith("Per: TEST Pasta al pomodoro")
            assert isinstance(it["aisle"], str) and it["aisle"]
        aisles = {it["name"].lower(): it["aisle"] for it in j1["added"]}
        assert "Pane e cereali" in aisles.get("spaghetti", "") or aisles.get("spaghetti") == "Pane e cereali"
        # basilico → Frutta e verdura
        assert aisles.get("basilico") == "Frutta e verdura"

        # second call: nothing new, 2 already_listed
        r2 = api_client.post(f"{BASE_URL}/api/recipes/{rid}/to-shopping", headers=h)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2["added"] == []
        # basilico + spaghetti already on list
        assert len(j2["already_listed"]) == 2
        # pomodori still in pantry
        assert any("pomodor" in n.lower() for n in j2["in_pantry"])

    def test_to_shopping_404_for_unknown(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/recipes/rec_nonexistent/to-shopping", headers=auth_headers)
        assert r.status_code == 404


# ---------- Household ----------
class TestHousehold:
    def test_family_flow(self, api_client):
        _, tA, hA = _signup(api_client)
        _, tB, hB = _signup(api_client)

        # A creates household
        r = api_client.post(f"{BASE_URL}/api/household", json={"name": "TEST Casa"}, headers=hA)
        assert r.status_code == 200, r.text
        info = r.json()
        assert info["household"]["name"] == "TEST Casa"
        code = info["household"]["invite_code"]
        assert isinstance(code, str) and len(code) == 6

        # A creates again -> 400
        r2 = api_client.post(f"{BASE_URL}/api/household", json={"name": "again"}, headers=hA)
        assert r2.status_code == 400

        # A adds a pantry item BEFORE join → should still be visible to B after join
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "TEST_familyA_before", "qty": 1, "unit": "pz", "location": "pantry"}, headers=hA)

        # B joins with wrong code -> 404
        rwrong = api_client.post(f"{BASE_URL}/api/household/join", json={"invite_code": "ZZZZZZ"}, headers=hB)
        assert rwrong.status_code == 404

        # B joins with real code
        rj = api_client.post(f"{BASE_URL}/api/household/join", json={"invite_code": code}, headers=hB)
        assert rj.status_code == 200, rj.text
        assert rj.json()["household"]["id"] == info["household"]["id"]

        # GET /household returns 2 members
        rh = api_client.get(f"{BASE_URL}/api/household", headers=hA)
        assert rh.status_code == 200
        assert len(rh.json()["members"]) == 2

        # B sees A's item
        rpB = api_client.get(f"{BASE_URL}/api/pantry", headers=hB)
        assert rpB.status_code == 200
        names_b = [i["name"] for i in rpB.json()["items"]]
        assert "TEST_familyA_before" in names_b

        # A adds AFTER join -> B sees
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "TEST_familyA_after", "qty": 1, "unit": "pz", "location": "pantry"}, headers=hA)
        rpB2 = api_client.get(f"{BASE_URL}/api/pantry", headers=hB)
        assert "TEST_familyA_after" in [i["name"] for i in rpB2.json()["items"]]

        # B adds -> A sees
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "TEST_familyB", "qty": 1, "unit": "pz", "location": "pantry"}, headers=hB)
        rpA = api_client.get(f"{BASE_URL}/api/pantry", headers=hA)
        assert "TEST_familyB" in [i["name"] for i in rpA.json()["items"]]

        # B leaves
        rleave = api_client.post(f"{BASE_URL}/api/household/leave", headers=hB)
        assert rleave.status_code == 200

        # After leave: B no longer sees A items and vice versa
        namesA = [i["name"] for i in api_client.get(f"{BASE_URL}/api/pantry", headers=hA).json()["items"]]
        namesB = [i["name"] for i in api_client.get(f"{BASE_URL}/api/pantry", headers=hB).json()["items"]]
        assert "TEST_familyB" not in namesA
        assert "TEST_familyA_before" not in namesB
        assert "TEST_familyA_after" not in namesB
        # B still owns his own item after leaving
        assert "TEST_familyB" in namesB

        # A leaves (cleanup)
        api_client.post(f"{BASE_URL}/api/household/leave", headers=hA)


# ---------- AI weekly plan (slow) ----------
class TestWeeklyPlan:
    def test_generate_and_save(self, api_client):
        _, _, h = _signup(api_client)

        # a few pantry items to seed the plan
        for it in [
            {"name": "pasta", "qty": 500, "unit": "g", "location": "pantry"},
            {"name": "pomodori", "qty": 3, "unit": "pz", "location": "pantry"},
            {"name": "uova", "qty": 6, "unit": "pz", "location": "fridge"},
        ]:
            api_client.post(f"{BASE_URL}/api/pantry", json=it, headers=h)

        r = api_client.post(f"{BASE_URL}/api/ai/weekly-plan", json={}, headers=h, timeout=180)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "days" in j and len(j["days"]) == 7
        for d in j["days"]:
            assert re.match(r"^\d{4}-\d{2}-\d{2}$", d["date"])
            assert isinstance(d.get("meals"), list) and len(d["meals"]) >= 1
            for m in d["meals"]:
                assert m["slot"] in ["colazione", "pranzo", "cena"]
                rec = m["recipe"]
                assert isinstance(rec.get("title"), str) and rec["title"]
                assert isinstance(rec.get("ingredients"), list) and len(rec["ingredients"]) >= 1
                # ingredients normalized shape
                for ing in rec["ingredients"]:
                    assert isinstance(ing, dict) and "name" in ing and "qty" in ing and "unit" in ing

        # Save the plan
        save_body = {"days": j["days"], "replace": True}
        rs = api_client.post(f"{BASE_URL}/api/ai/weekly-plan/save", json=save_body, headers=h, timeout=90)
        assert rs.status_code == 200, rs.text
        js = rs.json()
        assert js["recipes_created"] >= 1
        assert js["meals_created"] >= 1
        start, end = js["start_date"], js["end_date"]

        # GET /api/meals for that range → should have meals with recipe_id
        rm = api_client.get(f"{BASE_URL}/api/meals?start={start}&end={end}", headers=h)
        assert rm.status_code == 200
        meals = rm.json()["items"]
        assert len(meals) >= 1
        with_recipe = [m for m in meals if m.get("recipe_id")]
        assert with_recipe, "expected at least one meal linked with recipe_id"
        # GET the recipe by id works
        rid = with_recipe[0]["recipe_id"]
        rr = api_client.get(f"{BASE_URL}/api/recipes/{rid}", headers=h)
        assert rr.status_code == 200
        assert rr.json()["id"] == rid
        assert isinstance(rr.json().get("ingredients"), list) and len(rr.json()["ingredients"]) >= 1
