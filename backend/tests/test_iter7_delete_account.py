"""Iteration 7 - DELETE /api/auth/account and household edge cases."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")


def _signup(name_prefix="TEST_del"):
    email = f"{name_prefix}_{uuid.uuid4().hex[:10]}@cucinasmart.dev"
    pw = "TestPass123!"
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": pw, "name": "TEST User"})
    assert r.status_code == 200, r.text
    return email, pw, r.json()["session_token"]


def _headers(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Existing routes still work (httpx / recipes) ----------
class TestExistingRoutes:
    def test_recipes_list_still_works(self):
        _, _, tok = _signup("TEST_reg")
        r = requests.get(f"{BASE_URL}/api/recipes", headers=_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("items"), list)
        # cleanup
        requests.delete(f"{BASE_URL}/api/auth/account", headers=_headers(tok))

    def test_barcode_lookup_uses_httpx(self):
        _, _, tok = _signup("TEST_bar")
        r = requests.get(f"{BASE_URL}/api/products/barcode/3017624010701", headers=_headers(tok))
        # OpenFoodFacts may or may not return the product but the endpoint must not 500
        assert r.status_code == 200, r.text
        data = r.json()
        assert "found" in data and "barcode" in data
        requests.delete(f"{BASE_URL}/api/auth/account", headers=_headers(tok))


# ---------- DELETE /api/auth/account happy-path ----------
class TestDeleteAccountFlow:
    def test_full_delete_flow(self):
        email, pw, tok = _signup("TEST_full")
        h = _headers(tok)

        # 1 recipe
        rec = requests.post(f"{BASE_URL}/api/recipes", headers=h, json={
            "title": "TEST_recipe", "ingredients": [{"name": "sale", "qty": 1, "unit": "q.b."}],
            "steps": ["step"], "servings": 2,
        })
        assert rec.status_code == 200, rec.text
        recipe_id = rec.json()["id"]

        # 1 pantry item
        pn = requests.post(f"{BASE_URL}/api/pantry", headers=h, json={"name": "TEST_farina", "qty": 1, "unit": "kg"})
        assert pn.status_code == 200, pn.text

        # 1 shopping item
        sh = requests.post(f"{BASE_URL}/api/shopping", headers=h, json={"name": "TEST_pane", "qty": 1, "unit": "pz"})
        assert sh.status_code == 200, sh.text

        # 1 meal
        ml = requests.post(f"{BASE_URL}/api/meals", headers=h, json={"date": "2026-01-15", "slot": "pranzo", "title": "TEST_recipe", "recipe_id": recipe_id})
        assert ml.status_code == 200, ml.text

        # cook
        ck = requests.post(f"{BASE_URL}/api/recipes/{recipe_id}/cooked", headers=h, json={"servings": 2})
        assert ck.status_code == 200, ck.text

        # DELETE account
        d = requests.delete(f"{BASE_URL}/api/auth/account", headers=h)
        assert d.status_code == 200, d.text
        assert d.json() == {"ok": True}

        # Old token invalid
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert me.status_code == 401, me.text

        # signin with same credentials fails
        si = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": email, "password": pw})
        assert si.status_code in (400, 401), si.text

        # signup again with same email works, fresh state
        r2 = requests.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": pw, "name": "TEST User"})
        assert r2.status_code == 200, r2.text
        tok2 = r2.json()["session_token"]
        h2 = _headers(tok2)

        recs = requests.get(f"{BASE_URL}/api/recipes", headers=h2)
        assert recs.status_code == 200
        assert recs.json().get("items") == []

        pnt = requests.get(f"{BASE_URL}/api/pantry", headers=h2)
        assert pnt.status_code == 200
        pnt_data = pnt.json()
        # accept either shape - just verify empty
        empty = (pnt_data == [] or pnt_data.get("items") == [] if isinstance(pnt_data, dict) else False)
        assert empty, f"expected empty pantry, got {pnt_data}"

        # cleanup
        requests.delete(f"{BASE_URL}/api/auth/account", headers=h2)


# ---------- Household cases ----------
class TestHouseholdDeletion:
    def test_member_delete_and_owner_delete(self):
        # A creates household
        _, _, tokA = _signup("TEST_hhA")
        hA = _headers(tokA)
        cA = requests.post(f"{BASE_URL}/api/household", headers=hA, json={"name": "TEST_family"})
        assert cA.status_code == 200, cA.text
        hh = cA.json()["household"]
        invite = hh["invite_code"]

        # B joins
        _, _, tokB = _signup("TEST_hhB")
        hB = _headers(tokB)
        jB = requests.post(f"{BASE_URL}/api/household/join", headers=hB, json={"invite_code": invite})
        assert jB.status_code == 200, jB.text
        members_after_join = jB.json()["members"]
        assert len(members_after_join) == 2

        # B deletes account
        dB = requests.delete(f"{BASE_URL}/api/auth/account", headers=hB)
        assert dB.status_code == 200, dB.text

        # A sees only A in members
        vA = requests.get(f"{BASE_URL}/api/household", headers=hA)
        assert vA.status_code == 200, vA.text
        m = vA.json()["members"]
        assert len(m) == 1

        # A deletes account -> household removed; new user cannot join with old invite
        dA = requests.delete(f"{BASE_URL}/api/auth/account", headers=hA)
        assert dA.status_code == 200, dA.text

        _, _, tokC = _signup("TEST_hhC")
        hC = _headers(tokC)
        jC = requests.post(f"{BASE_URL}/api/household/join", headers=hC, json={"invite_code": invite})
        assert jC.status_code == 404, jC.text
        requests.delete(f"{BASE_URL}/api/auth/account", headers=hC)
