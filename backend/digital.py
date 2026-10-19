"""Server-verified non-subscription purchases, independent of the Coach offering."""
import hashlib
import hmac
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError
from pymongo import ReturnDocument
from dotenv import load_dotenv
from lab_content import LAB_MODULES

load_dotenv()


def now():
    return datetime.now(timezone.utc).isoformat()


def digital_ready():
    return len(os.getenv('REVENUECAT_WEBHOOK_AUTH', '')) >= 24


async def has_access(db, uid, item):
    return bool(await db.digital_purchases.find_one({'user_id': uid, 'item_key': item, 'granted': True,
        'refunded': {'$ne': True}, 'kind': {'$ne': 'consumable'}}, {'_id': 0, 'id': 1}))


async def require_access(db, uid, item):
    if not await has_access(db, uid, item):
        raise HTTPException(402, 'Acquisto verificato richiesto per questa funzione')


async def catalog_items(db):
    items = [{'key': 'cookbook', 'title': 'Ricettario di famiglia', 'kind': 'consumable', 'price_cents': 499},
             {'key': 'freezer', 'title': 'Freezer Manager Pro', 'kind': 'permanent', 'price_cents': 599}]
    items += [{'key': f"lab:{m['id']}", 'title': m['title'], 'kind': 'permanent', 'price_cents': m['price_cents']} for m in LAB_MODULES]
    courses = await db.courses.find({'status': 'published'}, {'_id': 0, 'id': 1, 'title': 1, 'price_cents': 1, 'creator_id': 1}).to_list(500)
    return items + [{'key': f"course:{c['id']}", 'title': c['title'], 'kind': 'course', 'price_cents': c['price_cents'], 'creator_id': c['creator_id']} for c in courses]


class MappingBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    ios_id: str = Field(default='', max_length=200, pattern=r'^[A-Za-z0-9_.:-]*$')
    android_id: str = Field(default='', max_length=200, pattern=r'^[A-Za-z0-9_.:-]*$')
    test_id: str = Field(default='', max_length=200, pattern=r'^[A-Za-z0-9_.:-]*$')
    enabled: bool = False


class SettlementBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    net_receipt_cents: int = Field(gt=0, le=10000000, strict=True)
    reference: str = Field(min_length=8, max_length=200)


