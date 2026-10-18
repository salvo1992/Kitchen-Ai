"""Iteration 16 backend tests for shop/coach/courses RBAC and isolation."""

import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from passlib.hash import bcrypt
from pymongo import MongoClient


BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL not set")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    raise RuntimeError("MONGO_URL / DB_NAME not set")

ADMIN_EMAIL = "thevikingoftheweb@gmail.com"
CHEF_EMAIL = "chef@cucina.ai"
CHEF_PASSWORD = "CucinaSmart2026"
NONNA_EMAIL = "nonna@cucina.ai"
NONNA_PASSWORD = "CucinaSmart2026"


def _signin(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/signin", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"signin failed for {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def fx_db():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def fx_tokens(fx_db):
    """Create isolated fixture users/sessions; never touch chef/nonna roles."""
    tag = f"it16_{uuid.uuid4().hex[:8]}"
    creator_uid = f"user_{tag}_creator"
    student_uid = f"user_{tag}_student"
    admin_uid = f"user_{tag}_admin"
    now = datetime.now(timezone.utc)

    creator_email = f"{tag}.creator@cucinasmart.dev"
    student_email = f"{tag}.student@cucinasmart.dev"

    # Isolated fixture users
    fx_db.users.insert_many([
        {
            "user_id": creator_uid,
            "email": creator_email,
            "name": "TEST Creator",
            "password_hash": bcrypt.hash("CreatorPass123!"),
            "created_at": now,
        },
        {
            "user_id": student_uid,
            "email": student_email,
            "name": "TEST Student",
            "password_hash": bcrypt.hash("StudentPass123!"),
            "created_at": now,
        },
        {
            "user_id": admin_uid,
            "email": ADMIN_EMAIL,
            "name": "TEST Admin Session",
            "created_at": now,
        },
    ])

    # Approved creator app fixture
    fx_db.creator_applications.insert_one(
        {
            "_id": creator_uid,
            "user_id": creator_uid,
            "name": "TEST Creator",
            "email": creator_email,
            "bio": "TEST creator bio with enough length for approvals and moderation coverage.",
            "status": "approved",
            "created_at": now.isoformat(),
            "reviewed_at": now.isoformat(),
        }
    )

    # Sessions: creator/student standard, admin google-verified session, plus admin password-like session
    creator_token = f"tok_{tag}_creator"
    student_token = f"tok_{tag}_student"
    admin_verified_token = f"tok_{tag}_admin_verified"
    admin_password_token = f"tok_{tag}_admin_password"

    fx_db.user_sessions.insert_many([
        {
            "session_token": creator_token,
            "user_id": creator_uid,
            "identity_verified": False,
            "verified_email": None,
            "created_at": now,
            "expires_at": now + timedelta(days=5),
        },
        {
            "session_token": student_token,
            "user_id": student_uid,
            "identity_verified": False,
            "verified_email": None,
            "created_at": now,
            "expires_at": now + timedelta(days=5),
        },
        {
            "session_token": admin_verified_token,
            "user_id": admin_uid,
            "identity_verified": True,
            "verified_email": ADMIN_EMAIL,
            "created_at": now,
            "expires_at": now + timedelta(days=5),
        },
        {
            "session_token": admin_password_token,
            "user_id": admin_uid,
            "identity_verified": False,
            "verified_email": None,
            "created_at": now,
            "expires_at": now + timedelta(days=5),
        },
    ])

    # Earnings fixtures for payout tests
    earning_ok = f"earning_{tag}_ok"
    earning_zero = f"earning_{tag}_zero"
    earning_unverified = f"earning_{tag}_unverified"
    fx_db.course_earnings.insert_many([
        {
            "id": earning_ok,
            "creator_id": creator_uid,
            "course_title": "TEST Corso Fixture",
            "net_receipt_cents": 1000,
            "creator_cents": 900,
            "app_cents": 100,
            "currency": "EUR",
            "status": "earned",
            "verified": True,
        },
        {
            "id": earning_zero,
            "creator_id": creator_uid,
            "course_title": "TEST Corso Zero",
            "net_receipt_cents": 0,
            "creator_cents": 0,
            "app_cents": 0,
            "currency": "EUR",
            "status": "earned",
            "verified": True,
        },
        {
            "id": earning_unverified,
            "creator_id": creator_uid,
            "course_title": "TEST Corso Unverified",
            "net_receipt_cents": 1500,
            "creator_cents": 1350,
            "app_cents": 150,
            "currency": "EUR",
            "status": "earned",
            "verified": False,
        },
    ])

    yield {
        "creator": {"uid": creator_uid, "token": creator_token, "email": creator_email},
        "student": {"uid": student_uid, "token": student_token, "email": student_email},
        "admin": {
            "uid": admin_uid,
            "verified_token": admin_verified_token,
            "password_token": admin_password_token,
        },
        "earning_ok": earning_ok,
        "earning_zero": earning_zero,
        "earning_unverified": earning_unverified,
        "tag": tag,
    }

    # Cleanup fixture data
    fx_db.course_earnings.delete_many({"id": {"$regex": f"^earning_{tag}_"}})
    fx_db.courses.delete_many({"id": {"$regex": "^course_"}, "creator_id": {"$in": [creator_uid]}})
    fx_db.course_progress.delete_many({"user_id": {"$in": [creator_uid, student_uid]}})
    fx_db.creator_applications.delete_many({"_id": {"$in": [creator_uid]}})
    fx_db.coach_messages.delete_many({"user_id": {"$in": [creator_uid, student_uid]}})
    fx_db.user_sessions.delete_many({"session_token": {"$regex": f"^tok_{tag}_"}})
    fx_db.users.delete_many({"user_id": {"$in": [creator_uid, student_uid, admin_uid]}})


def _auth(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- shop access and role guards ---
def test_shop_access_unauth_401():
    r = requests.get(f"{BASE_URL}/api/shop/access", timeout=15)
    assert r.status_code == 401


def test_shop_access_chef_not_admin_or_creator():
    tok = _signin(CHEF_EMAIL, CHEF_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/shop/access", headers=_auth(tok), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["is_admin"] is False
    assert data["is_creator"] is False


def test_admin_requires_verified_google_session(fx_tokens):
    r = requests.get(
        f"{BASE_URL}/api/admin/shop",
        headers=_auth(fx_tokens["admin"]["password_token"]),
        timeout=15,
    )
    assert r.status_code == 403


# --- creator application idempotency and minimum length ---
def test_creator_application_min_20_rejected(fx_tokens):
    r = requests.post(
        f"{BASE_URL}/api/creator/application",
        json={"bio": "troppo corto"},
        headers=_auth(fx_tokens["student"]["token"]),
        timeout=15,
    )
    assert r.status_code == 422


def test_creator_application_idempotent_insert(fx_tokens):
    bio1 = "TEST candidatura lunga almeno venti caratteri per idempotenza uno"
    bio2 = "TEST candidatura lunga almeno venti caratteri per idempotenza due"
    h = _auth(fx_tokens["student"]["token"])
    r1 = requests.post(f"{BASE_URL}/api/creator/application", json={"bio": bio1}, headers=h, timeout=15)
    r2 = requests.post(f"{BASE_URL}/api/creator/application", json={"bio": bio2}, headers=h, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["bio"] == r2.json()["bio"]


# --- courses lifecycle + redaction + isolation ---
def test_student_cannot_create_course_without_approval(fx_tokens):
    payload = {
        "title": "TEST Corso Negato",
        "description": "Descrizione sufficientemente lunga per il controllo minimo richiesto.",
        "category": "Basi di cucina",
        "price_cents": 499,
        "lessons": [{"id": "l1", "title": "Lezione", "content": "Contenuto lungo almeno dieci.", "preview": True}],
    }
    r = requests.post(f"{BASE_URL}/api/creator/courses", json=payload, headers=_auth(fx_tokens["student"]["token"]), timeout=15)
    assert r.status_code == 403


def test_creator_course_create_update_submit_publish_and_student_visibility(fx_tokens):
    creator_h = _auth(fx_tokens["creator"]["token"])
    admin_h = _auth(fx_tokens["admin"]["verified_token"])
    student_h = _auth(fx_tokens["student"]["token"])

    # create with unique lessons and valid integer cents/category
    create_payload = {
        "title": "TEST Corso Pasta Fresca",
        "description": "Corso test con anteprima e lezione riservata per validare redazione contenuti.",
        "category": "Cucina italiana",
        "price_cents": 1299,
        "lessons": [
            {"id": "lsn_preview", "title": "Impasto base", "content": "Passaggi lunghi abbastanza per preview.", "preview": True},
            {"id": "lsn_locked", "title": "Ripieni", "content": "Contenuto completo che non deve uscire al pubblico.", "preview": False},
        ],
    }
    rc = requests.post(f"{BASE_URL}/api/creator/courses", json=create_payload, headers=creator_h, timeout=15)
    assert rc.status_code == 200, rc.text
    cid = rc.json()["id"]

    # invalid duplicate lesson IDs rejected
    dup_payload = dict(create_payload)
    dup_payload["title"] = "TEST Corso DUP"
    dup_payload["lessons"] = [
        {"id": "same", "title": "A", "content": "Contenuto A molto lungo.", "preview": True},
        {"id": "same", "title": "B", "content": "Contenuto B molto lungo.", "preview": False},
    ]
    rdup = requests.post(f"{BASE_URL}/api/creator/courses", json=dup_payload, headers=creator_h, timeout=15)
    assert rdup.status_code == 422

    # submit pending
    rs = requests.post(f"{BASE_URL}/api/creator/courses/{cid}/submit", headers=creator_h, timeout=15)
    assert rs.status_code == 200

    # admin approve => published
    ra = requests.post(
        f"{BASE_URL}/api/admin/courses/{cid}/review",
        json={"decision": "approved", "note": "TEST ok"},
        headers=admin_h,
        timeout=15,
    )
    assert ra.status_code == 200, ra.text

    # student catalogue includes published only
    rcat = requests.get(f"{BASE_URL}/api/courses", headers=student_h, timeout=15)
    assert rcat.status_code == 200
    ids = [x["id"] for x in rcat.json()["items"]]
    assert cid in ids

    # detail redacts paid lesson content; preview readable
    rd = requests.get(f"{BASE_URL}/api/courses/{cid}", headers=student_h, timeout=15)
    assert rd.status_code == 200
    lessons = {l["id"]: l for l in rd.json()["lessons"]}
    assert lessons["lsn_preview"]["locked"] is False
    assert lessons["lsn_preview"]["content"]
    assert lessons["lsn_locked"]["locked"] is True
    assert lessons["lsn_locked"]["content"] is None

    # follow idempotent + progress only preview
    rf1 = requests.post(f"{BASE_URL}/api/courses/{cid}/follow", headers=student_h, timeout=15)
    rf2 = requests.post(f"{BASE_URL}/api/courses/{cid}/follow", headers=student_h, timeout=15)
    assert rf1.status_code == 200 and rf2.status_code == 200

    rp_bad = requests.post(
        f"{BASE_URL}/api/courses/{cid}/progress",
        json={"lesson_id": "lsn_locked", "complete": True},
        headers=student_h,
        timeout=15,
    )
    assert rp_bad.status_code == 403

    rp_ok = requests.post(
        f"{BASE_URL}/api/courses/{cid}/progress",
        json={"lesson_id": "lsn_preview", "complete": True},
        headers=student_h,
        timeout=15,
    )
    assert rp_ok.status_code == 200

    # progress isolated from creator account
    rd_creator = requests.get(f"{BASE_URL}/api/courses/{cid}", headers=creator_h, timeout=15)
    rd_student = requests.get(f"{BASE_URL}/api/courses/{cid}", headers=student_h, timeout=15)
    assert "lsn_preview" not in (rd_creator.json().get("completed") or [])
    assert "lsn_preview" in (rd_student.json().get("completed") or [])

    # creator cannot edit published course
    upd = requests.put(f"{BASE_URL}/api/creator/courses/{cid}", json=create_payload, headers=creator_h, timeout=15)
    assert upd.status_code == 409

    # suspend creator => published courses withdrawn
    rr = requests.post(
        f"{BASE_URL}/api/admin/creators/{fx_tokens['creator']['uid']}/review",
        json={"decision": "rejected", "note": "TEST sospensione"},
        headers=admin_h,
        timeout=15,
    )
    assert rr.status_code == 200

    rcat2 = requests.get(f"{BASE_URL}/api/courses", headers=student_h, timeout=15)
    assert cid not in [x["id"] for x in rcat2.json()["items"]]


# --- admin payouts and creator dashboard ---
def test_creator_dashboard_balances_and_followers(fx_tokens, fx_db):
    # Re-approve fixture creator in case a previous moderation test suspended it.
    fx_db.creator_applications.update_one(
        {"_id": fx_tokens["creator"]["uid"]},
        {"$set": {"status": "approved", "review_note": "TEST re-approved for dashboard"}},
    )
    r = requests.get(f"{BASE_URL}/api/creator/dashboard", headers=_auth(fx_tokens["creator"]["token"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["followers"], int)
    assert data["balance_cents"] >= 0


def test_admin_payout_atomic_idempotent_and_guards(fx_tokens):
    admin_h = _auth(fx_tokens["admin"]["verified_token"])

    # First payment succeeds
    r1 = requests.post(
        f"{BASE_URL}/api/admin/earnings/{fx_tokens['earning_ok']}/paid",
        json={"reference": "TEST-BONIFICO-001"},
        headers=admin_h,
        timeout=15,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "paid"

    # Second payment on same record rejected (atomic idempotent transition)
    r2 = requests.post(
        f"{BASE_URL}/api/admin/earnings/{fx_tokens['earning_ok']}/paid",
        json={"reference": "TEST-BONIFICO-002"},
        headers=admin_h,
        timeout=15,
    )
    assert r2.status_code == 409

    # zero / unverified / nonexistent rejected
    rz = requests.post(
        f"{BASE_URL}/api/admin/earnings/{fx_tokens['earning_zero']}/paid",
        json={"reference": "TEST-ZERO"},
        headers=admin_h,
        timeout=15,
    )
    assert rz.status_code == 409

    ru = requests.post(
        f"{BASE_URL}/api/admin/earnings/{fx_tokens['earning_unverified']}/paid",
        json={"reference": "TEST-UNVERIFIED"},
        headers=admin_h,
        timeout=15,
    )
    assert ru.status_code == 409

    rn = requests.post(
        f"{BASE_URL}/api/admin/earnings/earning_does_not_exist/paid",
        json={"reference": "TEST-NONE"},
        headers=admin_h,
        timeout=15,
    )
    assert rn.status_code == 409


# --- coach backend auth-only behavior and isolation between chef/nonna ---
def test_coach_message_and_private_history_isolation():
    chef_tok = _signin(CHEF_EMAIL, CHEF_PASSWORD)
    nonna_tok = _signin(NONNA_EMAIL, NONNA_PASSWORD)

    unique = f"TEST_COACH_{uuid.uuid4().hex[:8]}"
    r_send = requests.post(
        f"{BASE_URL}/api/coach/message",
        json={"message": f"{unique} aiutami con colazione leggera"},
        headers=_auth(chef_tok),
        timeout=80,
    )
    assert r_send.status_code == 200, r_send.text
    items = r_send.json()["items"]
    assert len(items) == 2
    assert items[0]["role"] == "user"
    assert items[1]["role"] == "assistant"
    assert len((items[1].get("content") or "").strip()) > 0

    # Chef sees message in history
    r_hist_chef = requests.get(f"{BASE_URL}/api/coach/history", headers=_auth(chef_tok), timeout=20)
    assert r_hist_chef.status_code == 200
    joined_chef = "\n".join([m.get("content", "") for m in r_hist_chef.json().get("items", [])])
    assert unique in joined_chef

    # Nonna must not see chef private history
    r_hist_nonna = requests.get(f"{BASE_URL}/api/coach/history", headers=_auth(nonna_tok), timeout=20)
    assert r_hist_nonna.status_code == 200
    joined_nonna = "\n".join([m.get("content", "") for m in r_hist_nonna.json().get("items", [])])
    assert unique not in joined_nonna
