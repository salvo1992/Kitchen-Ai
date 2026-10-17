"""Iteration 14 backend tests:
- Diet field on user profile (PATCH /api/auth/profile, GET /api/auth/me, signin includes diet)
- Meals member_id validation (own, invalid, null); coexistence of shared + personal in same slot
- Household flow (chef + nonna) with diet field in members
- AI expiring-recipe (Gemini, ~15s)
- AI weekly-plan with member_plans + save + verification (Gemini, ~40-60s)
- AI /ai/recipe with member_id
"""
import os
import uuid
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")

CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"
NONNA_EMAIL = "nonna@cucina.ai"
NONNA_PASSWORD = "CucinaSmart2026"


def _login_or_signup(email, password, name):
    r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": email, "password": password}, timeout=15)
    if r.status_code == 200:
        return r.json()
    r2 = requests.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": password, "name": name}, timeout=15)
    assert r2.status_code == 200, f"signup {email}: {r2.status_code} {r2.text}"
    return r2.json()


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def chef_session():
    data = _login_or_signup(CHEF_EMAIL, CHEF_PASSWORD, "Chef Test")
    return data


@pytest.fixture(scope="module")
def nonna_session():
    data = _login_or_signup(NONNA_EMAIL, NONNA_PASSWORD, "Nonna Test")
    return data


@pytest.fixture(scope="module")
def household(chef_session, nonna_session):
    """Ensure chef has a household and nonna is a member. Returns household dict."""
    ct = chef_session["session_token"]
    nt = nonna_session["session_token"]
    # Get chef household
    r = requests.get(f"{BASE_URL}/api/household", headers=_hdr(ct), timeout=15)
    assert r.status_code == 200
    h = r.json()
    if not h.get("household"):
        r2 = requests.post(f"{BASE_URL}/api/household", headers=_hdr(ct), json={"name": "Famiglia Chef"}, timeout=15)
        assert r2.status_code == 200, r2.text
        h = r2.json()
    invite = h["household"]["invite_code"]
    # Ensure nonna in the same household
    rn = requests.get(f"{BASE_URL}/api/household", headers=_hdr(nt), timeout=15)
    nh = rn.json()
    if not nh.get("household") or nh["household"]["id"] != h["household"]["id"]:
        # If in another household, leave first
        if nh.get("household"):
            requests.post(f"{BASE_URL}/api/household/leave", headers=_hdr(nt), timeout=15)
        rj = requests.post(f"{BASE_URL}/api/household/join", headers=_hdr(nt), json={"invite_code": invite}, timeout=15)
        assert rj.status_code == 200, rj.text
    # Return final household view for chef
    rf = requests.get(f"{BASE_URL}/api/household", headers=_hdr(ct), timeout=15)
    return rf.json()


# =====================================================================
# 1) DIET FIELD on user
# =====================================================================
class TestDietProfile:
    def test_signin_response_includes_diet(self, chef_session):
        assert "diet" in chef_session["user"], "signin response missing 'diet' key"

    def test_patch_diet_and_me_reflects(self, chef_session):
        tok = chef_session["session_token"]
        val = "Vegetariana (TEST)"
        r = requests.patch(f"{BASE_URL}/api/auth/profile", headers=_hdr(tok), json={"diet": val}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["diet"] == val
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=15)
        assert me.status_code == 200
        assert me.json()["user"]["diet"] == val

    def test_patch_diet_empty_clears(self, chef_session):
        tok = chef_session["session_token"]
        r = requests.patch(f"{BASE_URL}/api/auth/profile", headers=_hdr(tok), json={"diet": ""}, timeout=15)
        assert r.status_code == 200
        assert (r.json()["user"].get("diet") or "") == ""
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=15).json()
        assert (me["user"].get("diet") or "") == ""


