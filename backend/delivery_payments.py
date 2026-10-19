"""Connect-only money flow. The managed single-merchant Stripe key is NOT used."""
import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import stripe
from dotenv import load_dotenv
from fastapi import HTTPException
from pymongo import ReturnDocument

load_dotenv()


def utcnow():
    return datetime.now(timezone.utc)


def payment_config():
    key = os.getenv('STRIPE_CONNECT_SECRET_KEY', '').strip()
    hook = os.getenv('STRIPE_CONNECT_WEBHOOK_SECRET', '').strip()
    public = os.getenv('DELIVERY_PUBLIC_APP_URL', '').rstrip('/')
    configured = bool(key and hook and public.startswith('https://') and not key.endswith('emergent'))
    return {'configured': configured, 'mode': ('test' if key.startswith(('sk_test_', 'rk_test_')) else 'live') if configured else 'unavailable',
            'message': None if configured else 'Pagamenti e accrediti in attivazione: manca il collegamento Stripe Connect della piattaforma. Nessun addebito disponibile.'}


def require_connect():
    if not payment_config()['configured']:
        raise HTTPException(503, payment_config()['message'])


async def stripe_call(func, **kwargs):
    require_connect()
    try:
        return await asyncio.to_thread(func, api_key=os.environ['STRIPE_CONNECT_SECRET_KEY'], **kwargs)
    except stripe.StripeError as exc:
        logging.warning('Delivery Stripe operation failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Il servizio di pagamento non è disponibile. Nessun esito è stato dato per confermato: riprova.')


async def refresh_account(db, provider):
    if not provider.get('stripe_account_id'):
        return provider
    a = await stripe_call(stripe.Account.retrieve, id=provider['stripe_account_id'])
    ready = bool(a.get('charges_enabled') and a.get('payouts_enabled') and a.get('capabilities', {}).get('transfers') == 'active')
    update = {'connect_ready': ready, 'connect_due': list(a.get('requirements', {}).get('currently_due') or []),
              'connect_checked_at': utcnow().isoformat()}
    await db.delivery_providers.update_one({'id': provider['id']}, {'$set': update})
    return {**provider, **update}


async def onboarding(db, provider, user):
    require_connect()
    if not provider.get('stripe_account_id'):
        account = await stripe_call(stripe.Account.create, type='express', country='IT', email=user['email'],
            capabilities={'card_payments': {'requested': True}, 'transfers': {'requested': True}},
            business_profile={'product_description': 'Servizi chef a domicilio e catering in Italia'},
            metadata={'delivery_provider_id': provider['id']},
            settings={'payouts': {'schedule': {'interval': 'daily'}}}, idempotency_key=f"delivery-account-{provider['id']}")
        await db.delivery_providers.update_one({'id': provider['id']}, {'$set': {'stripe_account_id': account.id, 'connect_ready': False}})
        provider['stripe_account_id'] = account.id
    base = os.environ['DELIVERY_PUBLIC_APP_URL'].rstrip('/')
    link = await stripe_call(stripe.AccountLink.create, account=provider['stripe_account_id'], type='account_onboarding',
        return_url=f'{base}/delivery/provider?connect=return', refresh_url=f'{base}/delivery/provider?connect=refresh')
    return {'url': link.url}


