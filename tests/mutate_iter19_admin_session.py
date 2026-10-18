import json
import os
import sys

from pymongo import MongoClient


if len(sys.argv) < 2:
    raise SystemExit("usage: python mutate_iter19_admin_session.py <session_token>")

session_token = sys.argv[1].strip()
if not session_token:
    raise SystemExit("empty session token")

with open('/app/tests/iter19_fixture.json', 'r', encoding='utf-8') as f:
    fx = json.load(f)

owner_email = fx.get('owner_email', 'thevikingoftheweb@gmail.com').lower()
admin_uid = fx['admin_candidate']['uid']
admin_original_email = fx['admin_candidate']['email'].lower()

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')
if not mongo_url or not db_name:
    raise RuntimeError('MONGO_URL and DB_NAME are required')

client = MongoClient(mongo_url)
db = client[db_name]

conflict = db.users.find_one({'email': owner_email, 'user_id': {'$ne': admin_uid}}, {'_id': 0, 'user_id': 1})
if conflict:
    print(json.dumps({
        'ok': False,
        'owner_conflict': True,
        'conflict_user_id': conflict.get('user_id'),
        'message': 'genuine owner row conflict; admin mutation skipped'
    }))
    raise SystemExit(0)

user_update = db.users.update_one(
    {'user_id': admin_uid, 'email': admin_original_email},
    {'$set': {'email': owner_email}, '$unset': {'password_hash': ''}}
)

if user_update.matched_count != 1:
    print(json.dumps({'ok': False, 'owner_conflict': False, 'message': 'admin user remap failed'}))
    raise SystemExit(2)

session_update = db.user_sessions.update_one(
    {'session_token': session_token, 'user_id': admin_uid},
    {'$set': {'identity_verified': True, 'verified_email': owner_email}}
)

if session_update.matched_count != 1:
    print(json.dumps({'ok': False, 'owner_conflict': False, 'message': 'session verification update failed'}))
    raise SystemExit(3)

print(json.dumps({'ok': True, 'owner_conflict': False, 'message': 'fixture session promoted to admin'}))
