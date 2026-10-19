import asyncio
import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from digital import has_access, require_access
from cookbook_pdf import render_cookbook
from lab_content import LAB_MODULES


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Cookbook(Input):
    title: str = Field(min_length=3, max_length=100)
    dedication: str = Field(default='', max_length=1500)
    recipe_ids: list[str] = Field(min_length=1, max_length=50)


class Batch(Input):
    name: str = Field(min_length=2, max_length=120)
    portions: int = Field(ge=1, le=1000, strict=True)
    drawer: str = Field(min_length=1, max_length=50)
    frozen_on: date
    use_by: date
    notes: str = Field(default='', max_length=1000)

    @model_validator(mode='after')
    def dates(self):
        if self.frozen_on > datetime.now(timezone.utc).date() or self.use_by < self.frozen_on:
            raise ValueError('Congelamento non futuro; consumo successivo al congelamento')
        return self


class UsePortions(Input):
    portions: int = Field(ge=1, le=1000, strict=True)


class LabEntry(Input):
    notes: str = Field(min_length=5, max_length=3000)
    completed_steps: list[int] = Field(default_factory=list, max_length=6)


def request_key(request):
    key = request.headers.get('Idempotency-Key', '')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{16,100}', key):
        raise HTTPException(422, 'Identificativo operazione mancante')
    return key


