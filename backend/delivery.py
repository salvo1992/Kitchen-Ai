"""Delivery Chef marketplace: private bookings, approved providers, real payment states."""
import asyncio
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo
import stripe
from fastapi import APIRouter, HTTPException, Request, Query
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, BulkWriteError
from delivery_models import (CATEGORIES, CitySearch, ProviderInput, ServiceInput, SlotInput,
    BookingInput, QuoteInput, ReasonInput, ReviewInput, ReplyInput, Moderation, Resolution)
from delivery_geo import city_search, get_city, distance_km
from delivery_payments import (utcnow, payment_config, onboarding, refresh_account, checkout, stripe_call,
    reconcile_checkout, release_slot, refund_booking, claim_money, unlock, payment_worker)


def event_time(day, clock):
    local = datetime.combine(day, datetime.strptime(clock, '%H:%M').time(), ZoneInfo('Europe/Rome'))
    utc = local.astimezone(timezone.utc)
    if utc.astimezone(ZoneInfo('Europe/Rome')).replace(tzinfo=None) != local.replace(tzinfo=None):
        raise HTTPException(422, 'Orario non valido per il cambio dell’ora')
    if utc < utcnow() + timedelta(hours=2) or utc > utcnow() + timedelta(days=366):
        raise HTTPException(422, 'Scegli una data tra due ore e un anno da oggi (ora italiana)')
    return utc


def split_amount(amount):
    commission = (amount * 1000 + 5000) // 10000
    return {'amount_cents': amount, 'commission_cents': commission, 'provider_cents': amount - commission}


def order_view(doc, user_id, is_admin=False):
    hidden = {'_id', 'money_lock', 'money_lock_until', 'payload_hash', 'request_key', 'provider_stripe_account_id'}
    if user_id == doc['customer_id'] and not is_admin:
        hidden |= {'commission_cents', 'provider_cents', 'transfer_error'}
    return {k: v for k, v in doc.items() if k not in hidden}


