from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.hash import bcrypt
import os, uuid, logging, httpx, requests, json, base64, re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "cucinasmart-ai")
# Emergent-managed Google Auth session-exchange endpoint (fixed platform URL from the integration playbook; overridable via env)
EMERGENT_AUTH_SESSION_URL = os.environ.get("EMERGENT_AUTH_SESSION_URL", "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logging.error(f"init_storage failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str):
    key = init_storage()
    if not key:
        raise HTTPException(500, "storage unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(500, "storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Models ----------
class SignUpBody(BaseModel):
    email: EmailStr
    password: str
    name: str

class SignInBody(BaseModel):
    email: EmailStr
    password: str

class SessionExchangeBody(BaseModel):
    session_id: str

class RecipeCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    ingredients: List[Dict[str, Any]] = []  # [{name, qty, unit}]
    steps: List[str] = []
    time_min: Optional[int] = 30
    servings: Optional[int] = 2
    tags: List[str] = []
    image_url: Optional[str] = None
    favorite: bool = False

class PantryItemCreate(BaseModel):
    name: str
    qty: float = 1
    unit: str = "pz"
    location: str = "pantry"  # pantry|fridge|freezer
    expires_at: Optional[str] = None  # ISO date
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None  # € per item, optional

class CookedBody(BaseModel):
    servings: Optional[int] = None

class AiRecipeBody(BaseModel):
    query: str

class ShoppingItemCreate(BaseModel):
    name: str
    qty: float = 1
    unit: str = "pz"
    aisle: str = "Altro"
    checked: bool = False
    note: Optional[str] = ""

class MealCreate(BaseModel):
    date: str  # YYYY-MM-DD
    slot: str  # colazione|pranzo|cena|spuntino
    title: str
    recipe_id: Optional[str] = None
    notes: Optional[str] = ""

class ChatBody(BaseModel):
    message: str
    session_id: Optional[str] = None

class ImportPhotoBody(BaseModel):
    image_base64: str

class CookBody(BaseModel):
    ingredients: List[str] = []  # optional override

class WeeklyPlanBody(BaseModel):
    start_date: Optional[str] = None  # YYYY-MM-DD, default today
    preferences: Optional[str] = ""

class WeeklyPlanSaveBody(BaseModel):
    days: List[Dict[str, Any]]
    replace: bool = True

class HouseholdCreateBody(BaseModel):
    name: str

class HouseholdJoinBody(BaseModel):
    invite_code: str

class RangeBody(BaseModel):
    start: str
    end: str

class UploadB64Body(BaseModel):
    image_base64: str
    ext: Optional[str] = "jpg"

# ---------- Household (family sharing) helpers ----------
SHARED_COLLECTIONS = ["recipes", "pantry", "shopping", "meals"]

def scope(user: dict) -> dict:
    """Mongo filter: own docs + household docs."""
    hid = user.get("household_id")
    if hid:
        return {"$or": [{"user_id": user["user_id"]}, {"household_id": hid}]}
    return {"user_id": user["user_id"]}

def owned(user: dict) -> dict:
    d = {"user_id": user["user_id"]}
    if user.get("household_id"):
        d["household_id"] = user["household_id"]
    return d

def _to_number(v):
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        s = v.strip().replace(",", ".")
        m = re.match(r"^(\d+(?:\.\d+)?)(?:\s*/\s*(\d+))?", s)
        if m:
            n = float(m.group(1))
            if m.group(2):
                n = n / float(m.group(2))
            return int(n) if n == int(n) else round(n, 2)
    return None

def norm_ingredients(raw) -> List[Dict[str, Any]]:
    """Normalize AI/user ingredient payloads to [{name, qty, unit}]."""
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for it in raw:
        if isinstance(it, str):
            # e.g. "200 g farina" or "farina 200 g" or "sale q.b."
            m = re.match(r"^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z.]*)\s+(.+)$", it)
            if m:
                out.append({"name": m.group(3).strip(), "qty": _to_number(m.group(1)) or 1, "unit": m.group(2) or "pz"})
            else:
                out.append({"name": it.strip(), "qty": 1, "unit": "q.b."})
            continue
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or it.get("nome") or it.get("ingredient") or "").strip()
        if not name:
            continue
        qty_raw = it.get("qty", it.get("quantity", it.get("quantita", 1)))
        unit = str(it.get("unit") or it.get("unita") or "").strip()
        qty = _to_number(qty_raw)
        if qty is None:
            # qty like "q.b." or "un pizzico" -> keep as unit text
            if isinstance(qty_raw, str) and qty_raw.strip():
                unit = unit or qty_raw.strip()
            qty = 1
        out.append({"name": name, "qty": qty, "unit": unit or "pz"})
    return out

AISLE_KEYWORDS = [
    ("Frutta e verdura", ["pomodor", "cipoll", "aglio", "insalat", "zucchin", "melanzan", "peperon", "carot", "patat", "mela", "banan", "limon", "arancia", "spinac", "basilic", "prezzemol", "funghi", "fragol", "pera", "sedano", "broccol", "cavol", "zucca", "lattuga", "rucola", "avocado", "pesca", "uva", "kiwi", "finocchi", "porro", "verdur", "frutta", "erbe", "rosmarin", "salvia", "menta", "peperoncin"]),
    ("Carne e pesce", ["pollo", "manzo", "maiale", "tacchino", "salsiccia", "prosciutto", "speck", "pancetta", "salmone", "tonno", "merluzzo", "gamber", "cozze", "vongole", "pesce", "carne", "bistecca", "macinat", "agnello", "vitello", "bresaola", "wurstel"]),
    ("Latticini", ["latte", "burro", "yogurt", "formaggio", "parmigian", "grana", "mozzarell", "ricotta", "panna", "mascarpone", "pecorino", "gorgonzola", "stracchino", "uova", "uovo", "scamorza", "feta"]),
    ("Pane e cereali", ["pane", "pasta", "riso", "farina", "spaghett", "penne", "fusilli", "cereali", "avena", "orzo", "farro", "couscous", "quinoa", "pancarr", "piadin", "crackers", "fette biscottate", "lasagn", "gnocch", "tortellin", "polenta"]),
    ("Surgelati", ["surgelat", "gelato", "pisell", "spinaci surgelat", "bastoncin"]),
    ("Bevande", ["acqua", "vino", "birra", "succo", "caffè", "caffe", "tè", "the", "bibita", "cola"]),
    ("Dispensa", ["olio", "sale", "pepe", "zucchero", "aceto", "legumi", "fagiol", "lenticchi", "ceci", "passata", "pelati", "conserva", "miele", "marmellata", "cioccolat", "biscott", "noci", "mandorl", "spezie", "curry", "paprika", "origano", "brodo", "dado", "lievito", "cacao", "senape", "maionese", "ketchup", "soia", "tonno in scatola", "capperi", "olive"]),
]

