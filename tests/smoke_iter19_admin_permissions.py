import json
import os

import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is required")

with open("/app/tests/iter19_fixture.json", "r", encoding="utf-8") as f:
    fixture = json.load(f)

admin_email = fixture["admin_candidate"]["email"]
admin_password = fixture["admin_candidate"]["password"]

signin = requests.post(
    f"{BASE_URL}/api/auth/signin",
    json={"email": admin_email, "password": admin_password},
    timeout=25,
)
assert signin.status_code == 200, signin.text
token = signin.json()["session_token"]
headers = {"Authorization": f"Bearer {token}"}

access = requests.get(f"{BASE_URL}/api/shop/access", headers=headers, timeout=25)
assert access.status_code == 200, access.text
assert access.json().get("is_admin") is False

admin_forbidden = requests.get(f"{BASE_URL}/api/admin/shop", headers=headers, timeout=25)
assert admin_forbidden.status_code in (401, 403), admin_forbidden.text

print("iter19 smoke ok: fixture admin candidate has no admin before DB mutation")
