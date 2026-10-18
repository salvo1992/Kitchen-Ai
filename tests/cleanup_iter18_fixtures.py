import json
import os

from pymongo import MongoClient


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    raise RuntimeError("MONGO_URL and DB_NAME are required")

fixture_path = "/app/tests/iter18_fixture.json"
if not os.path.exists(fixture_path):
    print("No fixture file found; nothing to cleanup")
    raise SystemExit(0)

with open(fixture_path, "r", encoding="utf-8") as f:
    fixture = json.load(f)

tag = fixture["tag"]
creator_uid = fixture["creator"]["uid"]
student_uid = fixture["student"]["uid"]
admin_uid = fixture["admin"]["uid"]
admin_token = fixture["admin"]["token"]

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

db.course_earnings.delete_many({"id": {"$regex": f"^earning_{tag}_"}})
db.courses.delete_many({"creator_id": creator_uid})
db.course_progress.delete_many({"user_id": {"$in": [creator_uid, student_uid]}})
db.creator_applications.delete_many({"_id": creator_uid})
db.coach_messages.delete_many({"user_id": {"$in": [creator_uid, student_uid]}})
db.user_sessions.delete_many({"$or": [{"user_id": {"$in": [creator_uid, student_uid, admin_uid]}}, {"session_token": admin_token}]})
db.users.delete_many({"user_id": {"$in": [creator_uid, student_uid, admin_uid]}})

creds_path = "/app/memory/test_credentials.md"
if os.path.exists(creds_path):
    marker = f"## ITER18_TEMP_FIXTURE_{tag}"
    with open(creds_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    out = []
    skip = False
    for line in lines:
        if line.startswith("## ITER18_TEMP_FIXTURE_"):
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
    with open(creds_path, "w", encoding="utf-8") as f:
        f.writelines(out)

os.remove(fixture_path)
print(f"Cleaned fixture {tag}")