def make_kitchen_products_router(db, get_user, scope, owned, store_upload):
    router = APIRouter(prefix='/api')

    def export_view(job):
        return {k: job.get(k) for k in ['id', 'title', 'status', 'recipe_count', 'created_at', 'error']} | {
            'url': job.get('url') if job.get('status') == 'ready' else None}

    async def finish_export(job, user):
        now = datetime.now(timezone.utc)
        claimed = await db.cookbook_exports.find_one_and_update({'id': job['id'], 'user_id': user['user_id'], '$or': [
            {'status': {'$in': ['queued', 'failed']}}, {'status': 'building', 'lease': {'$lt': now.isoformat()}}]},
            {'$set': {'status': 'building', 'lease': (now + timedelta(minutes=5)).isoformat(), 'error': None}},
            projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if not claimed:
            if job['status'] == 'ready':
                return export_view(job)
            raise HTTPException(409, 'Esportazione già in corso. Attendi o aggiorna la raccolta PDF.')
        try:
            credit = await db.digital_purchases.find_one({'id': claimed.get('credit_id'), 'user_id': user['user_id'],
                'refunded': {'$ne': True}, 'export_id': job['id']}, {'_id': 0}) if claimed.get('credit_id') else None
            if not credit and claimed.get('credit_id'):
                raise HTTPException(402, 'Credito rimborsato o revocato: esportazione non disponibile')
            if not credit:
                credit = await db.digital_purchases.find_one_and_update({'user_id': user['user_id'], 'item_key': 'cookbook',
                    'granted': True, 'refunded': {'$ne': True}, 'credit_state': 'available'},
                    {'$set': {'credit_state': 'reserved', 'export_id': job['id']}}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
                if not credit:
                    raise HTTPException(402, 'Serve un credito Ricettario acquistato e verificato')
                await db.cookbook_exports.update_one({'id': job['id']}, {'$set': {'credit_id': credit['id']}})
            if not claimed.get('url'):
                content = await asyncio.to_thread(render_cookbook, claimed['title'], claimed['dedication'], claimed['recipes'])
                uploaded = await store_upload(user, content, 'pdf', 'application/pdf')
                await db.cookbook_exports.update_one({'id': job['id']}, {'$set': {'url': uploaded['url'], 'path': uploaded['path']}})
            used = await db.digital_purchases.update_one({'id': credit['id'], 'export_id': job['id'],
                'refunded': {'$ne': True}, 'credit_state': {'$in': ['reserved', 'consumed']}}, {'$set': {'credit_state': 'consumed'}})
            if not used.matched_count:
                raise HTTPException(402, 'Credito revocato durante l’esportazione')
            await db.cookbook_exports.update_one({'id': job['id']}, {'$set': {'status': 'ready'}, '$unset': {'lease': ''}})
            return export_view(await db.cookbook_exports.find_one({'id': job['id']}, {'_id': 0}))
        except Exception as exc:
            await db.cookbook_exports.update_one({'id': job['id']}, {'$set': {'status': 'failed',
                'error': exc.detail if isinstance(exc, HTTPException) else 'Preparazione PDF non riuscita. Riprova: il credito riservato non viene speso due volte.'}, '$unset': {'lease': ''}})
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(502, 'Preparazione PDF non riuscita, riprova dalla raccolta esportazioni')

    @router.get('/cookbook/exports')
    async def exports(request: Request):
        user = await get_user(request)
        jobs = await db.cookbook_exports.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
        out = []
        for job in jobs:
            if job.get('credit_id') and await db.digital_purchases.find_one({'id': job['credit_id'], 'refunded': True}, {'_id': 0, 'id': 1}):
                job['status'], job['url'] = 'revoked', None
            out.append(export_view(job))
        return {'items': out}

    @router.post('/cookbook/exports')
    async def create_export(body: Cookbook, request: Request):
        user = await get_user(request)
        key = request_key(request)
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        existing = await db.cookbook_exports.find_one({'_id': f"{user['user_id']}:{key}"}, {'_id': 0})
        if existing:
            if existing['digest'] != digest:
                raise HTTPException(409, 'Richiesta già usata con un altro ricettario')
            return await finish_export(existing, user)
        if len(set(body.recipe_ids)) != len(body.recipe_ids):
            raise HTTPException(422, 'Seleziona ogni ricetta una sola volta')
        recipes = await db.recipes.find({**scope(user), 'id': {'$in': body.recipe_ids}}, {'_id': 0,
            'id': 1, 'title': 1, 'description': 1, 'ingredients': 1, 'steps': 1, 'notes': 1, 'servings': 1, 'time_min': 1}).to_list(50)
        if len(recipes) != len(body.recipe_ids):
            raise HTTPException(404, 'Una o più ricette non sono più disponibili nella tua famiglia')
        recipes.sort(key=lambda x: body.recipe_ids.index(x['id']))
        if len(str(recipes)) > 250000:
            raise HTTPException(413, 'Ricettario troppo lungo: seleziona meno ricette')
        job = {'id': f'pdf_{uuid4().hex[:16]}', 'user_id': user['user_id'], 'title': body.title, 'dedication': body.dedication,
            'recipes': recipes, 'recipe_count': len(recipes), 'status': 'queued', 'digest': digest, 'created_at': datetime.now(timezone.utc).isoformat()}
        try:
            await db.cookbook_exports.insert_one({'_id': f"{user['user_id']}:{key}", **job})
        except DuplicateKeyError:
            raise HTTPException(409, 'Richiesta già in elaborazione')
        return await finish_export(job, user)

    @router.post('/cookbook/exports/{eid}/retry')
    async def retry_export(eid: str, request: Request):
        user = await get_user(request)
        job = await db.cookbook_exports.find_one({'id': eid, 'user_id': user['user_id']}, {'_id': 0})
        if not job:
            raise HTTPException(404, 'Ricettario non trovato')
        return await finish_export(job, user)

    @router.get('/freezer/batches')
    async def freezer(request: Request):
        user = await get_user(request)
        await require_access(db, user['user_id'], 'freezer')
        items = await db.pantry.find({**scope(user), 'location': 'freezer', 'qty': {'$gt': 0}}, {'_id': 0}).sort('expires_at', 1).to_list(500)
        history = await db.freezer_operations.find({'user_id': user['user_id'], 'status': 'done'}, {'_id': 0}).sort('created_at', -1).to_list(40)
        return {'items': items, 'history': history}

    @router.post('/freezer/batches')
    async def new_batch(body: Batch, request: Request):
        user = await get_user(request)
        await require_access(db, user['user_id'], 'freezer')
        doc = {'id': f'pan_{uuid4().hex[:12]}', 'name': body.name, 'qty': body.portions, 'unit': 'porzioni', 'location': 'freezer',
            'kind': 'food', 'expires_at': body.use_by.isoformat(), 'price': None, 'created_at': datetime.now(timezone.utc),
            'freezer': {'frozen_on': body.frozen_on.isoformat(), 'drawer': body.drawer, 'notes': body.notes}, **owned(user)}
        await db.pantry.insert_one(doc)
        doc.pop('_id', None)
        return doc

    @router.put('/freezer/batches/{bid}')
    async def edit_batch(bid: str, body: Batch, request: Request):
        user = await get_user(request)
        await require_access(db, user['user_id'], 'freezer')
        result = await db.pantry.update_one({**scope(user), 'id': bid, 'location': 'freezer'}, {'$set': {'name': body.name,
            'qty': body.portions, 'unit': 'porzioni', 'expires_at': body.use_by.isoformat(), 'freezer': {
                'frozen_on': body.frozen_on.isoformat(), 'drawer': body.drawer, 'notes': body.notes}}})
        if not result.matched_count:
            raise HTTPException(404, 'Lotto non trovato')
        return {'ok': True}

    @router.post('/freezer/batches/{bid}/use')
    async def use_batch(bid: str, body: UsePortions, request: Request):
        user = await get_user(request)
        await require_access(db, user['user_id'], 'freezer')
        key = f"{user['user_id']}:{request_key(request)}"
        old = await db.freezer_operations.find_one({'_id': key}, {'_id': 0})
        if old:
            if old['batch_id'] != bid or old['portions'] != body.portions:
                raise HTTPException(409, 'Operazione già usata per un prelievo diverso')
            if old['status'] == 'done':
                return old
            raise HTTPException(409, 'Prelievo da verificare: controlla la quantità prima di riprovare')
        await db.freezer_operations.insert_one({'_id': key, 'user_id': user['user_id'], 'batch_id': bid,
            'portions': body.portions, 'status': 'processing', 'created_at': datetime.now(timezone.utc).isoformat()})
        batch = await db.pantry.find_one_and_update({**scope(user), 'id': bid, 'location': 'freezer', 'unit': 'porzioni', 'qty': {'$gte': body.portions}},
            {'$inc': {'qty': -body.portions}}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if not batch:
            await db.freezer_operations.delete_one({'_id': key, 'status': 'processing'})
            raise HTTPException(409, 'Porzioni insufficienti. Per vecchi articoli con altre unità, modifica prima il lotto.')
        await db.freezer_operations.update_one({'_id': key}, {'$set': {'status': 'done', 'name': batch['name'], 'remaining': batch['qty']}})
        return {'ok': True, 'remaining': batch['qty']}

    @router.get('/lab/modules')
    async def modules(request: Request):
        user = await get_user(request)
        items = []
        for m in LAB_MODULES:
            unlocked = await has_access(db, user['user_id'], f"lab:{m['id']}")
            items.append({k: v for k, v in m.items() if k not in ['steps', 'experiment']} | {'unlocked': unlocked, 'step_count': len(m['steps'])})
        return {'items': items}

    @router.get('/lab/modules/{mid}')
    async def module(mid: str, request: Request):
        user = await get_user(request)
        m = next((m for m in LAB_MODULES if m['id'] == mid), None)
        if not m:
            raise HTTPException(404, 'Modulo non trovato')
        unlocked = await has_access(db, user['user_id'], f'lab:{mid}')
        entry = await db.lab_journal.find_one({'_id': f"{user['user_id']}:{mid}"}, {'_id': 0})
        return {**m, 'steps': m['steps'] if unlocked else m['steps'][:1], 'experiment': m['experiment'] if unlocked else None,
            'unlocked': unlocked, 'step_count': len(m['steps']), 'journal': entry if unlocked else None}

    @router.put('/lab/modules/{mid}/journal')
    async def save_journal(mid: str, body: LabEntry, request: Request):
        user = await get_user(request)
        await require_access(db, user['user_id'], f'lab:{mid}')
        m = next((m for m in LAB_MODULES if m['id'] == mid), None)
        if not m or any(i < 0 or i >= len(m['steps']) for i in body.completed_steps):
            raise HTTPException(422, 'Passaggi del modulo non validi')
        await db.lab_journal.update_one({'_id': f"{user['user_id']}:{mid}"}, {'$set': {'user_id': user['user_id'], 'module_id': mid,
            'notes': body.notes, 'completed_steps': sorted(set(body.completed_steps)), 'updated_at': datetime.now(timezone.utc).isoformat()}}, upsert=True)
        return {'ok': True}

    return router