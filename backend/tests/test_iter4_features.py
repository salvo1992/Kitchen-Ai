"""Backend tests for iteration 4 NEW CucinaSmart AI features:
- Scala Porzioni is client-side only (no backend tests needed)
- Avvisi Scadenze: GET /api/pantry/expiring?days=3
- Foto Ricette: POST /api/upload-base64 + GET /api/files/{path}?token=
- Spesa da Piano: POST /api/meals/to-shopping {start, end}
"""
import os
import re
import uuid
import base64
from datetime import date, datetime, timedelta

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


def _signup(client):
    email = f"TEST_it4_{uuid.uuid4().hex[:8]}@cucinasmart.dev"
    r = client.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email, "password": "TestPass123!", "name": "TEST Iter4",
    })
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return email, tok, {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Pantry Expiring ----------
class TestPantryExpiring:
    def test_expiring_returns_only_within_threshold_sorted(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()

        # items to insert: expired (-2), 0, +2, +3, +10, +30
        offsets = [-2, 0, 2, 3, 10, 30]
        created_names = []
        for off in offsets:
            name = f"TEST_expitem_{off}_{uuid.uuid4().hex[:4]}"
            payload = {
                "name": name, "qty": 1, "unit": "pz", "location": "pantry",
                "expires_at": (today + timedelta(days=off)).isoformat(),
            }
            r = api_client.post(f"{BASE_URL}/api/pantry", json=payload, headers=h)
            assert r.status_code == 200, r.text
            created_names.append((off, name))

        # also an item with no expires_at → must NOT appear
        api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": f"TEST_noexp_{uuid.uuid4().hex[:4]}", "qty": 1, "unit": "pz", "location": "pantry",
        }, headers=h)

        r = api_client.get(f"{BASE_URL}/api/pantry/expiring?days=3", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "count" in data
        items = data["items"]
        # Only offsets <= 3 should be included: -2, 0, 2, 3 → 4 items
        included_offsets = sorted([off for off, _ in created_names if off <= 3])
        returned_offsets = [it["days_left"] for it in items]
        assert returned_offsets == included_offsets, (
            f"Expected sorted asc {included_offsets}, got {returned_offsets}"
        )
        assert data["count"] == len(included_offsets)
        # Ensure +10 and +30 NOT present
        names_out = {it["name"] for it in items}
        for off, name in created_names:
            if off > 3:
                assert name not in names_out, f"item {name} (off={off}) should not appear"
            else:
                assert name in names_out, f"item {name} (off={off}) should appear"
        # Each returned item has days_left key
        for it in items:
            assert isinstance(it["days_left"], int)

    def test_expiring_days_parameter_default_is_3(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        name5 = f"TEST_exp5_{uuid.uuid4().hex[:4]}"
        api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": name5, "qty": 1, "unit": "pz",
            "expires_at": (today + timedelta(days=5)).isoformat(),
        }, headers=h)
        # default days=3 → 5-day item should NOT be present
        r = api_client.get(f"{BASE_URL}/api/pantry/expiring", headers=h)
        assert r.status_code == 200
        assert name5 not in {it["name"] for it in r.json()["items"]}

        # With days=7, it should appear
        r7 = api_client.get(f"{BASE_URL}/api/pantry/expiring?days=7", headers=h)
        assert name5 in {it["name"] for it in r7.json()["items"]}


# ---------- Upload Base64 + Files ----------
# 1x1 transparent PNG
_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=="
)


