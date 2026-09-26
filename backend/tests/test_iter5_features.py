"""Backend tests for iteration 5 NEW CucinaSmart AI features:
- Cucinato! POST /api/recipes/{id}/cooked (pantry subtract, shopping add, log, stats)
- Ricerca ingredienti GET /api/recipes?q=&cookable=  (missing_count/cookable, staples ignored)
- Modifica ricetta PATCH /api/recipes/{id}
- Statistiche sprechi GET /api/stats/waste?month=YYYY-MM
- Pantry price
- Chef AI POST /api/ai/recipe {query}
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


def _signup(client):
    email = f"TEST_it5_{uuid.uuid4().hex[:8]}@cucinasmart.dev"
    r = client.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email, "password": "TestPass123!", "name": "TEST Iter5",
    })
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return email, tok, {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Cucinato ----------
class TestCooked:
    def test_full_cooked_flow(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        # 1. Pantry: Uova 6 pz (expires in 2 days, price 3.0), Farina 500 g
        u = api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": "Uova", "qty": 6, "unit": "pz", "location": "fridge",
            "expires_at": (today + timedelta(days=2)).isoformat(), "price": 3.0,
        }, headers=h)
        assert u.status_code == 200, u.text
        f = api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": "Farina", "qty": 500, "unit": "g", "location": "pantry",
        }, headers=h)
        assert f.status_code == 200, f.text
        # verify price stored
        pl = api_client.get(f"{BASE_URL}/api/pantry", headers=h).json()["items"]
        uova_p = next(p for p in pl if p["name"].lower() == "uova")
        assert uova_p.get("price") == 3.0, f"price not persisted: {uova_p}"

        # 2. Recipe (servings default = 2) with Uova 2 pz, Farina 200 g, Sale q.b., Latte 200 ml
        rec = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Frittata iter5",
            "servings": 2,
            "ingredients": [
                {"name": "Uova", "qty": 2, "unit": "pz"},
                {"name": "Farina", "qty": 200, "unit": "g"},
                {"name": "Sale", "qty": 1, "unit": "q.b."},
                {"name": "Latte", "qty": 200, "unit": "ml"},
            ],
            "steps": ["sbatti", "cuoci"],
        }, headers=h)
        assert rec.status_code == 200, rec.text
        rid = rec.json()["id"]

        # 3. First cooked call {} → Uova 4, Farina 300, not_found = [Latte], items_saved=1 (Uova has days_left<=3)
        r1 = api_client.post(f"{BASE_URL}/api/recipes/{rid}/cooked", json={}, headers=h)
        assert r1.status_code == 200, r1.text
        j = r1.json()
        # Validate updated
        updated = {u["name"].lower(): u for u in j["updated"]}
        assert "uova" in updated and float(updated["uova"]["left"]) == 4.0, updated
        assert "farina" in updated and float(updated["farina"]["left"]) == 300.0, updated
        # Sale is a staple + q.b. → should be skipped: not in updated, not in not_found
        assert "sale" not in [n.lower() for n in j["not_found"]], j["not_found"]
        assert "latte" in [n.lower() for n in j["not_found"]], j["not_found"]
        assert j["items_saved"] >= 1, j
        # Verify pantry actually updated (GET)
        pl2 = api_client.get(f"{BASE_URL}/api/pantry", headers=h).json()["items"]
        by = {p["name"].lower(): p for p in pl2}
        assert float(by["uova"]["qty"]) == 4.0
        assert float(by["farina"]["qty"]) == 300.0

        # 4. Second call with servings=4 (factor 2) → Uova 4→0, added to shopping w/ note
        r2 = api_client.post(f"{BASE_URL}/api/recipes/{rid}/cooked", json={"servings": 4}, headers=h)
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert "Uova" in j2["finished"] or "uova" in [x.lower() for x in j2["finished"]], j2
        assert any(x.lower() == "uova" for x in j2["added_to_shopping"]), j2
        # Shopping list has Uova with note "Finito cucinando"
        sh = api_client.get(f"{BASE_URL}/api/shopping", headers=h).json()["items"]
        uova_sh = next((s for s in sh if s["name"].lower() == "uova"), None)
        assert uova_sh is not None, "Uova not added to shopping"
        assert uova_sh.get("note", "").startswith("Finito cucinando"), uova_sh

        # 5. Third call → Uova already 0, remains 0 (not negative)
        r3 = api_client.post(f"{BASE_URL}/api/recipes/{rid}/cooked", json={}, headers=h)
        assert r3.status_code == 200
        pl3 = api_client.get(f"{BASE_URL}/api/pantry", headers=h).json()["items"]
        uova3 = next(p for p in pl3 if p["name"].lower() == "uova")
        assert float(uova3["qty"]) >= 0.0
        assert float(uova3["qty"]) == 0.0, f"Uova qty should stay 0, got {uova3['qty']}"

    def test_cooked_unknown_recipe_404(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.post(f"{BASE_URL}/api/recipes/rec_does_not_exist/cooked", json={}, headers=h)
        assert r.status_code == 404


# ---------- Waste Stats ----------
class TestWasteStats:
    def test_stats_after_cooking(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        # Uova with price 3.0 expiring in 1 day (saved item)
        api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": "Uova", "qty": 6, "unit": "pz", "location": "fridge",
            "expires_at": (today + timedelta(days=1)).isoformat(), "price": 3.0,
        }, headers=h)
        rec = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Stats Recipe",
            "servings": 2,
            "ingredients": [{"name": "Uova", "qty": 2, "unit": "pz"}],
            "steps": ["a"],
        }, headers=h).json()
        rid = rec["id"]
        # Cook twice
        api_client.post(f"{BASE_URL}/api/recipes/{rid}/cooked", json={}, headers=h)
        api_client.post(f"{BASE_URL}/api/recipes/{rid}/cooked", json={}, headers=h)

        r = api_client.get(f"{BASE_URL}/api/stats/waste", headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["recipes_cooked"] >= 2, j
        assert j["items_used"] >= 2, j
        assert j["items_saved"] >= 2, j  # uova had days_left<=3
        # money_saved uses price 3.0 per saved use
        assert j["money_saved"] >= 6.0, j
        # month is YYYY-MM
        assert len(j["month"]) == 7 and j["month"][4] == "-"

    def test_stats_bad_month(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.get(f"{BASE_URL}/api/stats/waste?month=bad", headers=h)
        assert r.status_code == 400

    def test_stats_old_month_zeros(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.get(f"{BASE_URL}/api/stats/waste?month=2020-01", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["recipes_cooked"] == 0
        assert j["items_used"] == 0
        assert j["items_saved"] == 0
        assert j["money_saved"] == 0


# ---------- Search + Cookable ----------
class TestSearchAndCookable:
    def test_search_by_ingredient_and_cookable_flag(self, api_client):
        _, _, h = _signup(api_client)
        # Pantry: Farina present, Uova present. Latte MISSING.
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "Farina", "qty": 500, "unit": "g"}, headers=h)
        api_client.post(f"{BASE_URL}/api/pantry", json={"name": "Uova", "qty": 6, "unit": "pz"}, headers=h)

        # Recipe A: only non-staples are Farina + Sale q.b. → cookable
        rA = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Pane semplice",
            "ingredients": [
                {"name": "Farina", "qty": 300, "unit": "g"},
                {"name": "Sale", "qty": 1, "unit": "q.b."},
            ],
            "steps": ["impasta"],
        }, headers=h).json()
        # Recipe B: needs Farina + Latte (missing) → not cookable, missing_count>=1
        rB = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Crepes",
            "ingredients": [
                {"name": "Farina", "qty": 200, "unit": "g"},
                {"name": "Latte", "qty": 250, "unit": "ml"},
            ],
            "steps": ["mescola"],
        }, headers=h).json()

        # Search q=farina → both recipes
        r = api_client.get(f"{BASE_URL}/api/recipes?q=farina", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        titles = {i["title"] for i in items}
        assert "TEST Pane semplice" in titles
        assert "TEST Crepes" in titles
        # Each item has missing_count and cookable
        for it in items:
            assert "missing_count" in it and "cookable" in it, it
            assert isinstance(it["cookable"], bool)
            assert isinstance(it["missing_count"], int)
        pane = next(i for i in items if i["title"] == "TEST Pane semplice")
        crepes = next(i for i in items if i["title"] == "TEST Crepes")
        assert pane["cookable"] is True, f"Pane should be cookable (staple Sale ignored): {pane}"
        assert pane["missing_count"] == 0
        assert crepes["cookable"] is False, f"Crepes needs Latte: {crepes}"
        assert crepes["missing_count"] >= 1

        # cookable=true filter
        rc = api_client.get(f"{BASE_URL}/api/recipes?cookable=true", headers=h)
        assert rc.status_code == 200
        items_c = rc.json()["items"]
        for it in items_c:
            assert it["cookable"] is True, it


# ---------- PATCH recipe ----------
class TestPatchRecipe:
    def test_patch_updates_and_normalizes(self, api_client):
        _, _, h = _signup(api_client)
        rec = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Orig",
            "ingredients": [{"name": "Pasta", "qty": 200, "unit": "g"}],
            "steps": ["s1"],
        }, headers=h).json()
        rid = rec["id"]
        # PATCH title + new ingredients + steps
        patch = api_client.patch(f"{BASE_URL}/api/recipes/{rid}", json={
            "title": "TEST Updated",
            "ingredients": [
                {"name": "Farina", "qty": "250", "unit": "g"},  # qty as string → should normalize to number
                {"name": "  Sale ", "qty": 1, "unit": "q.b."},
            ],
            "steps": ["step A", "step B", "step C"],
        }, headers=h)
        assert patch.status_code == 200, patch.text
        # GET
        g = api_client.get(f"{BASE_URL}/api/recipes/{rid}", headers=h).json()
        assert g["title"] == "TEST Updated"
        assert len(g["ingredients"]) == 2
        # qty normalized to number
        farina = next(i for i in g["ingredients"] if i["name"].lower() == "farina")
        assert isinstance(farina["qty"], (int, float)), f"qty not normalized: {farina}"
        assert float(farina["qty"]) == 250.0
        assert len(g["steps"]) == 3


# ---------- Chef AI recipe ----------
class TestAiRecipe:
    def test_ai_recipe_generates_valid(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.post(f"{BASE_URL}/api/ai/recipe", json={"query": "pasta alla carbonara"},
                            headers=h, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        j = r.json()
        assert "recipe" in j
        rec = j["recipe"]
        assert rec.get("title"), rec
        ings = rec.get("ingredients") or []
        assert len(ings) >= 2, ings
        # normalized qty/unit
        for ing in ings:
            assert "name" in ing and "qty" in ing and "unit" in ing, ing
            assert isinstance(ing["qty"], (int, float)), ing
        steps = rec.get("steps") or []
        assert len(steps) >= 3, f"steps must be >=3, got {steps}"

    def test_ai_recipe_empty_query_400(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.post(f"{BASE_URL}/api/ai/recipe", json={"query": ""}, headers=h)
        assert r.status_code == 400, r.text