def guess_aisle(name: str) -> str:
    n = (name or "").lower()
    for aisle, kws in AISLE_KEYWORDS:
        if any(k in n for k in kws):
            return aisle
    return "Altro"

def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9àèéìòù ]", "", (s or "").lower()).strip()

def name_matches(a: str, b: str) -> bool:
    a, b = _norm_name(a), _norm_name(b)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    # singular/plural tolerance on first word
    aw, bw = a.split()[0], b.split()[0]
    return len(aw) > 3 and len(bw) > 3 and aw[:-1] == bw[:-1]

def extract_json(text: str):
    t = text.strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    for pat in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pat, t, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                continue
    return None

# ---------- Auth helpers ----------
async def get_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "missing bearer")
    token = auth[7:]
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "invalid session")
    exp = sess.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(401, "expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "no user")
    return user

async def create_session(user_id: str):
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "created_at": datetime.now(timezone.utc), "expires_at": expires,
    })
    return token


# ---------- Auth Routes ----------
@api_router.post("/auth/signup")
async def signup(body: SignUpBody):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(400, "email già registrata")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    pw_hash = bcrypt.hash(body.password)
    user_doc = {
        "user_id": uid, "email": body.email.lower(), "name": body.name,
        "password_hash": pw_hash, "picture": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    token = await create_session(uid)
    return {"session_token": token, "user": {"user_id": uid, "email": body.email.lower(), "name": body.name, "picture": None}}

@api_router.post("/auth/signin")
async def signin(body: SignInBody):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not bcrypt.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "credenziali non valide")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": {"user_id": user["user_id"], "email": user["email"], "name": user.get("name"), "picture": user.get("picture")}}

@api_router.post("/auth/session")
async def exchange_session(body: SessionExchangeBody):
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.get(
            EMERGENT_AUTH_SESSION_URL,
            headers={"X-Session-ID": body.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "invalid session_id")
    data = resp.json()
    email = data.get("email", "").lower()
    name = data.get("name")
    picture = data.get("picture")
    emergent_token = data.get("session_token")
    if not email or not emergent_token:
        raise HTTPException(401, "incomplete profile")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        uid = existing["user_id"]
        await db.users.update_one({"user_id": uid}, {"$set": {"name": name or existing.get("name"), "picture": picture}})
    else:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"user_id": uid, "email": email, "name": name, "picture": picture, "created_at": datetime.now(timezone.utc)})
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": emergent_token, "user_id": uid,
        "created_at": datetime.now(timezone.utc), "expires_at": expires,
    })
    return {"session_token": emergent_token, "user": {"user_id": uid, "email": email, "name": name, "picture": picture}}

@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await get_user(request)
    return {"user": user}

@api_router.delete("/auth/account")
async def delete_account(request: Request):
    """Permanently delete the user, their sessions and all personal data (App Store requirement)."""
    user = await get_user(request)
    uid = user["user_id"]
    hid = user.get("household_id")
    if hid:
        await db.households.update_one({"id": hid}, {"$pull": {"members": uid}})
        h = await db.households.find_one({"id": hid}, {"_id": 0, "members": 1})
        if h and not h.get("members"):
            await db.households.delete_one({"id": hid})
    for coll in SHARED_COLLECTIONS + ["consumption_log", "chat_messages", "uploads", "file_tokens", "user_sessions"]:
        await db[coll].delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}

