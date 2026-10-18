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

OWNER_EMAIL = "thevikingoftheweb@gmail.com"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

tag = f"it19ui_{uuid.uuid4().hex[:8]}"
now = datetime.now(timezone.utc)

creator_uid = f"user_{tag}_creator"
student_uid = f"user_{tag}_student"
admin_uid = f"user_{tag}_admin"
course_id = f"course_{tag}_pending"
earning_id = f"earning_{tag}_earned"

creator_email = f"{tag}.creator@cucinasmart.dev"
student_email = f"{tag}.student@cucinasmart.dev"
admin_email = f"{tag}.admin@cucinasmart.dev"

creator_password = "CreatorPass123!"
student_password = "StudentPass123!"
admin_password = "AdminPass123!"

db.users.insert_many([
    {
        "user_id": creator_uid,
        "email": creator_email,
        "name": "TEST Creator Iter19",
        "password_hash": bcrypt.hash(creator_password),
        "created_at": now,
    },
    {
        "user_id": student_uid,
        "email": student_email,
        "name": "TEST Student Iter19",
        "password_hash": bcrypt.hash(student_password),
        "created_at": now,
    },
    {
        "user_id": admin_uid,
        "email": admin_email,
        "name": "TEST Admin Candidate Iter19",
        "password_hash": bcrypt.hash(admin_password),
        "created_at": now,
    },
])

db.creator_applications.insert_one(
    {
        "_id": creator_uid,
        "user_id": creator_uid,
        "name": "TEST Creator Iter19",
        "email": creator_email,
        "bio": "TEST approved creator fixture for admin publish and student follow/progress checks.",
        "status": "approved",
        "created_at": now.isoformat(),
        "reviewed_at": now.isoformat(),
        "review_note": "fixture pre-approved",
    }
)

db.courses.insert_one(
    {
        "id": course_id,
        "title": f"TEST Iter19 Corso {tag}",
        "description": "Corso fixture per verificare preview lezioni, publish admin e progress studente in UI.",
        "category": "Cucina italiana",
        "price_cents": 1299,
        "creator_id": creator_uid,
        "creator_name": "TEST Creator Iter19",
        "status": "pending",
        "review_note": "",
        "updated_at": now.isoformat(),
        "lessons": [
            {
                "id": f"lesson_{tag}_preview",
                "title": "Lezione anteprima",
                "content": "Contenuto anteprima completo per test UI e progresso studente.",
                "preview": True,
            },
            {
                "id": f"lesson_{tag}_locked",
                "title": "Lezione riservata",
                "content": "Contenuto riservato non visibile allo studente senza acquisto.",
                "preview": False,
            },
        ],
    }
)

db.course_earnings.insert_one(
    {
        "id": earning_id,
        "creator_id": creator_uid,
        "course_title": f"TEST Iter19 Corso {tag}",
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
    "owner_email": OWNER_EMAIL,
    "creator": {"uid": creator_uid, "email": creator_email, "password": creator_password},
    "student": {"uid": student_uid, "email": student_email, "password": student_password},
    "admin_candidate": {"uid": admin_uid, "email": admin_email, "password": admin_password},
    "course": {
        "id": course_id,
        "preview_lesson_id": f"lesson_{tag}_preview",
        "locked_lesson_id": f"lesson_{tag}_locked",
    },
    "earning_id": earning_id,
    "created_at": now.isoformat(),
}

with open("/app/tests/iter19_fixture.json", "w", encoding="utf-8") as f:
    json.dump(fixture, f)

with open("/app/memory/test_credentials.md", "a", encoding="utf-8") as f:
    f.write("\n")
    f.write(f"## ITER19_TEMP_FIXTURE_{tag}\n")
    f.write(f"- Admin candidate email: `{admin_email}` / password: `{admin_password}`\n")
    f.write(f"- Creator fixture email: `{creator_email}` / password: `{creator_password}`\n")
    f.write(f"- Student fixture email: `{student_email}` / password: `{student_password}`\n")
    f.write("- NOTE: admin candidate will be atomically remapped to owner email only for fixture UI session if safe.\n")

print(json.dumps(fixture))
