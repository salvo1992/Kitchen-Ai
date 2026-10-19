"""Iteration 20: Delivery Chef backend integration tests (authz, booking, city/radius, payments gating)."""

import base64
import os
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient


BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL not set")


# Auth + delivery fixture management helpers
def _signup(email: str, password: str, name: str):
    r = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": email, "password": password, "name": name},
        timeout=25,
    )
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"]["user_id"]


def _headers(token: str, idem_key: str | None = None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if idem_key:
        h["Idempotency-Key"] = idem_key
    return h


def _future_date_time(days=7):
    now = datetime.now(ZoneInfo("Europe/Rome")) + timedelta(days=days, hours=3)
    minute = 0 if now.minute < 30 else 30
    when = now.replace(minute=minute, second=0, microsecond=0)
    return when.date().isoformat(), when.strftime("%H:%M")


def _city_search(token: str, query: str):
    r = requests.post(
        f"{BASE_URL}/api/delivery/cities",
        json={"query": query},
        headers=_headers(token),
        timeout=25,
    )
    assert r.status_code == 200, f"city search failed ({query}): {r.status_code} {r.text}"
    items = r.json().get("items", [])
    assert items, f"city search empty for query={query}"
    return items


@pytest.fixture(scope="module")
def mongo_db():
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ["MONGO_URL"].strip().strip('"')
    db_name = os.environ["DB_NAME"].strip().strip('"')
    client = MongoClient(mongo_url)
    db = client[db_name]
    try:
        yield db
    finally:
        client.close()


@pytest.fixture(scope="module")
def ctx(mongo_db):
    suffix = uuid.uuid4().hex[:8]
    pw = "TestPass123!"

    customer_email = f"test_iter20_customer_{suffix}@cucinasmart.dev"
    p1_email = f"test_iter20_provider1_{suffix}@cucinasmart.dev"
    p2_email = f"test_iter20_provider2_{suffix}@cucinasmart.dev"

    customer_token, customer_id = _signup(customer_email, pw, f"TEST Customer {suffix}")
    p1_token, p1_uid = _signup(p1_email, pw, f"TEST Provider One {suffix}")
    p2_token, p2_uid = _signup(p2_email, pw, f"TEST Provider Two {suffix}")
    credentials_path = '/app/memory/test_credentials.md'
    credential_marker = f'## Delivery test fixture {suffix}'
    with open(credentials_path, 'a') as credentials:
        credentials.write(f'\n{credential_marker}\n')
        for email in [customer_email, p1_email, p2_email]:
            credentials.write(f'- Email: `{email}` / Password: `{pw}` (temporary fixture)\n')

    roma = _city_search(customer_token, "Roma")
    milano = _city_search(customer_token, "Milano")

    state = {
        "suffix": suffix,
        "customer_token": customer_token,
        "customer_id": customer_id,
        "p1_token": p1_token,
        "p1_uid": p1_uid,
        "p2_token": p2_token,
        "p2_uid": p2_uid,
        "roma": roma[0],
        "milano": milano[0],
        "service_quote_id": None,
        "service_instant_id": None,
        "service_other_id": None,
        "booking_quote_id": None,
        "slot_quote_id": None,
        "slot_overlap_date": None,
        "slot_overlap_time": None,
    }

    try:
        yield state
    finally:
        # Cleanup all fixture users and delivery docs.
        uids = [state["customer_id"], state["p1_uid"], state["p2_uid"]]
        pids = [f"dc_{state['p1_uid']}", f"dc_{state['p2_uid']}"]
        mongo_db.delivery_bookings.delete_many({"$or": [{"customer_id": {"$in": uids}}, {"provider_user_id": {"$in": uids}}]})
        mongo_db.delivery_reviews.delete_many({"$or": [{"customer_id": {"$in": uids}}, {"provider_id": {"$in": pids}}]})
        mongo_db.delivery_slots.delete_many({"provider_id": {"$in": pids}})
        mongo_db.delivery_slot_locks.delete_many({"_id": {"$regex": f"^({'|'.join([pid for pid in pids])}):"}})
        mongo_db.delivery_services.delete_many({"provider_id": {"$in": pids}})
        mongo_db.delivery_providers.delete_many({"user_id": {"$in": uids}})
        mongo_db.user_sessions.delete_many({"user_id": {"$in": uids}})
        mongo_db.uploads.delete_many({"user_id": {"$in": uids}})
        mongo_db.file_tokens.delete_many({"user_id": {"$in": uids}})
        mongo_db.users.delete_many({"user_id": {"$in": uids}})
        from pathlib import Path
        credentials = Path(credentials_path)
        content = credentials.read_text()
        block_start = content.find(credential_marker)
        if block_start >= 0:
            block_end = content.find('\n## ', block_start + len(credential_marker))
            content = content[:block_start] + (content[block_end:] if block_end >= 0 else '')
            credentials.write_text(content)


class TestIter20DeliveryCore:
    """Core delivery marketplace integration coverage for iteration 20."""

    def test_01_delivery_config_requires_auth_and_commission_10(self, ctx):
        anon = requests.get(f"{BASE_URL}/api/delivery/config", timeout=20)
        assert anon.status_code == 401

        authed = requests.get(
            f"{BASE_URL}/api/delivery/config",
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert authed.status_code == 200
        body = authed.json()
        assert body["commission_percent"] == 10
        assert body["payments"]["configured"] is False

    def test_02_city_search_cache_path_and_real_city_rows(self, ctx):
        first = _city_search(ctx["customer_token"], "Roma")
        second = _city_search(ctx["customer_token"], "Roma")
        assert first[0]["id"] == second[0]["id"]
        labels = [x.get("label", "").lower() for x in first]
        assert any("roma" in x for x in labels)

    def test_03_admin_dashboard_forbidden_for_non_verified_non_admin(self, ctx):
        r = requests.get(
            f"{BASE_URL}/api/delivery/admin",
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert r.status_code == 403

    def test_04_provider_profile_rejects_city_id_forgery(self, ctx):
        payload = {
            "display_name": f"TEST Chef {ctx['suffix']}",
            "kind": "chef",
            "bio": "Chef professionista specializzato in cene private e catering su misura per eventi romantici.",
            "city_id": "fake_city_id_not_from_search",
            "radius_km": 20,
            "specialties": ["Risotti gourmet", "Menu pesce"],
            "photo_url": None,
            "accepts_terms": True,
        }
        r = requests.put(
            f"{BASE_URL}/api/delivery/provider",
            json=payload,
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert r.status_code == 422

    def test_05_provider_photo_upload_must_match_owner(self, ctx):
        # Create upload under customer, then try reusing it as provider photo.
        img_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAIAAACQKrqGAAAALUlEQVR4nGNkYGBg+M+ABYwMjIyM/4fR0dEJQ4YMYWBgYIDlQ4YMFQ0A5d8E6Q8M8Q4AAAAASUVORK5CYII="
        )
        upload = requests.post(
            f"{BASE_URL}/api/upload-base64",
            json={"image_base64": base64.b64encode(img_bytes).decode(), "ext": "png"},
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert upload.status_code == 200, upload.text
        photo_url = upload.json()["url"]

        payload = {
            "display_name": f"TEST Chef {ctx['suffix']}",
            "kind": "chef",
            "bio": "Chef professionista specializzato in cene private e catering su misura per eventi romantici.",
            "city_id": ctx["roma"]["id"],
            "radius_km": 20,
            "specialties": ["Risotti gourmet", "Menu pesce"],
            "photo_url": photo_url,
            "accepts_terms": True,
        }
        r = requests.put(
            f"{BASE_URL}/api/delivery/provider",
            json=payload,
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert r.status_code == 403

    def test_06_create_provider_profiles_and_services_with_owner_isolation(self, ctx):
        p1_profile = {
            "display_name": f"TEST Chef One {ctx['suffix']}",
            "kind": "chef",
            "bio": "Chef con esperienza in eventi privati, cene romantiche e menu su misura per ricorrenze.",
            "city_id": ctx["roma"]["id"],
            "radius_km": 15,
            "specialties": ["Cena romantica", "Anniversari"],
            "photo_url": None,
            "accepts_terms": True,
        }
        p2_profile = {
            "display_name": f"TEST Catering Two {ctx['suffix']}",
            "kind": "company",
            "bio": "Azienda catering per eventi e feste con brigata completa e servizi professionali in tutta la zona.",
            "city_id": ctx["milano"]["id"],
            "radius_km": 30,
            "specialties": ["Catering eventi", "Showcooking"],
            "photo_url": None,
            "accepts_terms": True,
        }
        r1 = requests.put(f"{BASE_URL}/api/delivery/provider", json=p1_profile, headers=_headers(ctx["p1_token"]), timeout=20)
        r2 = requests.put(f"{BASE_URL}/api/delivery/provider", json=p2_profile, headers=_headers(ctx["p2_token"]), timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200

        quote_service = {
            "title": "TEST Cena romantica completa",
            "description": "Cena completa a domicilio con menu personalizzato e servizio professionale per la coppia.",
            "category": "romantic",
            "price_cents": 9500,
            "pricing": "person",
            "booking_mode": "both",
            "min_guests": 2,
            "max_guests": 6,
            "duration_hours": 3,
            "included": "Menu completo, mise en place e pulizia finale.",
            "enabled": True,
        }
        instant_service = {
            **quote_service,
            "title": "TEST Instant Catering",
            "booking_mode": "instant",
            "pricing": "fixed",
            "price_cents": 40000,
            "min_guests": 4,
            "max_guests": 20,
        }
        other_service = {
            **quote_service,
            "title": "TEST Other Provider Service",
            "booking_mode": "quote",
        }
        s1 = requests.post(f"{BASE_URL}/api/delivery/provider/services", json=quote_service, headers=_headers(ctx["p1_token"]), timeout=20)
        s2 = requests.post(f"{BASE_URL}/api/delivery/provider/services", json=instant_service, headers=_headers(ctx["p1_token"]), timeout=20)
        s3 = requests.post(f"{BASE_URL}/api/delivery/provider/services", json=other_service, headers=_headers(ctx["p2_token"]), timeout=20)
        assert s1.status_code == 200 and s2.status_code == 200 and s3.status_code == 200
        ctx["service_quote_id"] = s1.json()["id"]
        ctx["service_instant_id"] = s2.json()["id"]
        ctx["service_other_id"] = s3.json()["id"]

    def test_07_provider_cannot_edit_other_provider_service(self, ctx):
        r = requests.put(
            f"{BASE_URL}/api/delivery/provider/services/{ctx['service_other_id']}",
            json={
                "title": "TEST hijack",
                "description": "Tentativo non autorizzato di modifica servizio altrui con dettagli estesi.",
                "category": "party",
                "price_cents": 10000,
                "pricing": "fixed",
                "booking_mode": "quote",
                "min_guests": 2,
                "max_guests": 8,
                "duration_hours": 2,
                "included": "N/A servizio di test non autorizzato.",
                "enabled": True,
            },
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert r.status_code == 404

    def test_08_only_approved_profiles_in_public_catalogue_and_private_fields_hidden(self, ctx, mongo_db):
        # Approve provider1 only using isolated DB fixture mutation (admin Google cannot be automated here).
        mongo_db.delivery_providers.update_one({"user_id": ctx["p1_uid"]}, {"$set": {"status": "approved", "connect_ready": False}})

        r = requests.get(
            f"{BASE_URL}/api/delivery/providers",
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        ids = [x["id"] for x in items]
        assert f"dc_{ctx['p1_uid']}" in ids
        assert f"dc_{ctx['p2_uid']}" not in ids

        sample = next(x for x in items if x["id"] == f"dc_{ctx['p1_uid']}")
        for private_key in ["user_id", "email", "phone", "address", "review_note", "verified_email"]:
            assert private_key not in sample

    def test_09_radius_enforced_roma_vs_milano(self, ctx):
        day, hhmm = _future_date_time(days=8)
        payload = {
            "service_id": ctx["service_quote_id"],
            "mode": "quote",
            "city_id": ctx["milano"]["id"],
            "date": day,
            "time": hhmm,
            "slot_id": None,
            "guests": 2,
            "address": "Via Test Milano 10, Milano",
            "phone": "+390201234567",
            "notes": "TEST radius mismatch",
            "accepts_terms": True,
        }
        r = requests.post(
            f"{BASE_URL}/api/delivery/bookings",
            json=payload,
            headers=_headers(ctx["customer_token"], idem_key=f"ITER20RAD{uuid.uuid4().hex[:18]}"),
            timeout=25,
        )
        assert r.status_code == 422

    def test_10_idempotent_booking_same_key_same_payload_and_conflict_on_change(self, ctx):
        day, hhmm = _future_date_time(days=9)
        idem = f"ITER20IDEM{uuid.uuid4().hex[:20]}"
        payload = {
            "service_id": ctx["service_quote_id"],
            "mode": "quote",
            "city_id": ctx["roma"]["id"],
            "date": day,
            "time": hhmm,
            "slot_id": None,
            "guests": 2,
            "address": "Via Test Roma 100, Roma",
            "phone": "+390612345678",
            "notes": "TEST quote request",
            "accepts_terms": True,
        }
        first = requests.post(
            f"{BASE_URL}/api/delivery/bookings",
            json=payload,
            headers=_headers(ctx["customer_token"], idem_key=idem),
            timeout=25,
        )
        assert first.status_code == 200, first.text
        first_doc = first.json()
        ctx["booking_quote_id"] = first_doc["id"]

        second = requests.post(
            f"{BASE_URL}/api/delivery/bookings",
            json=payload,
            headers=_headers(ctx["customer_token"], idem_key=idem),
            timeout=25,
        )
        assert second.status_code == 200
        assert second.json()["id"] == first_doc["id"]

        changed = {**payload, "guests": 3}
        third = requests.post(
            f"{BASE_URL}/api/delivery/bookings",
            json=changed,
            headers=_headers(ctx["customer_token"], idem_key=idem),
            timeout=25,
        )
        assert third.status_code == 409

    def test_11_quote_amount_below_min_rejected(self, ctx):
        day, hhmm = _future_date_time(days=12)
        overlap_a = requests.post(
            f"{BASE_URL}/api/delivery/provider/slots",
            json={"date": day, "time": hhmm, "duration_hours": 3},
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert overlap_a.status_code == 200, overlap_a.text
        ctx["slot_quote_id"] = overlap_a.json()["id"]

        q = requests.post(
            f"{BASE_URL}/api/delivery/bookings/{ctx['booking_quote_id']}/quote",
            json={"amount_cents": 499, "slot_id": ctx["slot_quote_id"], "included": "Menu test completo con servizio professionale"},
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert q.status_code == 422

    def test_12_provider_can_quote_and_customer_sees_offer_then_checkout_blocked_without_connect(self, ctx):
        send = requests.post(
            f"{BASE_URL}/api/delivery/bookings/{ctx['booking_quote_id']}/quote",
            json={
                "amount_cents": 12000,
                "slot_id": ctx["slot_quote_id"],
                "included": "Menu degustazione completo, servizio in sala e sistemazione cucina.",
            },
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        assert send.status_code == 200, send.text

        detail = requests.get(
            f"{BASE_URL}/api/delivery/bookings/{ctx['booking_quote_id']}",
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert detail.status_code == 200
        body = detail.json()
        assert body["status"] == "quoted"
        assert body["amount_cents"] == 12000
        assert body["payments"]["configured"] is False

        checkout = requests.post(
            f"{BASE_URL}/api/delivery/bookings/{ctx['booking_quote_id']}/checkout",
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert checkout.status_code == 503

    def test_13_instant_booking_blocked_when_connect_absent(self, ctx):
        day, hhmm = _future_date_time(days=10)
        payload = {
            "service_id": ctx["service_instant_id"],
            "mode": "instant",
            "city_id": ctx["roma"]["id"],
            "date": day,
            "time": hhmm,
            "slot_id": f"slot_fake_{uuid.uuid4().hex[:8]}",
            "guests": 4,
            "address": "Via Test Roma 101, Roma",
            "phone": "+390698765432",
            "notes": "TEST instant blocked",
            "accepts_terms": True,
        }
        r = requests.post(
            f"{BASE_URL}/api/delivery/bookings",
            json=payload,
            headers=_headers(ctx["customer_token"], idem_key=f"ITER20INS{uuid.uuid4().hex[:20]}"),
            timeout=25,
        )
        assert r.status_code == 409

    def test_14_overlap_slot_concurrency_allows_only_one(self, ctx):
        day, hhmm = _future_date_time(days=15)
        ctx["slot_overlap_date"] = day
        ctx["slot_overlap_time"] = hhmm
        payload = {"date": day, "time": hhmm, "duration_hours": 2}

        one = requests.post(
            f"{BASE_URL}/api/delivery/provider/slots",
            json=payload,
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        two = requests.post(
            f"{BASE_URL}/api/delivery/provider/slots",
            json=payload,
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        statuses = sorted([one.status_code, two.status_code])
        assert statuses == [200, 409], f"expected one success/one overlap conflict, got {statuses}"

    def test_15_provider_list_is_private_and_isolated_by_owner(self, ctx):
        own = requests.get(
            f"{BASE_URL}/api/delivery/bookings?provider=true",
            headers=_headers(ctx["p1_token"]),
            timeout=20,
        )
        other = requests.get(
            f"{BASE_URL}/api/delivery/bookings?provider=true",
            headers=_headers(ctx["p2_token"]),
            timeout=20,
        )
        assert own.status_code == 200 and other.status_code == 200
        own_ids = [x["id"] for x in own.json().get("items", [])]
        other_ids = [x["id"] for x in other.json().get("items", [])]
        assert ctx["booking_quote_id"] in own_ids
        assert ctx["booking_quote_id"] not in other_ids

    def test_16_review_before_completion_forbidden(self, ctx):
        r = requests.post(
            f"{BASE_URL}/api/delivery/bookings/{ctx['booking_quote_id']}/review",
            json={"rating": 5, "text": "Servizio ottimo ma test anticipato."},
            headers=_headers(ctx["customer_token"]),
            timeout=20,
        )
        assert r.status_code == 403

    def test_17_webhook_without_secret_returns_503(self, ctx):
        r = requests.post(
            f"{BASE_URL}/api/delivery/stripe/webhook",
            headers={"Content-Type": "application/json", "stripe-signature": "fake"},
            data='{"id":"evt_test","type":"checkout.session.completed","data":{"object":{}}}',
            timeout=20,
        )
        assert r.status_code == 503