def make_delivery_router(db, get_user):
    router = APIRouter(prefix='/api/delivery')

    async def admin_flag(request, user):
        email = os.getenv('SHOP_ADMIN_EMAIL', '').strip().lower()
        session = await db.user_sessions.find_one({'session_token': request.headers.get('Authorization', '')[7:],
            'user_id': user['user_id'], 'identity_verified': True, 'verified_email': email}, {'_id': 0, 'user_id': 1})
        return bool(email and session and user.get('email', '').lower() == email)

    async def admin(request):
        user = await get_user(request)
        if not await admin_flag(request, user):
            raise HTTPException(403, 'Accesso admin riservato all’account Google verificato del titolare')
        return user

    async def own_provider(request):
        user = await get_user(request)
        provider = await db.delivery_providers.find_one({'user_id': user['user_id']}, {'_id': 0})
        if not provider:
            raise HTTPException(404, 'Crea prima la tua scheda professionista')
        return user, provider

    async def get_order(bid, request):
        user = await get_user(request)
        booking = await db.delivery_bookings.find_one({'id': bid}, {'_id': 0})
        is_admin = await admin_flag(request, user)
        if not booking or (user['user_id'] not in [booking['customer_id'], booking['provider_user_id']] and not is_admin):
            raise HTTPException(404, 'Prenotazione non trovata')
        return user, booking, is_admin

    async def rating(pid):
        rows = await db.delivery_reviews.aggregate([{'$match': {'provider_id': pid, 'hidden': {'$ne': True}}},
            {'$group': {'_id': None, 'average': {'$avg': '$rating'}, 'count': {'$sum': 1}}}, {'$project': {'_id': 0}}]).to_list(1)
        return {'rating': round(rows[0]['average'], 1) if rows else None, 'review_count': rows[0]['count'] if rows else 0}

    async def public_profile(provider):
        public = {k: provider.get(k) for k in ['id', 'display_name', 'kind', 'bio', 'city', 'radius_km', 'specialties', 'photo_url']}
        return public | await rating(provider['id']) | {'payments_ready': bool(payment_config()['configured'] and provider.get('connect_ready'))}

    @router.get('/config')
    async def config(request: Request):
        await get_user(request)
        return {'categories': CATEGORIES, 'commission_percent': 10, 'payments': payment_config(),
            'policy_version': 'delivery-v1', 'policy': 'Pagamento in piattaforma. Rimborso integrale prima dell’inizio; dopo l’inizio puoi segnalare un problema. Accredito 90% al saldo Stripe del professionista dopo il servizio e almeno 24 ore per eventuali segnalazioni. In assenza di conferma cliente: 48 ore dalla dichiarazione di servizio svolto. Tempi bancari secondo Stripe.',
            'coverage_note': 'Copertura indicativa calcolata tra i centri dei comuni. Il professionista verifica l’indirizzo esatto.',
            'attribution': 'Dati © OpenStreetMap contributors · ODbL'}

    @router.post('/cities')
    async def cities(body: CitySearch, request: Request):
        await get_user(request)
        return {'items': await city_search(db, body.query)}

    @router.get('/providers')
    async def providers(request: Request, city_id: str | None = None, category: str | None = None,
                        q: str = Query(default='', max_length=100), instant: bool = False):
        await get_user(request)
        city = await get_city(db, city_id) if city_id else None
        service_query = {'enabled': True}
        if category:
            service_query['category'] = category
        if instant:
            service_query['booking_mode'] = {'$in': ['instant', 'both']}
        services = await db.delivery_services.find(service_query, {'_id': 0}).to_list(2000)
        docs = await db.delivery_providers.find({'status': 'approved', 'id': {'$in': list({s['provider_id'] for s in services})}}, {'_id': 0}).to_list(500)
        items = []
        for p in docs:
            dist = distance_km(p['city'], city) if city else None
            if dist is not None and dist > p['radius_km']:
                continue
            own = [s for s in services if s['provider_id'] == p['id']]
            hay = ' '.join([p['display_name'], p['bio'], *p['specialties'], *[s['title'] for s in own]]).casefold()
            if q.strip().casefold() not in hay:
                continue
            item = await public_profile(p)
            cheapest = min(own, key=lambda x: x['price_cents'])
            items.append(item | {'from_cents': cheapest['price_cents'], 'pricing': cheapest['pricing'],
                'categories': list({s['category'] for s in own}), 'distance_km': round(dist, 1) if dist is not None else None})
        items.sort(key=lambda p: (p['distance_km'] or 0, -(p['rating'] or 0), p['display_name']))
        return {'items': items, 'payments': payment_config()}

    @router.get('/providers/{pid}')
    async def profile(pid: str, request: Request):
        user = await get_user(request)
        p = await db.delivery_providers.find_one({'id': pid}, {'_id': 0})
        if not p or (p['status'] != 'approved' and p['user_id'] != user['user_id'] and not await admin_flag(request, user)):
            raise HTTPException(404, 'Professionista non disponibile')
        services = await db.delivery_services.find({'provider_id': pid, 'enabled': True}, {'_id': 0}).to_list(100)
        slots = await db.delivery_slots.find({'provider_id': pid, 'start_at': {'$gt': (utcnow() + timedelta(hours=2)).isoformat()}, 'booking_id': None},
            {'_id': 0, 'booking_id': 0}).sort('start_at', 1).to_list(100)
        reviews = await db.delivery_reviews.find({'provider_id': pid, 'hidden': {'$ne': True}}, {'_id': 0, 'customer_id': 0}).sort('created_at', -1).to_list(100)
        return await public_profile(p) | {'services': services, 'slots': slots, 'reviews': reviews, 'status': p['status']}

    @router.get('/provider')
    async def my_provider(request: Request):
        user = await get_user(request)
        p = await db.delivery_providers.find_one({'user_id': user['user_id']}, {'_id': 0})
        if not p:
            return {'provider': None, 'payments': payment_config()}
        services = await db.delivery_services.find({'provider_id': p['id']}, {'_id': 0}).to_list(100)
        slots = await db.delivery_slots.find({'provider_id': p['id'], 'end_at': {'$gt': utcnow().isoformat()}}, {'_id': 0}).sort('start_at', 1).to_list(200)
        reviews = await db.delivery_reviews.find({'provider_id': p['id'], 'hidden': {'$ne': True}}, {'_id': 0, 'customer_id': 0}).to_list(100)
        money_rows = await db.delivery_bookings.aggregate([{'$match': {'provider_id': p['id'], 'paid_at': {'$exists': True}}},
            {'$group': {'_id': '$status', 'gross': {'$sum': '$amount_cents'}, 'net': {'$sum': '$provider_cents'}, 'fee': {'$sum': '$commission_cents'}, 'count': {'$sum': 1}}},
            {'$project': {'_id': 0, 'status': '$_id', 'gross': 1, 'net': 1, 'fee': 1, 'count': 1}}]).to_list(30)
        months = await db.delivery_bookings.aggregate([{'$match': {'provider_id': p['id'], 'paid_at': {'$exists': True}, 'status': {'$nin': ['refunded', 'refund_pending']}}},
            {'$group': {'_id': {'$substr': ['$paid_at', 0, 7]}, 'gross': {'$sum': '$amount_cents'}}},
            {'$sort': {'_id': -1}}, {'$limit': 6}, {'$project': {'_id': 0, 'month': '$_id', 'gross': 1}}]).to_list(6)
        payouts = await db.delivery_payouts.find({'provider_id': p['id']}, {'_id': 0}).sort('created_at', -1).to_list(30)
        return {'provider': p, 'services': services, 'slots': slots, 'reviews': reviews, 'totals': money_rows,
                'months': list(reversed(months)), 'payouts': payouts, 'payments': payment_config()}

    @router.put('/provider')
    async def save_provider(body: ProviderInput, request: Request):
        user = await get_user(request)
        city = await get_city(db, body.city_id)
        if body.photo_url:
            parts = urlsplit(body.photo_url)
            if parts.scheme or parts.netloc or not parts.path.startswith('/api/files/'):
                raise HTTPException(422, 'Carica la foto tramite l’app')
            path = unquote(parts.path.removeprefix('/api/files/'))
            if not await db.uploads.find_one({'path': path, 'user_id': user['user_id']}, {'_id': 0, 'path': 1}):
                raise HTTPException(403, 'La foto non appartiene al tuo account')
        old = await db.delivery_providers.find_one({'user_id': user['user_id']}, {'_id': 0})
        if old and old.get('status') == 'suspended':
            raise HTTPException(403, 'Profilo sospeso: contatta l’amministratore')
        doc = body.model_dump(exclude={'city_id', 'accepts_terms'}) | {'city': city, 'status': 'pending',
            'terms_version': 'delivery-v1', 'terms_accepted_at': utcnow().isoformat(), 'updated_at': utcnow().isoformat()}
        await db.delivery_providers.update_one({'_id': user['user_id']}, {'$set': doc, '$setOnInsert': {
            'id': f"dc_{user['user_id']}", 'user_id': user['user_id'], 'created_at': utcnow().isoformat()}}, upsert=True)
        return {'ok': True, 'status': 'pending'}

    @router.post('/provider/onboarding')
    async def onboard(request: Request):
        user, p = await own_provider(request)
        if p['status'] != 'approved':
            raise HTTPException(409, 'Attendi prima l’approvazione della scheda professionista')
        return await onboarding(db, p, user)

    @router.post('/provider/connect-status')
    async def connect_status(request: Request):
        _, p = await own_provider(request)
        updated = await refresh_account(db, p)
        return {'ready': updated.get('connect_ready', False), 'requirements': updated.get('connect_due', []), 'payments': payment_config()}

    @router.post('/provider/services')
    async def create_service(body: ServiceInput, request: Request):
        _, p = await own_provider(request)
        doc = body.model_dump() | {'id': f'ds_{uuid4().hex[:16]}', 'provider_id': p['id']}
        if await db.delivery_services.count_documents({'provider_id': p['id']}) >= 50:
            raise HTTPException(409, 'Puoi pubblicare fino a 50 servizi')
        await db.delivery_services.insert_one(doc)
        doc.pop('_id', None)
        return doc

    @router.put('/provider/services/{sid}')
    async def update_service(sid: str, body: ServiceInput, request: Request):
        _, p = await own_provider(request)
        result = await db.delivery_services.update_one({'id': sid, 'provider_id': p['id']}, {'$set': body.model_dump()})
        if not result.matched_count:
            raise HTTPException(404, 'Servizio non trovato')
        return {'ok': True}

    @router.post('/provider/slots')
    async def create_slot(body: SlotInput, request: Request):
        _, p = await own_provider(request)
        start = event_time(body.date, body.time)
        end = start + timedelta(hours=body.duration_hours)
        sid = f'slot_{uuid4().hex[:16]}'
        # Exclusive half-hour buckets prevent overlap even for concurrent requests.
        buckets = [{'_id': f"{p['id']}:{tick}", 'slot_id': sid} for tick in range(int(start.timestamp()), int(end.timestamp()), 1800)]
        try:
            await db.delivery_slot_locks.insert_many(buckets, ordered=True)
            await db.delivery_slots.insert_one({'id': sid, 'provider_id': p['id'], 'start_at': start.isoformat(),
                'end_at': end.isoformat(), 'duration_hours': body.duration_hours, 'booking_id': None})
        except BulkWriteError as exc:
            await db.delivery_slot_locks.delete_many({'slot_id': sid})
            if any(e.get('code') == 11000 for e in exc.details.get('writeErrors', [])):
                raise HTTPException(409, 'La disponibilità si sovrappone a un altro appuntamento o intervallo')
            raise
        except DuplicateKeyError:
            await db.delivery_slot_locks.delete_many({'slot_id': sid})
            raise HTTPException(409, 'La disponibilità si sovrappone a un altro appuntamento o intervallo')
        except Exception:
            await db.delivery_slot_locks.delete_many({'slot_id': sid})
            raise
        return {'id': sid}

    @router.delete('/provider/slots/{sid}')
    async def remove_slot(sid: str, request: Request):
        _, p = await own_provider(request)
        result = await db.delivery_slots.delete_one({'id': sid, 'provider_id': p['id'], 'booking_id': None})
        if not result.deleted_count:
            raise HTTPException(409, 'Disponibilità già prenotata o non tua')
        await db.delivery_slot_locks.delete_many({'slot_id': sid})
        return {'ok': True}

    @router.post('/bookings')
    async def create_booking(body: BookingInput, request: Request):
        user = await get_user(request)
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{16,100}', key):
            raise HTTPException(422, 'Identificativo richiesta mancante, riapri la prenotazione')
        payload_hash = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        prior = await db.delivery_bookings.find_one({'_id': f"{user['user_id']}:{key}"}, {'_id': 0})
        if prior:
            if not hmac.compare_digest(prior['payload_hash'], payload_hash):
                raise HTTPException(409, 'Identificativo già usato per una richiesta diversa')
            return order_view(prior, user['user_id'])
        if not body.accepts_terms:
            raise HTTPException(422, 'Accetta le condizioni prima di prenotare')
        service = await db.delivery_services.find_one({'id': body.service_id, 'enabled': True}, {'_id': 0})
        p = await db.delivery_providers.find_one({'id': service['provider_id'], 'status': 'approved'}, {'_id': 0}) if service else None
        if not p or not service:
            raise HTTPException(404, 'Servizio non disponibile')
        if p['user_id'] == user['user_id']:
            raise HTTPException(422, 'Non puoi prenotare un tuo servizio')
        if service['booking_mode'] not in [body.mode, 'both']:
            raise HTTPException(422, 'Modalità di prenotazione non disponibile')
        if not service['min_guests'] <= body.guests <= service['max_guests']:
            raise HTTPException(422, 'Numero di ospiti fuori dai limiti del servizio')
        city = await get_city(db, body.city_id)
        if distance_km(p['city'], city) > p['radius_km']:
            raise HTTPException(422, 'Il comune è fuori dal raggio del professionista')
        start = event_time(body.date, body.time)
        end = start + timedelta(hours=service['duration_hours'])
        if body.mode == 'instant':
            if not payment_config()['configured'] or not p.get('connect_ready'):
                raise HTTPException(409, 'Prenotazione immediata non attiva finché i pagamenti non sono abilitati')
            slot = await db.delivery_slots.find_one({'id': body.slot_id, 'provider_id': p['id'], 'booking_id': None,
                'start_at': start.isoformat(), 'duration_hours': {'$gte': service['duration_hours']}}, {'_id': 0})
            if not slot:
                raise HTTPException(409, 'Scegli un orario disponibile')
            end = datetime.fromisoformat(slot['end_at'])
        amount = service['price_cents'] * (body.guests if service['pricing'] == 'person' else 1)
        if amount > 2000000:
            raise HTTPException(422, 'Importo troppo elevato per questa prenotazione')
        now = utcnow().isoformat()
        status = 'quoted' if body.mode == 'instant' else 'requested'
        doc = {'_id': f"{user['user_id']}:{key}", 'id': f'booking_{uuid4().hex[:16]}', 'customer_id': user['user_id'],
            'customer_name': user.get('name') or 'Cliente', 'provider_id': p['id'], 'provider_user_id': p['user_id'],
            'provider_name': p['display_name'], 'service_id': service['id'], 'service_title': service['title'],
            'mode': body.mode, 'guests': body.guests, 'city': city, 'address': body.address, 'phone': body.phone,
            'notes': body.notes, 'included': service['included'], 'start_at': start.isoformat(), 'end_at': end.isoformat(),
            'requested_start_at': start.isoformat(), 'duration_hours': service['duration_hours'], 'slot_id': body.slot_id if body.mode == 'instant' else None,
            'status': status, 'created_at': now, 'currency': 'EUR', 'policy_version': 'delivery-v1', 'accepted_terms_at': now,
            'payload_hash': payload_hash, 'timeline': [{'status': status, 'at': now}], **split_amount(amount)}
        if body.mode == 'instant':
            doc['quote_expires_at'] = (utcnow() + timedelta(hours=24)).isoformat()
        try:
            await db.delivery_bookings.insert_one(doc)
        except DuplicateKeyError:
            doc = await db.delivery_bookings.find_one({'_id': f"{user['user_id']}:{key}"}, {'_id': 0})
            if doc['payload_hash'] != payload_hash:
                raise HTTPException(409, 'Richiesta duplicata con dati diversi')
        return order_view(doc, user['user_id'])

    @router.get('/bookings')
    async def bookings(request: Request, provider: bool = False):
        user = await get_user(request)
        query = {'provider_user_id' if provider else 'customer_id': user['user_id']}
        docs = await db.delivery_bookings.find(query, {'_id': 0}).sort('created_at', -1).to_list(200)
        return {'items': [order_view(d, user['user_id']) for d in docs]}

    @router.get('/bookings/{bid}')
    async def booking_detail(bid: str, request: Request):
        user, b, is_admin = await get_order(bid, request)
        review = await db.delivery_reviews.find_one({'_id': bid}, {'_id': 0, 'customer_id': 0})
        return order_view(b, user['user_id'], is_admin) | {'is_customer': user['user_id'] == b['customer_id'],
            'is_provider': user['user_id'] == b['provider_user_id'], 'is_admin': is_admin, 'review': review, 'payments': payment_config()}

    @router.post('/bookings/{bid}/quote')
    async def quote(bid: str, body: QuoteInput, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['provider_user_id']:
            raise HTTPException(403, 'Solo il professionista può inviare il preventivo')
        p = await db.delivery_providers.find_one({'id': b['provider_id'], 'status': 'approved'}, {'_id': 0})
        slot = await db.delivery_slots.find_one({'id': body.slot_id, 'provider_id': b['provider_id'], 'booking_id': None,
            'start_at': {'$gt': (utcnow() + timedelta(hours=2)).isoformat()}, 'duration_hours': {'$gte': b['duration_hours']}}, {'_id': 0})
        if not p or not slot:
            raise HTTPException(409, 'Profilo non approvato o orario non disponibile')
        result = await db.delivery_bookings.update_one({'id': bid, 'status': {'$in': ['requested', 'quoted']}, 'mode': 'quote'},
            {'$set': {'status': 'quoted', 'slot_id': slot['id'], 'start_at': slot['start_at'], 'end_at': slot['end_at'],
                'included': body.included, 'quote_expires_at': (utcnow() + timedelta(hours=24)).isoformat(), **split_amount(body.amount_cents)},
             '$push': {'timeline': {'status': 'quoted', 'at': utcnow().isoformat()}}})
        if not result.matched_count:
            raise HTTPException(409, 'Questa richiesta non è più modificabile')
        return {'ok': True}

    @router.post('/bookings/{bid}/checkout')
    async def booking_checkout(bid: str, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['customer_id']:
            raise HTTPException(403, 'Solo il cliente può procedere al pagamento')
        return await checkout(db, b, user)

    @router.post('/bookings/{bid}/payment-status')
    async def payment_status(bid: str, request: Request):
        user, b, is_admin = await get_order(bid, request)
        if b['status'] == 'awaiting_payment' and b.get('checkout_session_id'):
            b = await reconcile_checkout(db, b)
        return order_view(b, user['user_id'], is_admin)

    @router.post('/bookings/{bid}/cancel')
    async def cancel(bid: str, body: ReasonInput, request: Request):
        user, b, is_admin = await get_order(bid, request)
        b, lock = await claim_money(db, bid)
        refund_needed = False
        try:
            if b['status'] in ['requested', 'quoted'] or (b['status'] == 'awaiting_payment' and not b.get('checkout_session_id')):
                if b['status'] == 'awaiting_payment':
                    raise HTTPException(409, 'Pagamento da verificare prima di annullare: riprova il pagamento o contatta assistenza')
                await db.delivery_bookings.update_one({'id': bid}, {'$set': {'status': 'cancelled', 'cancel_reason': body.reason},
                    '$push': {'timeline': {'status': 'cancelled', 'at': utcnow().isoformat()}}})
                await release_slot(db, b)
            elif b['status'] == 'awaiting_payment':
                session = await stripe_call(stripe.checkout.Session.retrieve, id=b['checkout_session_id'])
                if session.get('status') == 'open':
                    await stripe_call(stripe.checkout.Session.expire, id=session.id)
                b = await reconcile_checkout(db, b)
                refund_needed = b['status'] == 'paid'
            elif b['status'] in ['paid', 'served', 'completed', 'transferred', 'refund_pending']:
                refund_needed = True
            elif b['status'] not in ['cancelled', 'expired', 'refunded']:
                raise HTTPException(409, 'Stato non annullabile')
            if refund_needed and not is_admin and (user['user_id'] == b['customer_id'] and b['start_at'] <= utcnow().isoformat()):
                raise HTTPException(409, 'Il servizio è iniziato: usa Segnala un problema per richiedere assistenza')
        finally:
            await unlock(db, bid, lock)
        if refund_needed:
            await refund_booking(db, b, body.reason)
        return {'ok': True}

    @router.post('/bookings/{bid}/served')
    async def served(bid: str, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['provider_user_id'] or b['end_at'] > utcnow().isoformat():
            raise HTTPException(403, 'Solo il professionista può dichiarare il servizio svolto, dopo l’orario di fine')
        now = utcnow()
        result = await db.delivery_bookings.update_one({'id': bid, 'status': 'paid', 'dispute_open': {'$ne': True}}, {'$set': {
            'status': 'served', 'served_at': now.isoformat(), 'auto_complete_after': (now + timedelta(hours=48)).isoformat(),
            'release_after': (now + timedelta(hours=48)).isoformat()}, '$push': {'timeline': {'status': 'served', 'at': now.isoformat()}}})
        if not result.matched_count:
            raise HTTPException(409, 'Il servizio non è in uno stato confermabile')
        return {'ok': True}

    @router.post('/bookings/{bid}/complete')
    async def complete(bid: str, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['customer_id'] or b['end_at'] > utcnow().isoformat():
            raise HTTPException(403, 'Conferma disponibile al cliente solo dopo la fine del servizio')
        result = await db.delivery_bookings.update_one({'id': bid, 'status': {'$in': ['paid', 'served']}, 'dispute_open': {'$ne': True}}, {'$set': {
            'status': 'completed', 'completed_at': utcnow().isoformat(), 'release_after': (utcnow() + timedelta(hours=24)).isoformat()},
            '$push': {'timeline': {'status': 'completed', 'at': utcnow().isoformat()}}})
        if not result.matched_count:
            raise HTTPException(409, 'Questa prenotazione non può essere completata')
        return {'ok': True}

    @router.post('/bookings/{bid}/dispute')
    async def dispute(bid: str, body: ReasonInput, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['customer_id'] or b['status'] not in ['paid', 'served', 'completed', 'transferred']:
            raise HTTPException(403, 'Segnalazione disponibile solo al cliente di un servizio pagato')
        await db.delivery_bookings.update_one({'id': bid}, {'$set': {'dispute_open': True, 'dispute_reason': body.reason,
            'disputed_at': utcnow().isoformat()}, '$push': {'timeline': {'status': 'disputed', 'at': utcnow().isoformat()}}})
        return {'ok': True}

    @router.post('/bookings/{bid}/review')
    async def leave_review(bid: str, body: ReviewInput, request: Request):
        user, b, _ = await get_order(bid, request)
        if user['user_id'] != b['customer_id'] or b['status'] not in ['completed', 'transferred'] or b.get('dispute_open'):
            raise HTTPException(403, 'Puoi recensire solo un servizio completato e non contestato')
        doc = body.model_dump() | {'id': bid, 'provider_id': b['provider_id'], 'customer_id': user['user_id'],
            'customer_name': (user.get('name') or 'Cliente').split()[0], 'service_title': b['service_title'],
            'created_at': utcnow().isoformat(), 'verified_booking': True}
        try:
            await db.delivery_reviews.insert_one({'_id': bid, **doc})
        except DuplicateKeyError:
            raise HTTPException(409, 'Hai già recensito questa prenotazione')
        return doc

    @router.post('/provider/reviews/{rid}/reply')
    async def reply_review(rid: str, body: ReplyInput, request: Request):
        _, p = await own_provider(request)
        result = await db.delivery_reviews.update_one({'id': rid, 'provider_id': p['id']}, {'$set': {'reply': body.text, 'replied_at': utcnow().isoformat()}})
        if not result.matched_count:
            raise HTTPException(404, 'Recensione non trovata')
        return {'ok': True}

    @router.get('/admin')
    async def admin_dashboard(request: Request):
        await admin(request)
        providers = await db.delivery_providers.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
        orders = await db.delivery_bookings.find({}, {'_id': 0, 'money_lock': 0, 'money_lock_until': 0, 'payload_hash': 0}).sort('created_at', -1).to_list(300)
        totals = await db.delivery_bookings.aggregate([{'$match': {'paid_at': {'$exists': True}}}, {'$group': {
            '_id': '$status', 'gross': {'$sum': '$amount_cents'}, 'fee': {'$sum': '$commission_cents'}, 'net': {'$sum': '$provider_cents'}, 'count': {'$sum': 1}}},
            {'$project': {'_id': 0, 'status': '$_id', 'gross': 1, 'fee': 1, 'net': 1, 'count': 1}}]).to_list(30)
        return {'providers': providers, 'orders': orders, 'totals': totals, 'payments': payment_config(), 'commission_percent': 10,
            'payouts': await db.delivery_payouts.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)}

    @router.post('/admin/providers/{pid}/review')
    async def moderate_provider(pid: str, body: Moderation, request: Request):
        reviewer = await admin(request)
        result = await db.delivery_providers.update_one({'id': pid}, {'$set': {'status': body.status, 'review_note': body.note,
            'reviewed_by': reviewer['user_id'], 'reviewed_at': utcnow().isoformat()}})
        if not result.matched_count:
            raise HTTPException(404, 'Professionista non trovato')
        return {'ok': True}

    @router.post('/admin/bookings/{bid}/resolve')
    async def resolve_dispute(bid: str, body: Resolution, request: Request):
        reviewer = await admin(request)
        b = await db.delivery_bookings.find_one({'id': bid}, {'_id': 0})
        if not b or not b.get('dispute_open'):
            raise HTTPException(409, 'Nessuna segnalazione aperta')
        if body.outcome == 'refund':
            await refund_booking(db, b, body.note)
        else:
            if b['end_at'] > utcnow().isoformat() or b.get('refund_pending') or b['status'] == 'refunded':
                raise HTTPException(409, 'Il servizio non può ancora essere liquidato')
            await db.delivery_bookings.update_one({'id': bid}, {'$set': {'status': 'transferred' if b.get('transfer_id') else 'completed',
                'release_after': (utcnow() + timedelta(hours=24)).isoformat()}})
        await db.delivery_bookings.update_one({'id': bid}, {'$set': {'dispute_open': False, 'resolution_note': body.note, 'resolved_by': reviewer['user_id']},
            '$push': {'timeline': {'status': f'resolved_{body.outcome}', 'at': utcnow().isoformat()}}})
        return {'ok': True}

    @router.post('/stripe/webhook')
    async def webhook(request: Request):
        secret = os.getenv('STRIPE_CONNECT_WEBHOOK_SECRET', '')
        if not secret:
            raise HTTPException(503, 'Webhook Connect non configurato')
        raw = await request.body()
        try:
            event = stripe.Webhook.construct_event(raw, request.headers.get('stripe-signature', ''), secret)
        except (ValueError, stripe.SignatureVerificationError):
            raise HTTPException(400, 'Firma webhook non valida')
        if bool(event.get('livemode')) != (payment_config()['mode'] == 'live'):
            raise HTTPException(400, 'Ambiente pagamento non corrispondente')
        try:
            await db.delivery_stripe_events.insert_one({'_id': event.id, 'status': 'new'})
        except DuplicateKeyError:
            pass
        old = await db.delivery_stripe_events.find_one({'_id': event.id}, {'_id': 0})
        if old.get('status') == 'done':
            return {'received': True}
        claimed = await db.delivery_stripe_events.find_one_and_update({'_id': event.id, '$or': [
            {'status': {'$in': ['new', 'failed']}}, {'lease': {'$lt': utcnow().isoformat()}}]},
            {'$set': {'status': 'processing', 'lease': (utcnow() + timedelta(minutes=3)).isoformat()}}, projection={'_id': 0})
        if not claimed:
            raise HTTPException(409, 'Evento già in elaborazione')
        try:
            obj, kind = event.data.object, event.type
            if kind.startswith('checkout.session.'):
                b = await db.delivery_bookings.find_one({'checkout_session_id': obj.id}, {'_id': 0})
                if b:
                    await reconcile_checkout(db, b)
            elif kind == 'account.updated':
                await db.delivery_providers.update_one({'stripe_account_id': obj.id}, {'$set': {
                    'connect_ready': bool(obj.get('charges_enabled') and obj.get('payouts_enabled') and obj.get('capabilities', {}).get('transfers') == 'active'),
                    'connect_due': list(obj.get('requirements', {}).get('currently_due') or [])}})
            elif kind.startswith('payout.') and event.get('account'):
                p = await db.delivery_providers.find_one({'stripe_account_id': event.account}, {'_id': 0})
                if p:
                    await db.delivery_payouts.update_one({'_id': obj.id}, {'$set': {'id': obj.id, 'provider_id': p['id'],
                        'amount_cents': obj.amount, 'currency': obj.currency.upper(), 'status': obj.status,
                        'arrival_date': obj.get('arrival_date'), 'created_at': datetime.fromtimestamp(obj.created, timezone.utc).isoformat(),
                        'failure_message': obj.get('failure_message')}}, upsert=True)
            elif kind == 'charge.dispute.created':
                await db.delivery_bookings.update_one({'payment_intent_id': obj.get('payment_intent')}, {'$set': {
                    'dispute_open': True, 'dispute_reason': 'Contestazione bancaria Stripe', 'stripe_dispute_id': obj.id}})
            elif kind == 'charge.refunded':
                b = await db.delivery_bookings.find_one({'payment_intent_id': obj.get('payment_intent')}, {'_id': 0})
                if b:
                    full = obj.get('amount_refunded') == obj.get('amount')
                    await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {
                        'status': 'refunded' if full else b['status'], 'refund_pending': False,
                        'refunded_cents': obj.get('amount_refunded'), 'dispute_open': bool(b.get('transfer_id') and not b.get('transfer_reversed')),
                        'dispute_reason': 'Rimborso esterno: verificare eventuale recupero accredito'}})
                    if full:
                        await release_slot(db, b)
            await db.delivery_stripe_events.update_one({'_id': event.id}, {'$set': {'status': 'done', 'done_at': utcnow().isoformat()}})
        except Exception:
            await db.delivery_stripe_events.update_one({'_id': event.id}, {'$set': {'status': 'failed'}})
            raise
        return {'received': True}

    return router


async def init_delivery(db):
    await db.delivery_providers.create_index('user_id', unique=True)
    await db.delivery_providers.create_index('id', unique=True)
    await db.delivery_bookings.create_index('id', unique=True)
    await db.delivery_bookings.create_index([('provider_user_id', 1), ('created_at', -1)])
    await db.delivery_bookings.create_index([('customer_id', 1), ('created_at', -1)])
    await db.delivery_slots.create_index('id', unique=True)
    await db.delivery_services.create_index('id', unique=True)
    asyncio.create_task(payment_worker(db))