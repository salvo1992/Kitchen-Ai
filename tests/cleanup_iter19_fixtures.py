import json
import os
from datetime import datetime, timezone

from pymongo import MongoClient


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    raise RuntimeError("MONGO_URL and DB_NAME are required")

fixture_path = "/app/tests/iter19_fixture.json"
if not os.path.exists(fixture_path):
    print("No iter19 fixture file found; nothing to cleanup")
    raise SystemExit(0)

with open(fixture_path, "r", encoding="utf-8") as f:
    fixture = json.load(f)

tag = fixture["tag"]
owner_email = fixture.get("owner_email", "thevikingoftheweb@gmail.com").lower()

creator_uid = fixture["creator"]["uid"]
student_uid = fixture["student"]["uid"]
admin_uid = fixture["admin_candidate"]["uid"]
course_id = fixture["course"]["id"]
earning_id = fixture["earning_id"]

creator_email = fixture["creator"]["email"].lower()
student_email = fixture["student"]["email"].lower()
admin_email = fixture["admin_candidate"]["email"].lower()

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Cleanup fixture-linked docs by both user_id and fixture IDs
db.course_progress.delete_many({"course_id": course_id})
db.course_earnings.delete_many({"id": earning_id})
db.courses.delete_many({"id": course_id})
db.creator_applications.delete_many({"_id": {"$in": [creator_uid, student_uid, admin_uid]}})
db.coach_messages.delete_many({"user_id": {"$in": [creator_uid, student_uid, admin_uid]}})
db.user_sessions.delete_many({"user_id": {"$in": [creator_uid, student_uid, admin_uid]}})

# Remove potential remapped owner-email row only when it is this exact fixture admin user_id
db.users.delete_many({"user_id": admin_uid})
db.users.delete_many({"user_id": {"$in": [creator_uid, student_uid]}})

# Also remove any stale docs with fixture emails
db.users.delete_many({"email": {"$in": [creator_email, student_email, admin_email]}})

creds_path = "/app/memory/test_credentials.md"
if os.path.exists(creds_path):
    marker = f"## ITER19_TEMP_FIXTURE_{tag}"
    with open(creds_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    out = []
    skip = False
    for line in lines:
        if line.startswith("## ITER19_TEMP_FIXTURE_"):
            skip = line.strip() == marker
            if skip:
                continue
        if skip:
            if line.startswith("## "):
                skip = False
                out.append(line)
            else:
                continue
        else:
            out.append(line)

    out.append("\n")
    out.append(f"## ITER19_TEMP_FIXTURE_{tag}_CLEANUP\n")
    out.append(f"- Cleanup timestamp: `{datetime.now(timezone.utc).isoformat()}`\n")
    out.append("- Temporary fixture credentials removed from active list.\n")
    out.append(f"- Owner email `{owner_email}` was not modified as a standalone account.\n")

    with open(creds_path, "w", encoding="utf-8") as f:
        f.writelines(out)

os.remove(fixture_path)
print(f"Cleaned iter19 fixture {tag}")