async def claim_money(db, bid):
    token = uuid4().hex
    result = await db.delivery_bookings.find_one_and_update({'id': bid, '$or': [
        {'money_lock_until': {'$exists': False}}, {'money_lock_until': {'$lt': utcnow().isoformat()}}]},
        {'$set': {'money_lock': token, 'money_lock_until': (utcnow() + timedelta(minutes=3)).isoformat()}},
        projection={'_id': 0}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(409, 'È già in corso un’operazione su questa prenotazione. Riprova tra poco.')
    return result, token


async def unlock(db, bid, token):
    await db.delivery_bookings.update_one({'id': bid, 'money_lock': token}, {'$unset': {'money_lock': '', 'money_lock_until': ''}})


async def release_slot(db, booking):
    if booking.get('slot_id'):
        await db.delivery_slots.update_one({'id': booking['slot_id'], 'booking_id': booking['id']}, {'$set': {'booking_id': None}})


async def reconcile_checkout(db, booking):
    if not booking.get('checkout_session_id'):
        return booking
    session = await stripe_call(stripe.checkout.Session.retrieve, id=booking['checkout_session_id'])
    if (session.get('metadata', {}).get('booking_id') != booking['id'] or session.get('currency') != 'eur'
            or session.get('amount_total') != booking['amount_cents']):
        raise HTTPException(409, 'Dati pagamento non corrispondenti. Contatta l’assistenza.')
    if session.get('payment_status') == 'paid':
        await db.delivery_bookings.update_one({'id': booking['id'], 'status': 'awaiting_payment'}, {'$set': {
            'status': 'paid', 'payment_intent_id': session['payment_intent'], 'paid_at': utcnow().isoformat()},
            '$push': {'timeline': {'status': 'paid', 'at': utcnow().isoformat()}}})
    elif session.get('status') == 'expired':
        changed = await db.delivery_bookings.update_one({'id': booking['id'], 'status': 'awaiting_payment'},
            {'$set': {'status': 'expired'}, '$push': {'timeline': {'status': 'expired', 'at': utcnow().isoformat()}}})
        if changed.modified_count:
            await release_slot(db, booking)
    return await db.delivery_bookings.find_one({'id': booking['id']}, {'_id': 0})


async def checkout(db, booking, user):
    require_connect()
    b, lock = await claim_money(db, booking['id'])
    try:
        if b['status'] == 'awaiting_payment' and b.get('checkout_session_id'):
            b = await reconcile_checkout(db, b)
            if b['status'] == 'paid':
                return {'paid': True}
            session = await stripe_call(stripe.checkout.Session.retrieve, id=b['checkout_session_id'])
            if session.get('status') == 'open':
                return {'url': session.url}
            raise HTTPException(409, 'Pagamento scaduto. Crea una nuova prenotazione.')
        if b['status'] not in ['quoted', 'awaiting_payment']:
            raise HTTPException(409, 'Questa prenotazione non può essere pagata')
        if b.get('quote_expires_at') and b['quote_expires_at'] < utcnow().isoformat():
            raise HTTPException(409, 'Preventivo scaduto: richiedi una nuova offerta')
        provider = await db.delivery_providers.find_one({'id': b['provider_id'], 'status': 'approved'}, {'_id': 0})
        if not provider:
            raise HTTPException(409, 'Professionista non disponibile')
        provider = await refresh_account(db, provider)
        if not provider.get('connect_ready'):
            raise HTTPException(409, 'Il professionista non ha ancora completato l’abilitazione ai pagamenti')
        slot = await db.delivery_slots.find_one_and_update({'id': b['slot_id'], 'provider_id': b['provider_id'],
            'start_at': {'$gt': utcnow().isoformat()}, '$or': [{'booking_id': None}, {'booking_id': b['id']}]},
            {'$set': {'booking_id': b['id']}}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if not slot:
            raise HTTPException(409, 'Orario non più disponibile. Chiedi un nuovo preventivo.')
        expires = b.get('checkout_expires_ts') or int(time.time()) + 1860
        if expires <= int(time.time()) + 30 and not b.get('checkout_session_id'):
            raise HTTPException(409, 'Tentativo scaduto: chiedi assistenza per liberare la prenotazione')
        await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {
            'status': 'awaiting_payment', 'checkout_expires_ts': expires, 'provider_stripe_account_id': provider['stripe_account_id']}})
        base = os.environ['DELIVERY_PUBLIC_APP_URL'].rstrip('/')
        session = await stripe_call(stripe.checkout.Session.create, mode='payment', payment_method_types=['card'],
            customer_email=user['email'], expires_at=expires,
            line_items=[{'price_data': {'currency': 'eur', 'unit_amount': b['amount_cents'],
                'product_data': {'name': b['service_title']}}, 'quantity': 1}],
            success_url=f"{base}/delivery/order/{b['id']}?checkout=returned", cancel_url=f"{base}/delivery/order/{b['id']}?checkout=cancelled",
            metadata={'booking_id': b['id']}, payment_intent_data={'metadata': {'booking_id': b['id']}, 'transfer_group': b['id']},
            idempotency_key=f"delivery-checkout-{b['id']}")
        await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'checkout_session_id': session.id}})
        return {'url': session.url}
    finally:
        await unlock(db, booking['id'], lock)