def make_digital_router(db, get_user):
    router = APIRouter(prefix='/api/digital')

    async def admin(request):
        user = await get_user(request)
        email = os.getenv('SHOP_ADMIN_EMAIL', '').strip().lower()
        verified = await db.user_sessions.find_one({'session_token': request.headers.get('Authorization', '')[7:],
            'user_id': user['user_id'], 'verified_email': email, 'identity_verified': True}, {'_id': 0, 'user_id': 1})
        if not email or user.get('email', '').lower() != email or not verified:
            raise HTTPException(403, 'Accesso admin verificato richiesto')
        return user

    @router.get('/catalog')
    async def catalog(request: Request):
        user = await get_user(request)
        items = await catalog_items(db)
        mappings = await db.digital_products.find({}, {'_id': 0}).to_list(1000)
        grants = await db.digital_purchases.find({'user_id': user['user_id'], 'granted': True, 'refunded': {'$ne': True}}, {'_id': 0}).to_list(5000)
        for item in items:
            config = next((m for m in mappings if m['key'] == item['key']), {})
            item['product_ids'] = config.get('product_ids', {})
            item['available'] = bool(digital_ready() and config.get('enabled') and item['product_ids'])
            item['owned'] = item['kind'] != 'consumable' and any(g['item_key'] == item['key'] for g in grants)
        return {'items': items, 'pdf_credits': sum(g.get('credit_state') == 'available' for g in grants if g['item_key'] == 'cookbook'),
            'server_ready': digital_ready(), 'message': None if digital_ready() else 'Acquisti singoli in attivazione: prodotti store e conferme RevenueCat devono essere configurati. Nessun addebito disponibile.'}

    @router.get('/admin')
    async def admin_state(request: Request):
        await admin(request)
        return {'items': await catalog_items(db), 'mappings': await db.digital_products.find({}, {'_id': 0}).to_list(1000),
            'sales': await db.digital_course_sales.find({}, {'_id': 0}).sort('created_at', -1).to_list(300),
            'server_ready': digital_ready(), 'webhook_path': '/api/digital/revenuecat-webhook',
            'sandbox_enabled': os.getenv('REVENUECAT_ACCEPT_SANDBOX') == 'true'}

    @router.put('/admin/products/{item_key}')
    async def map_product(item_key: str, body: MappingBody, request: Request):
        actor = await admin(request)
        item = next((i for i in await catalog_items(db) if i['key'] == item_key), None)
        if not item:
            raise HTTPException(404, 'Prodotto non trovato; per i corsi serve la pubblicazione')
        ids = {k: v for k, v in {'ios': body.ios_id, 'android': body.android_id, 'test': body.test_id}.items() if v}
        if body.enabled and (not digital_ready() or not ids):
            raise HTTPException(409, 'Configura prima i prodotti negli store e il segreto webhook sul server')
        # Each store identifier can refer to only one content item. Uniqueness enforced below.
        old = await db.digital_products.find_one({'_id': item_key}, {'_id': 0})
        if old and old.get('product_ids') != ids and await db.digital_purchases.count_documents({'item_key': item_key}):
            raise HTTPException(409, 'Prodotto già venduto: non cambiare gli identificativi. Disabilitalo o gestisci una nuova versione.')
        reserved = []
        try:
            for platform, pid in ids.items():
                ident = f'{platform}:{pid}'
                found = await db.digital_product_ids.find_one({'_id': ident}, {'_id': 0})
                if found and found['item_key'] != item_key:
                    raise HTTPException(409, 'Identificativo store già associato a un altro prodotto')
                if not found:
                    await db.digital_product_ids.insert_one({'_id': ident, 'item_key': item_key})
                    reserved.append(ident)
            await db.digital_products.update_one({'_id': item_key}, {'$set': item | {'product_ids': ids,
                'enabled': body.enabled, 'updated_by': actor['user_id'], 'updated_at': now()}}, upsert=True)
        except (DuplicateKeyError, HTTPException):
            await db.digital_product_ids.delete_many({'_id': {'$in': reserved}, 'item_key': item_key})
            raise HTTPException(409, 'Identificativo store già associato o aggiornamento concorrente, ricarica')
        await db.digital_product_ids.delete_many({'item_key': item_key, '_id': {'$nin': [f'{p}:{v}' for p, v in ids.items()]}})
        return {'ok': True}

    @router.post('/admin/sales/{sale_id}/settle')
    async def settle(sale_id: str, body: SettlementBody, request: Request):
        actor = await admin(request)
        sale = await db.digital_course_sales.find_one({'id': sale_id}, {'_id': 0})
        purchase = await db.digital_purchases.find_one({'id': sale_id}, {'_id': 0})
        if not sale or not purchase or purchase.get('refunded') or sale.get('status') == 'refunded':
            raise HTTPException(409, 'Vendita non liquidabile')
        if sale['currency'] != 'EUR' or body.net_receipt_cents > sale['gross_cents']:
            raise HTTPException(422, 'Riconciliazione disponibile in EUR e fino all’importo lordo della vendita')
        fee = (body.net_receipt_cents * 10 + 50) // 100
        ledger = {'id': sale_id, 'creator_id': sale['creator_id'], 'course_title': sale['title'],
            'net_receipt_cents': body.net_receipt_cents, 'creator_cents': body.net_receipt_cents - fee, 'app_cents': fee,
            'currency': 'EUR', 'status': 'earned', 'verified': True, 'settlement_reference': body.reference,
            'settled_by': actor['user_id'], 'created_at': now()}
        existing = await db.course_earnings.find_one({'_id': sale_id}, {'_id': 0})
        if existing and (existing['net_receipt_cents'] != body.net_receipt_cents or existing.get('settlement_reference') != body.reference):
            raise HTTPException(409, 'Vendita già riconciliata con dati diversi')
        await db.course_earnings.update_one({'_id': sale_id}, {'$setOnInsert': ledger}, upsert=True)
        fresh = await db.digital_purchases.find_one({'id': sale_id}, {'_id': 0})
        if fresh.get('refunded'):
            await db.course_earnings.update_one({'_id': sale_id, 'status': 'earned'}, {'$set': {'status': 'reversed'}})
            raise HTTPException(409, 'Vendita rimborsata durante la riconciliazione')
        await db.digital_course_sales.update_one({'id': sale_id, 'status': {'$ne': 'refunded'}}, {'$set': {'status': 'settled', 'net_receipt_cents': body.net_receipt_cents}})
        return {'ok': True}

    @router.post('/revenuecat-webhook')
    async def webhook(request: Request):
        expected = os.getenv('REVENUECAT_WEBHOOK_AUTH', '')
        if not digital_ready():
            raise HTTPException(503, 'Conferme acquisti non configurate')
        if not hmac.compare_digest(request.headers.get('Authorization', ''), expected):
            raise HTTPException(401, 'Webhook non autorizzato')
        raw = await request.body()
        if len(raw) > 262144:
            raise HTTPException(413, 'Evento troppo grande')
        try:
            event = (await request.json())['event']
            if not all(isinstance(event.get(k), str) and event[k] for k in ['id', 'type', 'app_user_id']):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise HTTPException(400, 'Evento non valido')
        sandbox = event.get('environment') == 'SANDBOX'
        if sandbox and os.getenv('REVENUECAT_ACCEPT_SANDBOX') != 'true':
            return {'ignored': 'sandbox_disabled'}
        if event.get('environment') not in ['SANDBOX', 'PRODUCTION']:
            raise HTTPException(400, 'Ambiente evento mancante')
        if event['type'] not in ['NON_RENEWING_PURCHASE', 'CANCELLATION', 'REFUND_REVERSED']:
            return {'ignored': 'unrelated_event'}
        store = {'APP_STORE': 'ios', 'PLAY_STORE': 'android', 'TEST_STORE': 'test'}.get(event.get('store'))
        if not store or not event.get('transaction_id') or not event.get('product_id'):
            raise HTTPException(400, 'Transazione non valida')
        if store == 'test' and not sandbox:
            raise HTTPException(400, 'Test Store non valido per produzione')
        mapping = await db.digital_products.find_one({f'product_ids.{store}': event['product_id']}, {'_id': 0})
        if not mapping:
            return {'ignored': 'unmapped_product'}
        user = await db.users.find_one({'user_id': event['app_user_id']}, {'_id': 0, 'user_id': 1})
        if not user or event['app_user_id'].startswith('$RCAnonymousID'):
            raise HTTPException(409, 'Acquisto non associato a un account applicativo valido')
        tx = hashlib.sha256(f"{event.get('store')}:{event['transaction_id']}".encode()).hexdigest()
        try:
            await db.digital_events.insert_one({'_id': event['id'], 'status': 'new', 'received_at': now()})
        except DuplicateKeyError:
            pass
        done = await db.digital_events.find_one({'_id': event['id']}, {'_id': 0})
        if done.get('status') == 'done':
            return {'received': True}
        claimed = await db.digital_events.find_one_and_update({'_id': event['id'], '$or': [{'status': {'$in': ['new', 'failed']}},
            {'lease': {'$lt': now()}}]}, {'$set': {'status': 'processing', 'lease': (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat()}}, projection={'_id': 0})
        if not claimed:
            raise HTTPException(409, 'Evento in elaborazione, riprova')
        try:
            base = {'id': tx, 'user_id': user['user_id'], 'item_key': mapping['key'], 'kind': mapping['kind'],
                'transaction_id': event['transaction_id'], 'store': event['store'], 'environment': event['environment'], 'created_at': now()}
            if event['type'] == 'CANCELLATION':
                await db.digital_purchases.update_one({'_id': tx}, {'$set': {'refunded': True, 'refunded_at': now()}, '$setOnInsert': base}, upsert=True)
                await db.digital_course_sales.update_one({'id': tx}, {'$set': {'status': 'refunded'}})
                await db.course_earnings.update_one({'id': tx, 'status': 'earned'}, {'$set': {'status': 'reversed'}})
                await db.course_earnings.update_one({'id': tx, 'status': 'paid'}, {'$set': {'status': 'recovery_due'}})
                exports = await db.cookbook_exports.find({'credit_id': tx}, {'_id': 0, 'path': 1}).to_list(10)
                for export in exports:
                    if export.get('path'):
                        await db.file_tokens.delete_many({'path': export['path']})
            elif event['type'] == 'REFUND_REVERSED':
                # No blind restoration of consumed credits or accounting; administrator review.
                await db.digital_purchases.update_one({'_id': tx}, {'$set': {'refund_reversal_review': True, 'reversal_event': event['id']}, '$setOnInsert': base}, upsert=True)
            else:
                await db.digital_purchases.update_one({'_id': tx}, {'$setOnInsert': base}, upsert=True)
                existing = await db.digital_purchases.find_one({'_id': tx}, {'_id': 0})
                if existing['user_id'] != user['user_id'] or existing['item_key'] != mapping['key']:
                    raise HTTPException(409, 'Transazione già associata a un altro account/prodotto')
                if not existing.get('refunded') and not existing.get('refund_reversal_review'):
                    await db.digital_purchases.update_one({'_id': tx, 'refunded': {'$ne': True}, 'granted': {'$ne': True}},
                        {'$set': {'granted': True, 'credit_state': 'available' if mapping['kind'] == 'consumable' else None}})
                    if mapping['kind'] == 'course':
                        try:
                            gross = int((Decimal(str(event.get('price_in_purchased_currency'))) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
                        except (InvalidOperation, TypeError, ValueError):
                            raise HTTPException(422, 'Importo verificato della vendita mancante')
                        if gross <= 0:
                            raise HTTPException(422, 'Importo vendita non valido')
                        await db.digital_course_sales.update_one({'_id': tx}, {'$setOnInsert': {'id': tx,
                            'creator_id': mapping['creator_id'], 'title': mapping['title'], 'course_id': mapping['key'].split(':', 1)[1],
                            'gross_cents': gross, 'currency': event.get('currency'), 'status': 'awaiting_settlement', 'created_at': now()}}, upsert=True)
            await db.digital_events.update_one({'_id': event['id']}, {'$set': {'status': 'done'}})
        except Exception:
            await db.digital_events.update_one({'_id': event['id']}, {'$set': {'status': 'failed'}})
            raise
        return {'received': True}

    return router