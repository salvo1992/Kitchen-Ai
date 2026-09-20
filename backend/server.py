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
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
APP_NAME = os.environ.get("APP_NAME", "cucinasmart-ai")

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
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
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

@api_router.post("/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth[7:]})
    return {"ok": True}


# ---------- Recipes ----------
@api_router.get("/recipes")
async def list_recipes(request: Request, q: Optional[str] = None, favorite: Optional[bool] = None):
    user = await get_user(request)
    query = {"user_id": user["user_id"]}
    if favorite is not None:
        query["favorite"] = favorite
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
    items = await db.recipes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items}

@api_router.post("/recipes")
async def create_recipe(body: RecipeCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc["id"] = f"rec_{uuid.uuid4().hex[:12]}"
    doc["user_id"] = user["user_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    await db.recipes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/recipes/{rid}")
async def get_recipe(rid: str, request: Request):
    user = await get_user(request)
    r = await db.recipes.find_one({"id": rid, "user_id": user["user_id"]}, {"_id": 0})
    if not r:
        raise HTTPException(404, "not found")
    return r

@api_router.patch("/recipes/{rid}")
async def update_recipe(rid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None)
    await db.recipes.update_one({"id": rid, "user_id": user["user_id"]}, {"$set": body})
    r = await db.recipes.find_one({"id": rid, "user_id": user["user_id"]}, {"_id": 0})
    return r

@api_router.delete("/recipes/{rid}")
async def delete_recipe(rid: str, request: Request):
    user = await get_user(request)
    await db.recipes.delete_one({"id": rid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Pantry ----------
@api_router.get("/pantry")
async def list_pantry(request: Request, location: Optional[str] = None):
    user = await get_user(request)
    q = {"user_id": user["user_id"]}
    if location:
        q["location"] = location
    items = await db.pantry.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"items": items}

@api_router.post("/pantry")
async def create_pantry(body: PantryItemCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc["id"] = f"pan_{uuid.uuid4().hex[:12]}"
    doc["user_id"] = user["user_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    await db.pantry.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/pantry/{pid}")
async def update_pantry(pid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None)
    await db.pantry.update_one({"id": pid, "user_id": user["user_id"]}, {"$set": body})
    r = await db.pantry.find_one({"id": pid, "user_id": user["user_id"]}, {"_id": 0})
    return r

@api_router.delete("/pantry/{pid}")
async def delete_pantry(pid: str, request: Request):
    user = await get_user(request)
    await db.pantry.delete_one({"id": pid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Shopping list ----------
@api_router.get("/shopping")
async def list_shopping(request: Request):
    user = await get_user(request)
    items = await db.shopping.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"items": items}

@api_router.post("/shopping")
async def create_shopping(body: ShoppingItemCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc["id"] = f"shp_{uuid.uuid4().hex[:12]}"
    doc["user_id"] = user["user_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    await db.shopping.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/shopping/{sid}")
async def update_shopping(sid: str, request: Request, body: Dict[str, Any]):
    user = await get_user(request)
    body.pop("_id", None); body.pop("id", None); body.pop("user_id", None)
    await db.shopping.update_one({"id": sid, "user_id": user["user_id"]}, {"$set": body})
    r = await db.shopping.find_one({"id": sid, "user_id": user["user_id"]}, {"_id": 0})
    return r

@api_router.delete("/shopping/{sid}")
async def delete_shopping(sid: str, request: Request):
    user = await get_user(request)
    await db.shopping.delete_one({"id": sid, "user_id": user["user_id"]})
    return {"ok": True}

@api_router.post("/shopping/clear-checked")
async def clear_checked(request: Request):
    user = await get_user(request)
    res = await db.shopping.delete_many({"user_id": user["user_id"], "checked": True})
    return {"deleted": res.deleted_count}


# ---------- Meal plan ----------
@api_router.get("/meals")
async def list_meals(request: Request, start: Optional[str] = None, end: Optional[str] = None):
    user = await get_user(request)
    q = {"user_id": user["user_id"]}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    items = await db.meals.find(q, {"_id": 0}).sort("date", 1).to_list(1000)
    return {"items": items}

@api_router.post("/meals")
async def create_meal(body: MealCreate, request: Request):
    user = await get_user(request)
    doc = body.model_dump()
    doc["id"] = f"mea_{uuid.uuid4().hex[:12]}"
    doc["user_id"] = user["user_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    await db.meals.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/meals/{mid}")
async def delete_meal(mid: str, request: Request):
    user = await get_user(request)
    await db.meals.delete_one({"id": mid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Chef AI ----------
def _chef_system_prompt():
    return (
        "Sei 'Chef AI', l'assistente italiano di CucinaSmart AI. "
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
        items = await db.pantry.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(200)
        ing_list = [i["name"] for i in items]
    if not ing_list:
        return {"suggestions": [], "message": "La tua dispensa è vuota. Aggiungi qualche ingrediente!"}
    prompt = (
        f"Con questi ingredienti disponibili: {', '.join(ing_list)}. "
        "Proponi 3 ricette semplici in JSON con schema: "
        '[{"title": "..", "time_min": 20, "servings": 2, "ingredients": [{"name":"..","qty":1,"unit":"pz"}], "steps": ["..","..",".."]}]. '
        "Rispondi SOLO con JSON valido, senza testo aggiuntivo."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"cook_{user['user_id']}_{uuid.uuid4().hex[:6]}", system_message=_chef_system_prompt()).with_model("gemini", "gemini-3-flash-preview")
    try:
        text = await chat.send_message(UserMessage(text=prompt))
        text = text if isinstance(text, str) else str(text)
        m = re.search(r"\[.*\]", text, re.DOTALL)
        data = json.loads(m.group(0)) if m else []
    except Exception as e:
        logging.error(f"cook err: {e}")
        data = []
    return {"suggestions": data}

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
@api_router.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    user = await get_user(request)
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        ext = "jpg"
    data = await file.read()
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    ct = file.content_type or f"image/{ext}"
    def _do():
        return put_object(path, data, ct)
    result = await run_in_threadpool(_do)
    await db.uploads.insert_one({"path": result["path"], "user_id": user["user_id"], "created_at": datetime.now(timezone.utc), "content_type": ct})
    # generate short-lived token so web <img> can load via query
    token = uuid.uuid4().hex
    await db.file_tokens.insert_one({"token": token, "path": result["path"], "user_id": user["user_id"], "expires_at": datetime.now(timezone.utc) + timedelta(hours=6)})
    backend_url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")
    url = f"/api/files/{result['path']}?token={token}"
    return {"path": result["path"], "url": url, "token": token}

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
    return {"app": "CucinaSmart AI", "ok": True}


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
        await db.file_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logging.warning(f"index err: {e}")
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logging.warning(f"storage init: {e}")

@app.on_event("shutdown")
async def shutdown():
    client.close()