# =====================================================================
# 2) MEALS member_id validation
# =====================================================================
class TestMealsMemberId:
    def test_create_meal_with_own_member_id(self, chef_session, household):
        tok = chef_session["session_token"]
        uid = chef_session["user"]["user_id"]
        today = date.today().isoformat()
        payload = {"date": today, "slot": "pranzo", "title": "TEST_M14_ownmember", "member_id": uid}
        r = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["member_id"] == uid
        # cleanup
        requests.delete(f"{BASE_URL}/api/meals/{m['id']}", headers=_hdr(tok), timeout=15)

    def test_create_meal_with_invalid_member_id_returns_400(self, chef_session):
        tok = chef_session["session_token"]
        today = date.today().isoformat()
        payload = {"date": today, "slot": "pranzo", "title": "TEST_M14_bad", "member_id": "user_notexists_xxx"}
        r = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json=payload, timeout=15)
        # Spec: 400 'membro non valido'
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        assert "membro" in r.text.lower() or "non valido" in r.text.lower()

    def test_create_meal_null_member_id_shared(self, chef_session):
        tok = chef_session["session_token"]
        today = date.today().isoformat()
        payload = {"date": today, "slot": "cena", "title": "TEST_M14_shared", "member_id": None}
        r = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json().get("member_id") in (None, "")
        requests.delete(f"{BASE_URL}/api/meals/{r.json()['id']}", headers=_hdr(tok), timeout=15)

    def test_patch_meal_set_own_member_id(self, chef_session):
        tok = chef_session["session_token"]
        uid = chef_session["user"]["user_id"]
        today = date.today().isoformat()
        r = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json={"date": today, "slot": "colazione", "title": "TEST_M14_patch"}, timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]
        p = requests.patch(f"{BASE_URL}/api/meals/{mid}", headers=_hdr(tok), json={"member_id": uid}, timeout=15)
        assert p.status_code == 200, p.text
        assert p.json()["member_id"] == uid
        requests.delete(f"{BASE_URL}/api/meals/{mid}", headers=_hdr(tok), timeout=15)

    def test_two_meals_same_slot_coexist(self, chef_session, household):
        tok = chef_session["session_token"]
        uid = chef_session["user"]["user_id"]
        d = (date.today() + timedelta(days=5)).isoformat()
        r1 = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json={"date": d, "slot": "cena", "title": "TEST_M14_shared_dup", "member_id": None}, timeout=15)
        r2 = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok), json={"date": d, "slot": "cena", "title": "TEST_M14_personal_dup", "member_id": uid}, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        # GET meals in range
        g = requests.get(f"{BASE_URL}/api/meals?start={d}&end={d}", headers=_hdr(tok), timeout=15)
        assert g.status_code == 200
        items = g.json().get("items") or g.json()
        titles = [i.get("title") for i in items]
        assert "TEST_M14_shared_dup" in titles and "TEST_M14_personal_dup" in titles, f"got {titles}"
        # cleanup
        for x in (r1.json()["id"], r2.json()["id"]):
            requests.delete(f"{BASE_URL}/api/meals/{x}", headers=_hdr(tok), timeout=15)


