"""Iteration 6: Week widget (meals range) + cooking history endpoints.

Tests:
- GET /api/stats/history for current month, invalid month, past empty month
- POST /api/recipes/{id}/cooked increments history entries
- GET /api/meals?start=today&end=today+6 covers a multi-day range
"""
import os
import re
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")


@pytest.fixture(scope="module")
def user():
    email = f"test_iter6_{uuid.uuid4().hex[:10]}@cucinasmart.dev"
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": "TestPass123!", "name": "TEST iter6"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["session_token"], "email": email}


@pytest.fixture(scope="module")
def h(user):
    return {"Authorization": f"Bearer {user['token']}", "Content-Type": "application/json"}


def _today():
    return datetime.now(timezone.utc).date()


# --- /api/stats/history ---
class TestHistory:
    def test_bad_month_returns_400(self, h):
        r = requests.get(f"{BASE_URL}/api/stats/history?month=bad", headers=h)
        assert r.status_code == 400

    def test_far_past_month_empty(self, h):
        r = requests.get(f"{BASE_URL}/api/stats/history?month=2020-01", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["month"] == "2020-01"
        assert body["items"] == []

    def test_current_month_default_has_expected_shape(self, h):
        r = requests.get(f"{BASE_URL}/api/stats/history", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert re.match(r"^\d{4}-\d{2}$", body["month"])
        assert isinstance(body["items"], list)

    def test_cooked_entry_appears_in_history(self, h):
        # Seed pantry: Uova near expiry so items_saved > 0
        exp = (_today() + timedelta(days=2)).isoformat()
        p = requests.post(f"{BASE_URL}/api/pantry", headers=h, json={
            "name": "TEST_it6_Uova", "qty": 6, "unit": "pz", "location": "fridge", "expires_at": exp, "price": 3.0,
        })
        assert p.status_code == 200
        # Recipe using Uova
        r = requests.post(f"{BASE_URL}/api/recipes", headers=h, json={
            "title": "TEST_it6 Frittata", "ingredients": [{"name": "TEST_it6_Uova", "qty": 2, "unit": "pz"}],
            "steps": ["Sbatti", "Cuoci"], "servings": 2,
        })
        assert r.status_code == 200
        rid = r.json()["id"]

        # Get baseline history count for current month
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        before = requests.get(f"{BASE_URL}/api/stats/history?month={month}", headers=h).json()["items"]

        # Cook it
        c = requests.post(f"{BASE_URL}/api/recipes/{rid}/cooked", headers=h, json={})
        assert c.status_code == 200

        after = requests.get(f"{BASE_URL}/api/stats/history?month={month}", headers=h).json()["items"]
        assert len(after) == len(before) + 1
        top = after[0]  # newest first
        for k in ["id", "recipe_id", "title", "servings", "cooked_at", "items_used", "items_saved"]:
            assert k in top, f"missing {k}"
        assert top["recipe_id"] == rid
        assert top["title"] == "TEST_it6 Frittata"
        assert top["items_used"] >= 1
        assert top["items_saved"] >= 1  # Uova within 3d
        # cooked_at desc: previous head (if any) should be older
        if len(before) > 0:
            assert top["cooked_at"] > before[0]["cooked_at"] or top["id"] != before[0]["id"]


# --- /api/meals range ---
class TestMealsRange:
    def test_range_query_returns_meals_across_days(self, h):
        t = _today()
        d0, d3, d6 = t.isoformat(), (t + timedelta(days=3)).isoformat(), (t + timedelta(days=6)).isoformat()
        for d, slot, title in [
            (d0, "colazione", "TEST_it6 Yogurt"),
            (d3, "pranzo", "TEST_it6 Pasta"),
            (d6, "cena", "TEST_it6 Zuppa"),
        ]:
            m = requests.post(f"{BASE_URL}/api/meals", headers=h, json={"date": d, "slot": slot, "title": title})
            assert m.status_code == 200
        start = d0
        end = (t + timedelta(days=6)).isoformat()
        r = requests.get(f"{BASE_URL}/api/meals?start={start}&end={end}", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        titles = {i["title"] for i in items}
        assert {"TEST_it6 Yogurt", "TEST_it6 Pasta", "TEST_it6 Zuppa"}.issubset(titles)
        dates_returned = {i["date"] for i in items if i["title"].startswith("TEST_it6")}
        assert d0 in dates_returned and d3 in dates_returned and d6 in dates_returned

    def test_range_excludes_outside_window(self, h):
        t = _today()
        far = (t + timedelta(days=30)).isoformat()
        m = requests.post(f"{BASE_URL}/api/meals", headers=h, json={"date": far, "slot": "pranzo", "title": "TEST_it6 Far"})
        assert m.status_code == 200
        r = requests.get(f"{BASE_URL}/api/meals?start={t.isoformat()}&end={(t + timedelta(days=6)).isoformat()}", headers=h)
        assert r.status_code == 200
        titles = {i["title"] for i in r.json()["items"]}
        assert "TEST_it6 Far" not in titles