async def refund_booking(db, booking, reason):
    require_connect()
    b, lock = await claim_money(db, booking['id'])
    try:
        if b['status'] == 'refunded':
            return
        if b.get('checkout_session_id') and not b.get('payment_intent_id'):
            b = await reconcile_checkout(db, b)
        if not b.get('payment_intent_id'):
            raise HTTPException(409, 'Non risulta un pagamento confermato')
        await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'refund_pending': True, 'refund_reason': reason}})
        if b.get('transfer_id') and not b.get('transfer_reversed'):
            await stripe_call(stripe.Transfer.create_reversal, id=b['transfer_id'], idempotency_key=f"delivery-reverse-{b['id']}")
            await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'transfer_reversed': True}})
        refund = await stripe_call(stripe.Refund.create, payment_intent=b['payment_intent_id'],
            reason='requested_by_customer', idempotency_key=f"delivery-refund-{b['id']}")
        success = refund.get('status') == 'succeeded'
        await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'status': 'refunded' if success else 'refund_pending',
            'refund_pending': not success, 'refund_id': refund.id, 'refund_reason': reason, 'refunded_at': utcnow().isoformat() if success else None},
            '$push': {'timeline': {'status': 'refunded' if success else 'refund_pending', 'at': utcnow().isoformat()}}})
        if success:
            await release_slot(db, b)
    finally:
        await unlock(db, booking['id'], lock)


async def transfer_booking(db, booking):
    b, lock = await claim_money(db, booking['id'])
    try:
        if (b['status'] != 'completed' or b.get('dispute_open') or b.get('refund_pending') or b.get('transfer_id')
                or b.get('release_after', '9999') > utcnow().isoformat()):
            return
        provider = await db.delivery_providers.find_one({'id': b['provider_id'], 'status': 'approved'}, {'_id': 0})
        if not provider:
            return
        provider = await refresh_account(db, provider)
        if not provider.get('connect_ready'):
            return
        pi = await stripe_call(stripe.PaymentIntent.retrieve, id=b['payment_intent_id'], expand=['latest_charge'])
        charge = pi.get('latest_charge')
        if pi.get('status') != 'succeeded' or not charge or charge.get('disputed') or charge.get('amount_refunded', 0):
            await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'dispute_open': True, 'dispute_reason': 'Verifica Stripe richiesta prima dell’accredito'}})
            return
        # Recheck complaints immediately before the external money operation.
        fresh = await db.delivery_bookings.find_one({'id': b['id']}, {'_id': 0})
        if fresh.get('dispute_open') or fresh.get('refund_pending'):
            return
        transfer = await stripe_call(stripe.Transfer.create, amount=b['provider_cents'], currency='eur',
            destination=b['provider_stripe_account_id'], source_transaction=charge['id'], transfer_group=b['id'],
            metadata={'booking_id': b['id']}, idempotency_key=f"delivery-transfer-{b['id']}")
        await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'transfer_id': transfer.id,
            'status': 'transferred', 'transferred_at': utcnow().isoformat(), 'transfer_error': None},
            '$push': {'timeline': {'status': 'transferred', 'at': utcnow().isoformat()}}})
        latest = await db.delivery_bookings.find_one({'id': b['id']}, {'_id': 0})
        if latest.get('dispute_open'):
            await stripe_call(stripe.Transfer.create_reversal, id=transfer.id, idempotency_key=f"delivery-dispute-reverse-{b['id']}")
            await db.delivery_bookings.update_one({'id': b['id']}, {'$set': {'transfer_reversed': True, 'status': 'completed'}})
    finally:
        await unlock(db, booking['id'], lock)


async def payment_worker(db):
    while True:
        try:
            if payment_config()['configured']:
                pending = await db.delivery_bookings.find({'status': 'awaiting_payment', 'checkout_session_id': {'$exists': True}}, {'_id': 0}).limit(100).to_list(100)
                for booking in pending:
                    try:
                        await reconcile_checkout(db, booking)
                    except HTTPException:
                        logging.warning('Delivery payment reconciliation deferred')
                await db.delivery_bookings.update_many({'status': 'served', 'dispute_open': {'$ne': True},
                    'auto_complete_after': {'$lte': utcnow().isoformat()}}, {'$set': {'status': 'completed'}})
                ready = await db.delivery_bookings.find({'status': 'completed', 'dispute_open': {'$ne': True},
                    'release_after': {'$lte': utcnow().isoformat()}, 'transfer_id': {'$exists': False}}, {'_id': 0}).limit(100).to_list(100)
                for booking in ready:
                    try:
                        await transfer_booking(db, booking)
                    except HTTPException as exc:
                        await db.delivery_bookings.update_one({'id': booking['id']}, {'$set': {'transfer_error': exc.detail}})
        except Exception:
            logging.exception('Delivery worker iteration failed; will retry')
        await asyncio.sleep(60)