class TestUploadBase64:
    def test_upload_png_and_fetch_with_token(self, api_client):
        _, _, h = _signup(api_client)
        b64 = base64.b64encode(_TINY_PNG).decode()

        # with data: prefix
        r = api_client.post(f"{BASE_URL}/api/upload-base64", json={
            "image_base64": f"data:image/png;base64,{b64}",
        }, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "path" in j and "url" in j and "token" in j
        assert j["url"].startswith("/api/files/")
        assert f"token={j['token']}" in j["url"]

        # GET the URL (no auth, token in query) → returns image bytes
        full_url = f"{BASE_URL}{j['url']}"
        r2 = requests.get(full_url, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.content == _TINY_PNG, "file bytes must match original"
        # content-type is image/*
        assert r2.headers.get("Content-Type", "").startswith("image/")

    def test_upload_without_data_prefix_defaults_to_jpg(self, api_client):
        _, _, h = _signup(api_client)
        b64 = base64.b64encode(_TINY_PNG).decode()
        r = api_client.post(f"{BASE_URL}/api/upload-base64", json={
            "image_base64": b64, "ext": "png",
        }, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        # still fetchable
        r2 = requests.get(f"{BASE_URL}{j['url']}", timeout=30)
        assert r2.status_code == 200

    def test_upload_invalid_base64_returns_400(self, api_client):
        _, _, h = _signup(api_client)
        r = api_client.post(f"{BASE_URL}/api/upload-base64", json={
            "image_base64": "!!!this is not base64!!!",
        }, headers=h)
        assert r.status_code == 400, r.text

    def test_files_without_token_returns_401(self, api_client):
        _, _, h = _signup(api_client)
        b64 = base64.b64encode(_TINY_PNG).decode()
        r = api_client.post(f"{BASE_URL}/api/upload-base64", json={
            "image_base64": f"data:image/png;base64,{b64}",
        }, headers=h)
        assert r.status_code == 200
        path = r.json()["path"]
        # try without token and without bearer
        r2 = requests.get(f"{BASE_URL}/api/files/{path}", timeout=30)
        assert r2.status_code == 401


# ---------- Meals to Shopping (Spesa da Piano) ----------
class TestMealsToShopping:
    def test_merges_recipe_ingredients_across_meals_in_range(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        tomorrow = (today + timedelta(days=1)).isoformat()
        day_after = (today + timedelta(days=2)).isoformat()

        # Create 2 recipes sharing 'Uova' (qty 2 pz and qty 4 pz) plus unique ingredients
        r1 = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Frittata",
            "ingredients": [
                {"name": "Uova", "qty": 2, "unit": "pz"},
                {"name": "Sale", "qty": 1, "unit": "q.b."},
            ],
            "steps": ["sbatti"],
        }, headers=h)
        assert r1.status_code == 200, r1.text
        rid1 = r1.json()["id"]

        r2 = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Torta",
            "ingredients": [
                {"name": "Uova", "qty": 4, "unit": "pz"},
                {"name": "Farina", "qty": 300, "unit": "g"},
            ],
            "steps": ["mescola"],
        }, headers=h)
        assert r2.status_code == 200, r2.text
        rid2 = r2.json()["id"]

        # Create 2 meals for tomorrow and day_after, both linked
        m1 = api_client.post(f"{BASE_URL}/api/meals", json={
            "date": tomorrow, "slot": "pranzo", "title": "TEST Frittata", "recipe_id": rid1,
        }, headers=h)
        assert m1.status_code == 200, m1.text
        m2 = api_client.post(f"{BASE_URL}/api/meals", json={
            "date": day_after, "slot": "cena", "title": "TEST Torta", "recipe_id": rid2,
        }, headers=h)
        assert m2.status_code == 200, m2.text

        # Call to-shopping for the range
        start = today.isoformat()
        end = (today + timedelta(days=7)).isoformat()
        r = api_client.post(f"{BASE_URL}/api/meals/to-shopping", json={
            "start": start, "end": end,
        }, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        # merged: uova qty 6 (2+4 pz), farina 300 g, sale (q.b.)
        assert j["meals"] == 2
        assert j["recipes"] == 2

        added = {it["name"].lower(): it for it in j["added"]}
        assert "uova" in added
        assert float(added["uova"]["qty"]) == 6.0, f"expected 6 pz, got {added['uova']}"
        assert added["uova"]["unit"].lower() == "pz"
        # note & aisle
        assert added["uova"]["note"] == "Piano settimanale"
        assert added["uova"]["aisle"] == "Latticini"  # uova is in Latticini keywords
        assert "farina" in added
        assert added["farina"]["aisle"] == "Pane e cereali"
        # in_pantry / already_listed should be empty
        assert j["in_pantry"] == []
        assert j["already_listed"] == []

        # Second call → all become already_listed, nothing added
        r2call = api_client.post(f"{BASE_URL}/api/meals/to-shopping", json={
            "start": start, "end": end,
        }, headers=h)
        assert r2call.status_code == 200
        j2 = r2call.json()
        assert j2["added"] == []
        assert len(j2["already_listed"]) >= 2  # uova + farina at least

    def test_pantry_items_skipped(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        tomorrow = (today + timedelta(days=1)).isoformat()

        # Add uova to pantry
        api_client.post(f"{BASE_URL}/api/pantry", json={
            "name": "uova", "qty": 6, "unit": "pz", "location": "fridge",
        }, headers=h)

        # Create a recipe with uova + spaghetti
        rp = api_client.post(f"{BASE_URL}/api/recipes", json={
            "title": "TEST Pasta uova",
            "ingredients": [
                {"name": "Uova", "qty": 2, "unit": "pz"},
                {"name": "Spaghetti", "qty": 200, "unit": "g"},
            ],
            "steps": ["cuoci"],
        }, headers=h)
        rid = rp.json()["id"]

        api_client.post(f"{BASE_URL}/api/meals", json={
            "date": tomorrow, "slot": "cena", "title": "TEST Pasta uova", "recipe_id": rid,
        }, headers=h)

        r = api_client.post(f"{BASE_URL}/api/meals/to-shopping", json={
            "start": today.isoformat(), "end": (today + timedelta(days=7)).isoformat(),
        }, headers=h)
        assert r.status_code == 200
        j = r.json()
        # uova should be in_pantry, spaghetti added
        names_added = {it["name"].lower() for it in j["added"]}
        assert "spaghetti" in names_added
        assert "uova" not in names_added
        assert any("uova" in n.lower() for n in j["in_pantry"])

    def test_range_with_no_recipe_meals_returns_empty(self, api_client):
        _, _, h = _signup(api_client)
        # No meals created
        r = api_client.post(f"{BASE_URL}/api/meals/to-shopping", json={
            "start": "2030-01-01", "end": "2030-01-07",
        }, headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j == {"added": [], "in_pantry": [], "already_listed": [], "meals": 0, "recipes": 0}

    def test_meals_without_recipe_id_skipped(self, api_client):
        _, _, h = _signup(api_client)
        today = date.today()
        tomorrow = (today + timedelta(days=1)).isoformat()
        # Meal with no recipe_id
        api_client.post(f"{BASE_URL}/api/meals", json={
            "date": tomorrow, "slot": "pranzo", "title": "TEST Freestyle",
        }, headers=h)
        r = api_client.post(f"{BASE_URL}/api/meals/to-shopping", json={
            "start": today.isoformat(), "end": (today + timedelta(days=7)).isoformat(),
        }, headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["meals"] == 0
        assert j["added"] == []