@api_router.post("/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth[7:]})
    return {"ok": True}


# ---------- Recipes ----------
DEFAULT_PRICE = 2.5
PANTRY_STAPLES = {"sale", "pepe", "acqua", "sale e pepe", "olio", "olio doliva", "olio evo", "olio extravergine"}

def _days_left(expires_at) -> Optional[int]:
    if not expires_at:
        return None
    try:
        return (datetime.fromisoformat(str(expires_at)[:10]).date() - datetime.now(timezone.utc).date()).days
    except ValueError:
        return None

def _match_pantry(recipe_ings: List[Dict[str, Any]], pantry: List[Dict[str, Any]]):
    """Return (matched, missing) ingredient lists. Staples / q.b. items never count as missing."""
    matched, missing = [], []
    for ing in recipe_ings:
        n = _norm_name(ing.get("name", ""))
        if not n:
            continue
        hit = next((p for p in pantry if name_matches(ing["name"], p["name"])), None)
        if hit:
            matched.append({**ing, "pantry_id": hit["id"]})
        elif ing.get("unit") == "q.b." or n in PANTRY_STAPLES:
            continue
        else:
            missing.append(ing)
    return matched, missing

@api_router.get("/recipes")
async def list_recipes(request: Request, q: Optional[str] = None, favorite: Optional[bool] = None, cookable: Optional[bool] = None):
    user = await get_user(request)
    query = scope(user)
    if favorite is not None:
        query["favorite"] = favorite
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query = {"$and": [query, {"$or": [{"title": rx}, {"ingredients.name": rx}, {"tags": rx}]}]}
    items = await db.recipes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    pantry = await db.pantry.find({**scope(user), "qty": {"$gt": 0}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    out = []
    for r in items:
        ings = norm_ingredients(r.get("ingredients") or [])
        matched, missing = _match_pantry(ings, pantry)
        r["missing_count"] = len(missing)
        r["missing_names"] = [m["name"] for m in missing][:5]
        r["cookable"] = len(ings) > 0 and len(missing) == 0
        if cookable and not r["cookable"]:
            continue
        out.append(r)
    return {"items": out}

@api_router.post("/recipes")
async def create_recipe(body: RecipeCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc["ingredients"] = norm_ingredients(doc.get("ingredients"))
    doc["steps"] = [str(s).strip() for s in (doc.get("steps") or []) if str(s).strip()]
    doc.update(owned(user))
    doc["id"] = f"rec_{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc)
    await db.recipes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/recipes/{rid}")
async def get_recipe(rid: str, request: Request):
    user = await get_user(request)
    r = await db.recipes.find_one({"id": rid, **scope(user)}, {"_id": 0})
    if not r:
        raise HTTPException(404, "not found")
    return r

@api_router.patch("/recipes/{rid}")
async def update_recipe(rid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None); body.pop("household_id", None)
    if "ingredients" in body:
        body["ingredients"] = norm_ingredients(body["ingredients"])
    await db.recipes.update_one({"id": rid, **scope(user)}, {"$set": body})
    r = await db.recipes.find_one({"id": rid, **scope(user)}, {"_id": 0})
    return r

@api_router.delete("/recipes/{rid}")
async def delete_recipe(rid: str, request: Request):
    user = await get_user(request)
    await db.recipes.delete_one({"id": rid, **scope(user)})
    return {"ok": True}

@api_router.post("/recipes/{rid}/to-shopping")
async def recipe_to_shopping(rid: str, request: Request):
    """Add the recipe's missing ingredients (not in pantry, not already on the list) to the shopping list."""
    user = await get_user(request)
    r = await db.recipes.find_one({"id": rid, **scope(user)}, {"_id": 0})
    if not r:
        raise HTTPException(404, "not found")
    pantry = await db.pantry.find(scope(user), {"_id": 0, "name": 1}).to_list(1000)
    shopping = await db.shopping.find({**scope(user), "checked": False}, {"_id": 0, "name": 1}).to_list(1000)
    pantry_names = [p["name"] for p in pantry]
    shop_names = [s["name"] for s in shopping]
    added, in_pantry, already = [], [], []
    now = datetime.now(timezone.utc)
    for ing in norm_ingredients(r.get("ingredients") or []):
        name = ing["name"]
        if any(name_matches(name, p) for p in pantry_names):
            in_pantry.append(name); continue
        if any(name_matches(name, s) for s in shop_names):
            already.append(name); continue
        doc = {"id": f"shp_{uuid.uuid4().hex[:12]}", "name": name, "qty": ing["qty"], "unit": ing["unit"],
               "aisle": guess_aisle(name), "checked": False, "note": f"Per: {r['title']}", "created_at": now, **owned(user)}
        await db.shopping.insert_one(doc)
        doc.pop("_id", None)
        added.append(doc)
    return {"added": added, "in_pantry": in_pantry, "already_listed": already}

@api_router.post("/recipes/{rid}/cooked")
async def recipe_cooked(rid: str, body: CookedBody, request: Request):
    """Mark a recipe as cooked: subtract ingredients from pantry (qty never < 0), add finished items to shopping, log consumption."""
    user = await get_user(request)
    r = await db.recipes.find_one({"id": rid, **scope(user)}, {"_id": 0})
    if not r:
        raise HTTPException(404, "not found")
    base = _to_number(r.get("servings")) or 2
    factor = (body.servings or base) / base
    pantry = await db.pantry.find(scope(user), {"_id": 0}).to_list(1000)
    shop_names = [s["name"] for s in await db.shopping.find({**scope(user), "checked": False}, {"_id": 0, "name": 1}).to_list(1000)]
    now = datetime.now(timezone.utc)
    updated, finished, added_shopping, not_found, log_items = [], [], [], [], []
    for ing in norm_ingredients(r.get("ingredients") or []):
        hit = next((p for p in pantry if name_matches(ing["name"], p["name"])), None)
        if not hit:
            if ing.get("unit") != "q.b." and _norm_name(ing["name"]) not in PANTRY_STAPLES:
                not_found.append(ing["name"])
            continue
        cur = float(hit.get("qty") or 0)
        same_unit = (hit.get("unit") or "").lower() == (ing.get("unit") or "").lower()
        if ing.get("unit") == "q.b.":
            used = 0.0
        elif same_unit:
            used = min(cur, float(ing["qty"]) * factor)
        else:
            used = min(cur, 1.0)  # unit mismatch: consume one package
        new_qty = _fmt_qty(max(0.0, cur - used))
        await db.pantry.update_one({"id": hit["id"]}, {"$set": {"qty": new_qty}})
        hit["qty"] = new_qty
        dl = _days_left(hit.get("expires_at"))
        log_items.append({"pantry_id": hit["id"], "name": hit["name"], "used_qty": _fmt_qty(used), "unit": hit.get("unit"), "days_left": dl,
                          "price": hit.get("price") if isinstance(hit.get("price"), (int, float)) else None})
        updated.append({"name": hit["name"], "used": _fmt_qty(used), "unit": hit.get("unit"), "left": new_qty})
        if new_qty == 0 and used > 0:
            finished.append(hit["name"])
            if not any(name_matches(hit["name"], s) for s in shop_names):
                doc = {"id": f"shp_{uuid.uuid4().hex[:12]}", "name": hit["name"], "qty": 1, "unit": hit.get("unit") or "pz", "aisle": guess_aisle(hit["name"]),
                       "checked": False, "note": f"Finito cucinando: {r['title']}", "created_at": now, **owned(user)}
                await db.shopping.insert_one(doc)
                shop_names.append(hit["name"])
                added_shopping.append(hit["name"])
    await db.consumption_log.insert_one({"id": f"log_{uuid.uuid4().hex[:12]}", "recipe_id": rid, "title": r["title"], "servings": body.servings or base,
                                         "items": log_items, "created_at": now, "month": now.strftime("%Y-%m"), **owned(user)})
    return {"updated": updated, "finished": finished, "added_to_shopping": added_shopping, "not_found": not_found, "items_saved": sum(1 for i in log_items if i["days_left"] is not None and i["days_left"] <= 3)}

@api_router.get("/stats/history")
async def cooked_history(request: Request, month: Optional[str] = None):
    """Everything cooked in a month (most recent first)."""
    user = await get_user(request)
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    if not re.match(r"^\d{4}-\d{2}$", m):
        raise HTTPException(400, "month non valido (YYYY-MM)")
    logs = await db.consumption_log.find({**scope(user), "month": m}, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for lg in logs:
        items = lg.get("items", [])
        out.append({"id": lg["id"], "recipe_id": lg.get("recipe_id"), "title": lg.get("title"), "servings": lg.get("servings"),
                    "cooked_at": lg["created_at"].isoformat() if isinstance(lg["created_at"], datetime) else str(lg["created_at"]),
                    "items_used": sum(1 for i in items if i.get("used_qty")),
                    "items_saved": sum(1 for i in items if i.get("used_qty") and i.get("days_left") is not None and i["days_left"] <= 3)})
    return {"month": m, "items": out}

@api_router.get("/stats/waste")
async def waste_stats(request: Request, month: Optional[str] = None):
    """Monthly anti-waste card: recipes cooked, items used, items saved from expiring (≤3 days), money not wasted."""
    user = await get_user(request)
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    if not re.match(r"^\d{4}-\d{2}$", m):
        raise HTTPException(400, "month non valido (YYYY-MM)")
    logs = await db.consumption_log.find({**scope(user), "month": m}, {"_id": 0}).to_list(2000)
    items_used = saved = 0
    money = 0.0
    for lg in logs:
        for it in lg.get("items", []):
            if not it.get("used_qty"):
                continue
            items_used += 1
            if it.get("days_left") is not None and it["days_left"] <= 3:
                saved += 1
                money += float(it["price"]) if it.get("price") is not None else DEFAULT_PRICE
    expired_now = sum(1 for p in await db.pantry.find({**scope(user), "expires_at": {"$nin": [None, ""]}, "qty": {"$gt": 0}}, {"_id": 0, "expires_at": 1}).to_list(1000)
                      if (_days_left(p.get("expires_at")) or 0) < 0)
    return {"month": m, "recipes_cooked": len(logs), "items_used": items_used, "items_saved": saved, "money_saved": round(money, 2), "expired_now": expired_now,
            "last_cooked": sorted([{"title": l["title"], "at": l["created_at"].isoformat() if isinstance(l["created_at"], datetime) else str(l["created_at"])} for l in logs], key=lambda x: x["at"], reverse=True)[:3]}


# ---------- Pantry ----------
@api_router.get("/pantry")
async def list_pantry(request: Request, location: Optional[str] = None):
    user = await get_user(request)
    q = scope(user)
    if location:
        q["location"] = location
    items = await db.pantry.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"items": items}

@api_router.get("/pantry/expiring")
async def pantry_expiring(request: Request, days: int = 3):
    """Items expired or expiring within `days` days, soonest first."""
    user = await get_user(request)
    items = await db.pantry.find({**scope(user), "expires_at": {"$nin": [None, ""]}, "qty": {"$gt": 0}}, {"_id": 0}).to_list(1000)
    today = datetime.now(timezone.utc).date()
    out = []
    for i in items:
        try:
            d = datetime.fromisoformat(str(i["expires_at"])[:10]).date()
        except ValueError:
            continue
        left = (d - today).days
        if left <= days:
            i["days_left"] = left
            out.append(i)
    out.sort(key=lambda x: x["days_left"])
    return {"items": out, "count": len(out)}

@api_router.post("/pantry")
async def create_pantry(body: PantryItemCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc.update(owned(user))
    doc["id"] = f"pan_{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc)
    await db.pantry.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/pantry/{pid}")
async def update_pantry(pid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None); body.pop("household_id", None)
    await db.pantry.update_one({"id": pid, **scope(user)}, {"$set": body})
    r = await db.pantry.find_one({"id": pid, **scope(user)}, {"_id": 0})
    return r

@api_router.delete("/pantry/{pid}")
async def delete_pantry(pid: str, request: Request):
    user = await get_user(request)
    await db.pantry.delete_one({"id": pid, **scope(user)})
    return {"ok": True}

@api_router.get("/products/barcode/{code}")
async def barcode_lookup(code: str, request: Request):
    """Look up a product on Open Food Facts."""
    await get_user(request)
    code = re.sub(r"\D", "", code)
    if not code:
        raise HTTPException(400, "codice non valido")
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}.json"
    params = {"fields": "product_name,product_name_it,brands,image_front_url,image_front_small_url,quantity,categories_tags"}
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": "SmartKitchenAI/1.0"}) as cx:
            r = await cx.get(url, params=params)
        data = r.json() if r.status_code == 200 else {}
    except Exception as e:
        logging.error(f"OFF lookup err: {e}")
        raise HTTPException(502, "servizio prodotti non raggiungibile")
    p = data.get("product") or {}
    if data.get("status") != 1 or not p:
        return {"found": False, "barcode": code}
    name = p.get("product_name_it") or p.get("product_name") or ""
    qty, unit = 1, "pz"
    qm = re.match(r"^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)", p.get("quantity") or "")
    if qm:
        qty = _to_number(qm.group(1)) or 1
        unit = qm.group(2).lower()
    cats = " ".join(p.get("categories_tags") or [])
    location = "fridge" if any(k in cats for k in ["dairies", "cheeses", "yogurts", "meats", "fresh", "milks", "butters"]) else ("freezer" if "frozen" in cats else "pantry")
    return {"found": True, "barcode": code, "name": name.strip(), "brand": p.get("brands") or "",
            "image_url": p.get("image_front_url") or p.get("image_front_small_url"), "qty": qty, "unit": unit, "location": location}


# ---------- Shopping list ----------
@api_router.get("/shopping")
async def list_shopping(request: Request):
    user = await get_user(request)
    items = await db.shopping.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"items": items}

@api_router.post("/shopping")
async def create_shopping(body: ShoppingItemCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc.update(owned(user))
    doc["id"] = f"shp_{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc)
    await db.shopping.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/shopping/{sid}")
async def update_shopping(sid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None); body.pop("household_id", None)
    await db.shopping.update_one({"id": sid, **scope(user)}, {"$set": body})
    r = await db.shopping.find_one({"id": sid, **scope(user)}, {"_id": 0})
    return r

@api_router.delete("/shopping/{sid}")
async def delete_shopping(sid: str, request: Request):
    user = await get_user(request)
    await db.shopping.delete_one({"id": sid, **scope(user)})
    return {"ok": True}

@api_router.post("/shopping/clear-checked")
async def clear_checked(request: Request):
    user = await get_user(request)
    res = await db.shopping.delete_many({**scope(user), "checked": True})
    return {"deleted": res.deleted_count}


# ---------- Meal plan ----------
@api_router.get("/meals")
async def list_meals(request: Request, start: Optional[str] = None, end: Optional[str] = None):
    user = await get_user(request)
    q = scope(user)
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    items = await db.meals.find(q, {"_id": 0}).sort("date", 1).to_list(1000)
    return {"items": items}

@api_router.post("/meals")
async def create_meal(body: MealCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc.update(owned(user))
    doc["id"] = f"mea_{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc)
    await db.meals.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/meals/{mid}")
async def delete_meal(mid: str, request: Request):
    user = await get_user(request)
    await db.meals.delete_one({"id": mid, **scope(user)})
    return {"ok": True}

def _fmt_qty(q):
    if isinstance(q, float) and q == int(q):
        return int(q)
    return round(q, 2) if isinstance(q, float) else q

@api_router.post("/meals/to-shopping")
async def meals_to_shopping(body: RangeBody, request: Request):
    """Turn all recipe-linked meals in [start, end] into one shopping list: merge duplicates, skip pantry/listed items."""
    user = await get_user(request)
    meals = await db.meals.find({**scope(user), "date": {"$gte": body.start, "$lte": body.end}, "recipe_id": {"$nin": [None, ""]}}, {"_id": 0, "recipe_id": 1}).to_list(500)
    rids = list({m["recipe_id"] for m in meals})
    if not rids:
        return {"added": [], "in_pantry": [], "already_listed": [], "meals": 0, "recipes": 0}
    recipes = await db.recipes.find({**scope(user), "id": {"$in": rids}}, {"_id": 0, "id": 1, "ingredients": 1}).to_list(500)
    # merge by normalized name; sum qty when unit matches, else keep first unit and count occurrences
    merged: Dict[str, Dict[str, Any]] = {}
    for r in recipes:
        for ing in norm_ingredients(r.get("ingredients") or []):
            key = _norm_name(ing["name"])
            if not key:
                continue
            cur = merged.get(key)
            if not cur:
                merged[key] = {"name": ing["name"], "qty": ing["qty"], "unit": ing["unit"]}
            elif cur["unit"].lower() == ing["unit"].lower() and cur["unit"] != "q.b.":
                cur["qty"] = _fmt_qty(float(cur["qty"]) + float(ing["qty"]))
    pantry_names = [p["name"] for p in await db.pantry.find(scope(user), {"_id": 0, "name": 1}).to_list(1000)]
    shop_names = [s["name"] for s in await db.shopping.find({**scope(user), "checked": False}, {"_id": 0, "name": 1}).to_list(1000)]
    added, in_pantry, already = [], [], []
    now = datetime.now(timezone.utc)
    for ing in merged.values():
        name = ing["name"]
        if any(name_matches(name, p) for p in pantry_names):
            in_pantry.append(name); continue
        if any(name_matches(name, s) for s in shop_names):
            already.append(name); continue
        doc = {"id": f"shp_{uuid.uuid4().hex[:12]}", "name": name, "qty": ing["qty"], "unit": ing["unit"], "aisle": guess_aisle(name),
               "checked": False, "note": "Piano settimanale", "created_at": now, **owned(user)}
        await db.shopping.insert_one(doc)
        doc.pop("_id", None)
        added.append(doc)
    return {"added": added, "in_pantry": in_pantry, "already_listed": already, "meals": len(meals), "recipes": len(recipes)}


# ---------- Household (family sharing) ----------
async def _household_view(user: dict):
    hid = user.get("household_id")
    if not hid:
        return {"household": None, "members": []}
    h = await db.households.find_one({"id": hid}, {"_id": 0})
    if not h:
        return {"household": None, "members": []}
    members = await db.users.find({"user_id": {"$in": h.get("members", [])}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}).to_list(50)
    return {"household": h, "members": members}

async def _attach_docs(user_id: str, hid: Optional[str]):
    for coll in SHARED_COLLECTIONS:
        await db[coll].update_many({"user_id": user_id}, {"$set": {"household_id": hid}})

@api_router.get("/household")
async def get_household(request: Request):
    user = await get_user(request)
    return await _household_view(user)

@api_router.post("/household")
async def create_household(body: HouseholdCreateBody, request: Request):
    user = await get_user(request)
    if user.get("household_id"):
        raise HTTPException(400, "fai già parte di una famiglia")
    hid = f"hh_{uuid.uuid4().hex[:10]}"
    code = uuid.uuid4().hex[:6].upper()
    await db.households.insert_one({"id": hid, "name": body.name.strip() or "La mia famiglia", "owner_id": user["user_id"],
                                    "invite_code": code, "members": [user["user_id"]], "created_at": datetime.now(timezone.utc)})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"household_id": hid}})
    await _attach_docs(user["user_id"], hid)
    user["household_id"] = hid
    return await _household_view(user)

@api_router.post("/household/join")
async def join_household(body: HouseholdJoinBody, request: Request):
    user = await get_user(request)
    if user.get("household_id"):
        raise HTTPException(400, "fai già parte di una famiglia: esci prima")
    h = await db.households.find_one({"invite_code": body.invite_code.strip().upper()}, {"_id": 0})
    if not h:
        raise HTTPException(404, "codice invito non valido")
    await db.households.update_one({"id": h["id"]}, {"$addToSet": {"members": user["user_id"]}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"household_id": h["id"]}})
    await _attach_docs(user["user_id"], h["id"])
    user["household_id"] = h["id"]
    return await _household_view(user)

@api_router.post("/household/leave")
async def leave_household(request: Request):
    user = await get_user(request)
    hid = user.get("household_id")
    if not hid:
        return {"household": None, "members": []}
    await db.households.update_one({"id": hid}, {"$pull": {"members": user["user_id"]}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$unset": {"household_id": ""}})
    await _attach_docs(user["user_id"], None)
    h = await db.households.find_one({"id": hid}, {"_id": 0})
    if h and not h.get("members"):
        await db.households.delete_one({"id": hid})
    return {"household": None, "members": []}


# ---------- Chef AI ----------
def _chef_system_prompt():
    return (
        "Sei 'Chef AI', l'assistente italiano di Smart Kitchen AI. "
        "Aiuti l'utente con ricette, pianificazione pasti, lista della spesa, uso di ingredienti "
        "della dispensa/frigo/freezer e riduzione degli sprechi. "
        "Rispondi sempre in italiano, con un tono caldo, chiaro e amichevole. "
        "Quando suggerisci una ricetta, includi: titolo, tempo, porzioni, ingredienti e passaggi numerati brevi."
    )

@api_router.post("/ai/chat")
async def ai_chat(body: ChatBody, request: Request):
    user = await get_user(request)
    sid = body.session_id or f"chat_{user['user_id']}"
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=sid, system_message=_chef_system_prompt()).with_model("gemini", "gemini-3-flash-preview")
    # save user message
    await db.chat_messages.insert_one({
        "id": f"msg_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "session_id": sid,
        "role": "user", "content": body.message, "created_at": datetime.now(timezone.utc),
    })
    # load previous messages
    prev = await db.chat_messages.find({"user_id": user["user_id"], "session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(50)
    # Compose message with mini history hint (library handles by session_id, but we don't rely on it)
    try:
        reply = await chat.send_message(UserMessage(text=body.message))
        text = reply if isinstance(reply, str) else str(reply)
    except Exception as e:
        logging.error(f"AI chat error: {e}")
        text = "Ops, ho perso il filo. Riprova tra poco."
    await db.chat_messages.insert_one({
        "id": f"msg_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "session_id": sid,
        "role": "assistant", "content": text, "created_at": datetime.now(timezone.utc),
    })
    return {"reply": text, "session_id": sid}

@api_router.get("/ai/history")
async def ai_history(request: Request, session_id: Optional[str] = None):
    user = await get_user(request)
    q = {"user_id": user["user_id"]}
    if session_id:
        q["session_id"] = session_id
    msgs = await db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"items": msgs}

@api_router.post("/ai/what-can-i-cook")
async def what_can_i_cook(request: Request, body: CookBody):
    user = await get_user(request)
    if body.ingredients:
        ing_list = body.ingredients
    else:
        items = await db.pantry.find(scope(user), {"_id": 0}).to_list(200)
        ing_list = [i["name"] for i in items]
    if not ing_list:
        return {"suggestions": [], "message": "La tua dispensa è vuota. Aggiungi qualche ingrediente!"}
    prompt = (
        f"Con questi ingredienti disponibili: {', '.join(ing_list)}. "
        "Proponi 3 ricette semplici in JSON con schema: "
        '[{"title": "..", "time_min": 20, "servings": 2, "ingredients": [{"name":"..","qty":1,"unit":"pz"}], "steps": ["..","..",".."]}]. '
        "qty deve essere un numero; per 'quanto basta' usa qty 1 e unit \"q.b.\". "
        "Rispondi SOLO con JSON valido, senza testo aggiuntivo."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"cook_{user['user_id']}_{uuid.uuid4().hex[:6]}", system_message=_chef_system_prompt()).with_model("gemini", "gemini-3-flash-preview")
    try:
        text = await chat.send_message(UserMessage(text=prompt))
        text = text if isinstance(text, str) else str(text)
        data = extract_json(text) or []
        if isinstance(data, dict):
            data = data.get("recipes") or data.get("ricette") or []
    except Exception as e:
        logging.error(f"cook err: {e}")
        data = []
    out = []
    for r in data if isinstance(data, list) else []:
        if not isinstance(r, dict) or not r.get("title"):
            continue
        out.append({"title": str(r["title"]).strip(), "description": str(r.get("description") or ""),
                    "time_min": _to_number(r.get("time_min")) or 20, "servings": _to_number(r.get("servings")) or 2,
                    "ingredients": norm_ingredients(r.get("ingredients")), "steps": [str(s) for s in (r.get("steps") or [])],
                    "tags": [str(t) for t in (r.get("tags") or [])]})
    return {"suggestions": out}

SLOTS = ["colazione", "pranzo", "cena"]

@api_router.post("/ai/recipe")
async def ai_recipe(body: AiRecipeBody, request: Request):
    """Generate ONE complete recipe from a free-text query (preview only; save with POST /recipes)."""
    user = await get_user(request)
    qtxt = body.query.strip()
    if len(qtxt) < 2:
        raise HTTPException(400, "descrivi la ricetta che cerchi")
    pantry = await db.pantry.find({**scope(user), "qty": {"$gt": 0}}, {"_id": 0, "name": 1}).to_list(200)
    names = ", ".join(p["name"] for p in pantry[:60])
    prompt = (
        f"Crea una ricetta completa per: \"{qtxt}\". "
        f"{'Nota: l utente ha in casa ' + names + '; usali SOLO se sono ingredienti naturali di questa ricetta, altrimenti ignorali e resta fedele alla ricetta tradizionale. ' if names else ''}"
        "Rispondi SOLO con JSON valido: "
        '{"title":"..","description":"..","time_min":30,"servings":2,"ingredients":[{"name":"..","qty":1,"unit":"g"}],"steps":["..",".."],"tags":[".."]}. '
        "qty numerica (per 'quanto basta' usa qty 1 e unit \"q.b.\"), 3-8 passaggi chiari in italiano."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"rec_{user['user_id']}_{uuid.uuid4().hex[:6]}", system_message=_chef_system_prompt()).with_model("gemini", "gemini-3-flash-preview")
    try:
        text = await chat.send_message(UserMessage(text=prompt))
        data = extract_json(text if isinstance(text, str) else str(text))
    except Exception as e:
        logging.error(f"ai recipe err: {e}")
        raise HTTPException(502, "Chef AI non ha risposto, riprova")
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict) or not data.get("title"):
        raise HTTPException(502, "Chef AI non ha trovato una ricetta valida, riprova")
    return {"recipe": {"title": str(data["title"]).strip(), "description": str(data.get("description") or ""),
                       "time_min": _to_number(data.get("time_min")) or 30, "servings": _to_number(data.get("servings")) or 2,
                       "ingredients": norm_ingredients(data.get("ingredients")), "steps": [str(s) for s in (data.get("steps") or []) if str(s).strip()],
                       "tags": list({*[str(t) for t in (data.get("tags") or [])], "Chef AI"})}}

@api_router.post("/ai/weekly-plan")
async def weekly_plan(body: WeeklyPlanBody, request: Request):
    """Generate a 7-day plan (colazione/pranzo/cena) from the pantry. Returns a preview; save with /ai/weekly-plan/save."""
    user = await get_user(request)
    try:
        start = datetime.strptime(body.start_date, "%Y-%m-%d").date() if body.start_date else datetime.now().date()
    except ValueError:
        raise HTTPException(400, "start_date non valida")
    dates = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    items = await db.pantry.find(scope(user), {"_id": 0}).to_list(300)
    ing_list = [f"{i['name']} ({i.get('qty', '')} {i.get('unit', '')})".strip() for i in items]
    prefs = f" Preferenze dell'utente: {body.preferences}." if body.preferences else ""
    prompt = (
        f"Crea un piano pasti di 7 giorni (colazione, pranzo, cena) per le date {', '.join(dates)}. "
        f"Ingredienti già disponibili in casa: {', '.join(ing_list) if ing_list else 'nessuno'}. "
        "Usa il più possibile gli ingredienti disponibili, riducendo gli sprechi, e varia i piatti; cucina italiana casalinga, colazioni semplici."
        f"{prefs} "
        "Rispondi SOLO con JSON valido con schema: "
        '{"days":[{"date":"YYYY-MM-DD","meals":[{"slot":"colazione|pranzo|cena","recipe":{"title":"..","description":"..","time_min":20,"servings":2,'
        '"ingredients":[{"name":"..","qty":1,"unit":"g"}],"steps":["..",".."],"tags":[".."]}}]}]}. '
        "Ogni ricetta deve avere ingredienti completi con qty numerica (per 'quanto basta' usa qty 1 e unit \"q.b.\") e 2-5 passaggi brevi. Nessun testo fuori dal JSON."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"plan_{user['user_id']}_{uuid.uuid4().hex[:6]}", system_message=_chef_system_prompt()).with_model("gemini", "gemini-3-flash-preview")
    try:
        text = await chat.send_message(UserMessage(text=prompt))
        text = text if isinstance(text, str) else str(text)
        data = extract_json(text)
    except Exception as e:
        logging.error(f"weekly plan err: {e}")
        raise HTTPException(502, "Chef AI non ha risposto, riprova tra poco")
    raw_days = (data or {}).get("days") if isinstance(data, dict) else (data if isinstance(data, list) else None)
    if not raw_days:
        raise HTTPException(502, "Chef AI ha restituito un piano non valido, riprova")
    days = []
    for idx, d in enumerate(raw_days[:7]):
        date = d.get("date") if isinstance(d.get("date"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", d.get("date", "")) else dates[min(idx, 6)]
        meals = []
        for m in d.get("meals") or []:
            rec = m.get("recipe") if isinstance(m.get("recipe"), dict) else m
            title = str(rec.get("title") or m.get("title") or "").strip()
            slot = str(m.get("slot") or "").lower().strip()
            if not title or slot not in SLOTS:
                continue
            meals.append({"slot": slot, "recipe": {
                "title": title, "description": str(rec.get("description") or ""),
                "time_min": _to_number(rec.get("time_min")) or 20, "servings": _to_number(rec.get("servings")) or 2,
                "ingredients": norm_ingredients(rec.get("ingredients")), "steps": [str(s) for s in (rec.get("steps") or [])],
                "tags": [str(t) for t in (rec.get("tags") or [])]}})
        meals.sort(key=lambda x: SLOTS.index(x["slot"]))
        days.append({"date": date, "meals": meals})
    return {"start_date": dates[0], "end_date": dates[-1], "days": days}

@api_router.post("/ai/weekly-plan/save")
async def weekly_plan_save(body: WeeklyPlanSaveBody, request: Request):
    """Persist a generated plan: creates recipes (with structured ingredients) and meals linked to them."""
    user = await get_user(request)
    if not body.days:
        raise HTTPException(400, "piano vuoto")
    dates = sorted({d.get("date") for d in body.days if d.get("date")})
    now = datetime.now(timezone.utc)
    if body.replace and dates:
        await db.meals.delete_many({**scope(user), "date": {"$gte": dates[0], "$lte": dates[-1]}, "slot": {"$in": SLOTS}})
    recipes_created, meals_created = 0, 0
    title_cache: Dict[str, str] = {}
    for d in body.days:
        date = d.get("date")
        if not date:
            continue
        for m in d.get("meals") or []:
            rec = m.get("recipe") or {}
            title = str(rec.get("title") or m.get("title") or "").strip()
            slot = str(m.get("slot") or "").lower()
            if not title or slot not in SLOTS:
                continue
            key = title.lower()
            rid = title_cache.get(key)
            if not rid:
                existing = await db.recipes.find_one({**scope(user), "title": {"$regex": f"^{re.escape(title)}$", "$options": "i"}}, {"_id": 0, "id": 1})
                if existing:
                    rid = existing["id"]
                else:
                    rid = f"rec_{uuid.uuid4().hex[:12]}"
                    await db.recipes.insert_one({
                        "id": rid, "title": title, "description": str(rec.get("description") or ""),
                        "ingredients": norm_ingredients(rec.get("ingredients")), "steps": [str(s) for s in (rec.get("steps") or [])],
                        "time_min": _to_number(rec.get("time_min")) or 20, "servings": _to_number(rec.get("servings")) or 2,
                        "tags": list({*[str(t) for t in (rec.get("tags") or [])], "piano AI"}), "image_url": None, "favorite": False,
                        "created_at": now, **owned(user)})
                    recipes_created += 1
                title_cache[key] = rid
            await db.meals.insert_one({"id": f"mea_{uuid.uuid4().hex[:12]}", "date": date, "slot": slot, "title": title,
                                       "recipe_id": rid, "notes": "Piano settimanale AI", "created_at": now, **owned(user)})
            meals_created += 1
    return {"recipes_created": recipes_created, "meals_created": meals_created, "start_date": dates[0] if dates else None, "end_date": dates[-1] if dates else None}

@api_router.post("/ai/import-photo")
async def import_photo(body: ImportPhotoBody, request: Request):
    user = await get_user(request)
    b64 = body.image_base64
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    prompt = (
        "Analizza questa foto di un piano alimentare / menu settimanale. "
        "Estrai i pasti in JSON: {\"meals\":[{\"day\":\"lunedì|martedì|...\",\"slot\":\"colazione|pranzo|cena|spuntino\",\"title\":\"..\"}]}. "
        "Rispondi SOLO con JSON valido, in italiano."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"import_{user['user_id']}_{uuid.uuid4().hex[:6]}", system_message="Sei un OCR intelligente per piani alimentari.").with_model("gemini", "gemini-3-flash-preview")
    try:
        img = ImageContent(image_base64=b64)
        text = await chat.send_message(UserMessage(text=prompt, file_contents=[img]))
        text = text if isinstance(text, str) else str(text)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(m.group(0)) if m else {"meals": []}
    except Exception as e:
        logging.error(f"import err: {e}")
        data = {"meals": []}
    return data


# ---------- Storage ----------
async def _store_upload(user: dict, data: bytes, ext: str, ct: str):
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    result = await run_in_threadpool(lambda: put_object(path, data, ct))
    await db.uploads.insert_one({"path": result["path"], "user_id": user["user_id"], "created_at": datetime.now(timezone.utc), "content_type": ct})
    # long-lived token so <Image> tags (web and native) can load the file without headers
    token = uuid.uuid4().hex
    await db.file_tokens.insert_one({"token": token, "path": result["path"], "user_id": user["user_id"], "expires_at": datetime.now(timezone.utc) + timedelta(days=3650)})
    return {"path": result["path"], "url": f"/api/files/{result['path']}?token={token}", "token": token}

@api_router.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    user = await get_user(request)
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        ext = "jpg"
    data = await file.read()
    return await _store_upload(user, data, ext, file.content_type or f"image/{ext}")

@api_router.post("/upload-base64")
async def upload_base64(body: UploadB64Body, request: Request):
    user = await get_user(request)
    b64 = body.image_base64
    ext = (body.ext or "jpg").lower().strip(".")
    if b64.startswith("data:"):
        head, b64 = b64.split(",", 1)
        m = re.search(r"image/(\w+)", head)
        if m:
            ext = m.group(1)
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        ext = "jpg"
    try:
        data = base64.b64decode(b64)
    except Exception:
        raise HTTPException(400, "immagine non valida")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "immagine troppo grande (max 8MB)")
    return await _store_upload(user, data, ext, f"image/{'jpeg' if ext == 'jpg' else ext}")

@api_router.get("/files/{path:path}")
async def files(path: str, request: Request, token: Optional[str] = Query(None)):
    # Auth by bearer OR token
    user = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        sess = await db.user_sessions.find_one({"session_token": auth[7:]}, {"_id": 0})
        if sess:
            user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user and token:
        rec = await db.file_tokens.find_one({"token": token, "path": path}, {"_id": 0})
        if rec:
            exp = rec.get("expires_at")
            if isinstance(exp, datetime):
                if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
                if exp >= datetime.now(timezone.utc):
                    user = await db.users.find_one({"user_id": rec["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "unauthorized")
    up = await db.uploads.find_one({"path": path, "user_id": user["user_id"]}, {"_id": 0})
    if not up:
        raise HTTPException(404, "not found")
    def _do():
        return get_object(path)
    content, ct = await run_in_threadpool(_do)
    return Response(content=content, media_type=ct)


@api_router.get("/")
async def root():
    return {"app": "Smart Kitchen AI", "ok": True}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.recipes.create_index([("user_id", 1), ("created_at", -1)])
        await db.pantry.create_index([("user_id", 1), ("location", 1)])
        await db.shopping.create_index([("user_id", 1), ("created_at", -1)])
        await db.meals.create_index([("user_id", 1), ("date", 1)])
        await db.chat_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])
        # file tokens: expiry is enforced at read time in /files; no TTL auto-deletion (recipe photos need long-lived tokens)
        try:
            await db.file_tokens.drop_index("expires_at_1")
        except Exception:
            pass
        await db.file_tokens.create_index([("token", 1), ("path", 1)])
        await db.households.create_index("invite_code", unique=True)
        for coll in SHARED_COLLECTIONS:
            await db[coll].create_index("household_id")
    except Exception as e:
        logging.warning(f"index err: {e}")
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logging.warning(f"storage init: {e}")

@app.on_event("shutdown")
async def shutdown():
    client.close()