# =====================================================================
# 3) HOUSEHOLD flow with diet field
# =====================================================================
class TestHouseholdDiet:
    def test_household_created_and_nonna_joined(self, household):
        h = household
        assert h["household"] is not None
        ids = [m["user_id"] for m in h["members"]]
        assert len(h["members"]) >= 2, f"expected >=2 members, got: {ids}"

    def test_members_include_diet_field(self, household):
        for m in household["members"]:
            assert "diet" in m, f"member {m.get('email')} missing 'diet' key"

    def test_chef_can_post_meal_with_nonna_id(self, chef_session, nonna_session, household):
        tok = chef_session["session_token"]
        nonna_id = nonna_session["user"]["user_id"]
        d = (date.today() + timedelta(days=6)).isoformat()
        r = requests.post(f"{BASE_URL}/api/meals", headers=_hdr(tok),
                          json={"date": d, "slot": "pranzo", "title": "TEST_M14_for_nonna", "member_id": nonna_id}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["member_id"] == nonna_id
        requests.delete(f"{BASE_URL}/api/meals/{r.json()['id']}", headers=_hdr(tok), timeout=15)


# =====================================================================
# 4) AI expiring-recipe (LLM ~15s)
# =====================================================================
class TestExpiringRecipe:
    @pytest.fixture(scope="class")
    def fresh_user(self):
        email = f"test_iter14_{uuid.uuid4().hex[:8]}@cucinasmart.dev"
        d = _login_or_signup(email, "TestPass123!", "TEST Iter14 Fresh")
        return d

    def test_expiring_no_items_returns_400(self, fresh_user):
        tok = fresh_user["session_token"]
        r = requests.post(f"{BASE_URL}/api/ai/expiring-recipe", headers=_hdr(tok), json={}, timeout=60)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_expiring_with_item_returns_recipe(self, chef_session):
        tok = chef_session["session_token"]
        # Add a pantry item expiring in 2 days
        exp_date = (date.today() + timedelta(days=2)).isoformat()
        item = {"name": "TEST_M14_Zucchine", "qty": 3, "unit": "pz", "category": "verdura", "expires_at": exp_date}
        rp = requests.post(f"{BASE_URL}/api/pantry", headers=_hdr(tok), json=item, timeout=15)
        assert rp.status_code == 200, rp.text
        pid = rp.json()["id"]
        try:
            r = requests.post(f"{BASE_URL}/api/ai/expiring-recipe", headers=_hdr(tok), json={}, timeout=60)
            assert r.status_code == 200, f"{r.status_code}: {r.text}"
            body = r.json()
            assert "recipe" in body and body["recipe"].get("title"), "missing recipe.title"
            assert body["recipe"].get("ingredients"), "empty ingredients"
            tags = [t.lower() for t in (body["recipe"].get("tags") or [])]
            assert any("anti-spreco" in t for t in tags), f"tags missing anti-spreco: {tags}"
            assert isinstance(body.get("used"), list), "missing 'used' list"
        finally:
            requests.delete(f"{BASE_URL}/api/pantry/{pid}", headers=_hdr(tok), timeout=15)


# =====================================================================
# 5) AI recipe with member_id
# =====================================================================
class TestAIRecipeMemberId:
    def test_recipe_with_member(self, chef_session, nonna_session, household):
        tok = chef_session["session_token"]
        nonna_id = nonna_session["user"]["user_id"]
        r = requests.post(f"{BASE_URL}/api/ai/recipe", headers=_hdr(tok),
                          json={"query": "cena leggera", "member_id": nonna_id}, timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        rec = r.json().get("recipe") or r.json()
        assert (rec.get("title") or "").strip(), f"no title: {r.json()}"


# =====================================================================
# 6) AI weekly-plan with member_plans (LLM slow ~40-60s)
# =====================================================================
class TestWeeklyPlanMembers:
    def test_weekly_plan_and_save(self, chef_session, nonna_session, household):
        ct = chef_session["session_token"]
        nt = nonna_session["session_token"]
        nonna_id = nonna_session["user"]["user_id"]
        # 1. Set nonna diet
        rn = requests.patch(f"{BASE_URL}/api/auth/profile", headers=_hdr(nt), json={"diet": "Vegana"}, timeout=15)
        assert rn.status_code == 200
        try:
            # 2. Generate
            t0 = time.time()
            r = requests.post(f"{BASE_URL}/api/ai/weekly-plan", headers=_hdr(ct), json={}, timeout=180)
            print(f"weekly-plan took {time.time()-t0:.1f}s")
            assert r.status_code == 200, f"{r.status_code}: {r.text}"
            data = r.json()
            assert len(data.get("days") or []) == 7, f"expected 7 days got {len(data.get('days') or [])}"
            mps = data.get("member_plans") or []
            assert len(mps) >= 1, f"member_plans empty: {data}"
            # find nonna plan
            nonna_plan = next((mp for mp in mps if mp.get("member_id") == nonna_id), None)
            assert nonna_plan is not None, f"no member plan for nonna: {[mp.get('member_id') for mp in mps]}"
            assert nonna_plan.get("name") and nonna_plan.get("diet")
            assert isinstance(nonna_plan.get("days"), list)

            # 3. Save (replace=True)
            body = {"days": data["days"], "member_plans": [{"member_id": nonna_id, "days": nonna_plan.get("days") or []}], "replace": True}
            rs = requests.post(f"{BASE_URL}/api/ai/weekly-plan/save", headers=_hdr(ct), json=body, timeout=60)
            assert rs.status_code == 200, rs.text
            saved = rs.json()
            assert saved.get("meals_created", 0) > 0, f"no meals saved: {saved}"
            start_d, end_d = saved.get("start_date"), saved.get("end_date")

            # 4. GET meals in range: shared (member_id null) + nonna's
            g = requests.get(f"{BASE_URL}/api/meals?start={start_d}&end={end_d}", headers=_hdr(ct), timeout=30)
            assert g.status_code == 200
            items = g.json().get("items") or g.json()
            shared = [m for m in items if not m.get("member_id")]
            personal = [m for m in items if m.get("member_id") == nonna_id]
            assert shared, "no shared meals stored"
            assert personal, "no meals stored for nonna"
        finally:
            # clear diet
            requests.patch(f"{BASE_URL}/api/auth/profile", headers=_hdr(nt), json={"diet": ""}, timeout=15)
