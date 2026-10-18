import json
import os
import uuid
from datetime import datetime, timezone, timedelta

from passlib.hash import bcrypt
from pymongo import MongoClient


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    raise RuntimeError("MONGO_URL and DB_NAME are required")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

tag = f"it18ui_{uuid.uuid4().hex[:8]}"
now = datetime.now(timezone.utc)

creator_uid = f"user_{tag}_creator"
student_uid = f"user_{tag}_student"
admin_uid = f"user_{tag}_admin"

creator_email = f"{tag}.creator@cucinasmart.dev"
student_email = f"{tag}.student@cucinasmart.dev"
creator_password = "CreatorPass123!"
student_password = "StudentPass123!"

admin_verified_token = f"tok_{tag}_admin_verified"

db.users.insert_many([
    {
        "user_id": creator_uid,
        "email": creator_email,
        "name": "TEST Creator UI",
        "password_hash": bcrypt.hash(creator_password),
        "created_at": now,
    },
    {
        "user_id": student_uid,
        "email": student_email,
        "name": "TEST Student UI",
        "password_hash": bcrypt.hash(student_password),
        "created_at": now,
    },
    {
        "user_id": admin_uid,
        "email": "thevikingoftheweb@gmail.com",
        "name": "TEST Admin Fixture",
        "created_at": now,
    },
])

db.creator_applications.insert_one(
    {
        "_id": creator_uid,
        "user_id": creator_uid,
        "name": "TEST Creator UI",
        "email": creator_email,
        "bio": "TEST creator fixture bio for UI E2E approval and publishing flow coverage.",
        "status": "approved",
        "created_at": now.isoformat(),
        "reviewed_at": now.isoformat(),
        "review_note": "fixture pre-approved",
    }
)

db.user_sessions.insert_one(
    {
        "session_token": admin_verified_token,
        "user_id": admin_uid,
        "identity_verified": True,
        "verified_email": "thevikingoftheweb@gmail.com",
        "created_at": now,
        "expires_at": now + timedelta(days=5),
    }
)

earning_id = f"earning_{tag}_earned"
db.course_earnings.insert_one(
    {
        "id": earning_id,
        "creator_id": creator_uid,
        "course_title": "TEST Corso Fixture Payout",
        "net_receipt_cents": 1000,
        "creator_cents": 900,
        "app_cents": 100,
        "currency": "EUR",
        "status": "earned",
        "verified": True,
    }
)

fixture = {
    "tag": tag,
    "creator": {"uid": creator_uid, "email": creator_email, "password": creator_password},
    "student": {"uid": student_uid, "email": student_email, "password": student_password},
    "admin": {"uid": admin_uid, "token": admin_verified_token, "email": "thevikingoftheweb@gmail.com"},
    "earning_id": earning_id,
}

with open("/app/tests/iter18_fixture.json", "w", encoding="utf-8") as f:
    json.dump(fixture, f)

with open("/app/memory/test_credentials.md", "a", encoding="utf-8") as f:
    f.write("\n")
    f.write(f"## ITER18_TEMP_FIXTURE_{tag}\n")
    f.write(f"- Creator email: `{creator_email}` / password: `{creator_password}`\n")
    f.write(f"- Student email: `{student_email}` / password: `{student_password}`\n")
    f.write("- Admin UI fixture: token-only verified session (no password), cleanup required.\n")

print(json.dumps(fixture))
