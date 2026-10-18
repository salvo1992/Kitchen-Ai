"""Shop content and course administration. No client-supplied purchase grants."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo import ReturnDocument

load_dotenv()
ADMIN_EMAIL = os.getenv('SHOP_ADMIN_EMAIL', '').strip().lower()


def now():
    return datetime.now(timezone.utc).isoformat()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Application(StrictModel):
    bio: str = Field(min_length=20, max_length=1500)


class Lesson(StrictModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,60}$')
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=10, max_length=20000)
    preview: bool = False


class CourseBody(StrictModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=20, max_length=3000)
    category: Literal['Basi di cucina', 'Cucina italiana', 'Dolci', 'Anti-spreco', 'Cucina vegetale'] = 'Basi di cucina'
    price_cents: int = Field(ge=399, le=99999, strict=True)
    lessons: list[Lesson] = Field(min_length=1, max_length=40)

    @field_validator('lessons')
    @classmethod
    def unique_lessons(cls, lessons):
        if len({x.id for x in lessons}) != len(lessons):
            raise ValueError('Le lezioni devono avere identificativi distinti')
        return lessons


class Review(StrictModel):
    decision: Literal['approved', 'rejected']
    note: str = Field(default='', max_length=1000)


class Progress(StrictModel):
    lesson_id: str = Field(max_length=60)
    complete: bool = True


class Payout(StrictModel):
    reference: str = Field(min_length=3, max_length=120)


class Earning(BaseModel):
    id: str
    creator_id: str
    course_title: str
    net_receipt_cents: int
    creator_cents: int
    app_cents: int
    currency: str = 'EUR'
    status: str
    payment_reference: str | None = None
    paid_at: str | None = None


class CoachBody(StrictModel):
    message: str = Field(min_length=2, max_length=2000)


def make_shop_router(db, get_user, scope, generate_coach):
    router = APIRouter(prefix='/api')

    async def admin_flag(request, user):
        session = await db.user_sessions.find_one(
            {'session_token': request.headers.get('Authorization', '')[7:], 'user_id': user['user_id']},
            {'_id': 0, 'identity_verified': 1, 'verified_email': 1})
        return bool(ADMIN_EMAIL and session and session.get('identity_verified') is True
                    and session.get('verified_email', '').lower() == ADMIN_EMAIL
                    and user.get('email', '').lower() == ADMIN_EMAIL)

    async def admin(request):
        user = await get_user(request)
        if not await admin_flag(request, user):
            raise HTTPException(403, "Accesso admin riservato all'account Google verificato del titolare")
        return user

    async def creator(request):
        user = await get_user(request)
        application = await db.creator_applications.find_one({'_id': user['user_id'], 'status': 'approved'}, {'_id': 0})
        if not application and not await admin_flag(request, user):
            raise HTTPException(403, 'La candidatura creatore deve essere approvata')
        return user

    async def course(cid):
        doc = await db.courses.find_one({'id': cid}, {'_id': 0})
        if not doc:
            raise HTTPException(404, 'Corso non trovato')
        return doc

    def summary(doc):
        return {k: doc.get(k) for k in ('id', 'title', 'description', 'category', 'price_cents', 'creator_id', 'creator_name', 'status', 'review_note')} | {
            'lesson_count': len(doc.get('lessons', [])), 'purchase_available': False}

    @router.get('/shop/access')
    async def access(request: Request):
        user = await get_user(request)
        application = await db.creator_applications.find_one({'_id': user['user_id']}, {'_id': 0})
        is_admin = await admin_flag(request, user)
        return {'is_admin': is_admin, 'is_creator': is_admin or (application or {}).get('status') == 'approved',
                'application': application, 'course_purchases_available': False, 'commission_percent': 10}

    @router.post('/creator/application')
    async def apply(body: Application, request: Request):
        user = await get_user(request)
        await db.creator_applications.update_one({'_id': user['user_id']}, {'$setOnInsert': {
            'user_id': user['user_id'], 'name': user.get('name') or 'Chef', 'email': user['email'],
            'bio': body.bio, 'status': 'pending', 'created_at': now()}}, upsert=True)
        return await db.creator_applications.find_one({'_id': user['user_id']}, {'_id': 0})

    @router.get('/courses')
    async def catalogue(request: Request):
        await get_user(request)
        docs = await db.courses.find({'status': 'published'}, {'_id': 0}).sort('updated_at', -1).to_list(200)
        return {'items': [summary(d) for d in docs]}

    @router.get('/courses/mine')
    async def my_learning(request: Request):
        user = await get_user(request)
        saved = await db.course_progress.find({'user_id': user['user_id']}, {'_id': 0}).to_list(200)
        docs = await db.courses.find({'id': {'$in': [s['course_id'] for s in saved]}, 'status': 'published'}, {'_id': 0}).to_list(200)
        return {'items': [summary(d) | {'completed': next((s['completed'] for s in saved if s['course_id'] == d['id']), [])} for d in docs]}

    @router.get('/courses/{cid}')
    async def detail(cid: str, request: Request):
        user = await get_user(request)
        doc = await course(cid)
        can_edit = doc['creator_id'] == user['user_id'] or await admin_flag(request, user)
        if doc['status'] != 'published' and not can_edit:
            raise HTTPException(404, 'Corso non trovato')
        progress = await db.course_progress.find_one({'_id': f"{user['user_id']}:{cid}"}, {'_id': 0})
        lessons = [{**l, 'content': l['content'] if l['preview'] or can_edit else None,
                    'locked': not (l['preview'] or can_edit)} for l in doc['lessons']]
        return summary(doc) | {'lessons': lessons, 'completed': (progress or {}).get('completed', []), 'saved': bool(progress)}

    @router.post('/courses/{cid}/follow')
    async def follow(cid: str, request: Request):
        user = await get_user(request)
        doc = await course(cid)
        if doc['status'] != 'published':
            raise HTTPException(404, 'Corso non disponibile')
        await db.course_progress.update_one({'_id': f"{user['user_id']}:{cid}"}, {'$setOnInsert': {
            'user_id': user['user_id'], 'course_id': cid, 'completed': [], 'created_at': now()}}, upsert=True)
        return {'ok': True}

    @router.post('/courses/{cid}/progress')
    async def progress(cid: str, body: Progress, request: Request):
        user = await get_user(request)
        doc = await course(cid)
        if doc['status'] != 'published':
            raise HTTPException(404, 'Corso non disponibile')
        lesson = next((l for l in doc['lessons'] if l['id'] == body.lesson_id), None)
        if not lesson or not lesson['preview']:
            raise HTTPException(403, 'Questa lezione richiede un acquisto; vendite non ancora attive')
        await follow(cid, request)
        op = '$addToSet' if body.complete else '$pull'
        await db.course_progress.update_one({'_id': f"{user['user_id']}:{cid}"}, {op: {'completed': body.lesson_id}})
        return {'ok': True}

    @router.get('/creator/dashboard')
    async def creator_dashboard(request: Request):
        user = await creator(request)
        docs = await db.courses.find({'creator_id': user['user_id']}, {'_id': 0}).sort('updated_at', -1).to_list(200)
        earnings = await db.course_earnings.find({'creator_id': user['user_id'], 'verified': True}, {'_id': 0}).to_list(1000)
        return {'courses': [summary(d) for d in docs], 'followers': await db.course_progress.count_documents({'course_id': {'$in': [d['id'] for d in docs]}}),
                'balance_cents': sum(e['creator_cents'] for e in earnings if e['status'] == 'earned'),
                'paid_cents': sum(e['creator_cents'] for e in earnings if e['status'] == 'paid'),
                'earnings': [Earning(**e).model_dump() for e in earnings], 'commission_percent': 10, 'sales_active': False}

    @router.post('/creator/courses')
    async def create(body: CourseBody, request: Request):
        user = await creator(request)
        doc = body.model_dump() | {'id': f'course_{uuid4().hex[:16]}', 'creator_id': user['user_id'],
                'creator_name': user.get('name') or 'Chef', 'status': 'draft', 'updated_at': now(), 'review_note': ''}
        await db.courses.insert_one(doc)
        doc.pop('_id', None)
        return doc

    @router.put('/creator/courses/{cid}')
    async def update(cid: str, body: CourseBody, request: Request):
        user = await creator(request)
        doc = await course(cid)
        if doc['creator_id'] != user['user_id']:
            raise HTTPException(404, 'Corso non trovato')
        if doc['status'] not in ('draft', 'rejected'):
            raise HTTPException(409, 'Chiedi il ritiro del corso prima di modificarlo')
        result = await db.courses.update_one({'id': cid, 'creator_id': user['user_id'], 'status': doc['status']},
            {'$set': body.model_dump() | {'status': 'draft', 'updated_at': now(), 'review_note': ''}})
        if not result.matched_count:
            raise HTTPException(409, 'Stato del corso cambiato, ricarica')
        return await course(cid)

    @router.post('/creator/courses/{cid}/submit')
    async def submit(cid: str, request: Request):
        user = await creator(request)
        result = await db.courses.update_one({'id': cid, 'creator_id': user['user_id'], 'status': {'$in': ['draft', 'rejected']}},
            {'$set': {'status': 'pending', 'updated_at': now()}})
        if not result.matched_count:
            raise HTTPException(409, 'Corso non inviabile o non tuo')
        return {'ok': True}

    @router.get('/admin/shop')
    async def admin_dashboard(request: Request):
        await admin(request)
        applications = await db.creator_applications.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)
        docs = await db.courses.find({}, {'_id': 0}).sort('updated_at', -1).to_list(200)
        earnings = await db.course_earnings.find({'verified': True}, {'_id': 0}).to_list(1000)
        return {'applications': applications, 'courses': [summary(d) for d in docs],
                'earnings': [Earning(**e).model_dump() for e in earnings], 'commission_percent': 10,
                'balance_cents': sum(e['creator_cents'] for e in earnings if e['status'] == 'earned'),
                'paid_cents': sum(e['creator_cents'] for e in earnings if e['status'] == 'paid'), 'sales_active': False}

    @router.post('/admin/creators/{uid}/review')
    async def review_creator(uid: str, body: Review, request: Request):
        reviewer = await admin(request)
        result = await db.creator_applications.update_one({'_id': uid, 'status': {'$in': ['pending', 'approved', 'rejected']}},
            {'$set': {'status': body.decision, 'review_note': body.note, 'reviewed_by': reviewer['user_id'], 'reviewed_at': now()}})
        if not result.matched_count:
            raise HTTPException(404, 'Candidatura non trovata')
        if body.decision == 'rejected':
            await db.courses.update_many({'creator_id': uid, 'status': 'published'}, {'$set': {'status': 'rejected', 'review_note': 'Creatore sospeso'}})
        return {'ok': True}

    @router.post('/admin/courses/{cid}/review')
    async def review_course(cid: str, body: Review, request: Request):
        reviewer = await admin(request)
        doc = await course(cid)
        if body.decision == 'approved':
            approved = await db.creator_applications.find_one({'_id': doc['creator_id'], 'status': 'approved'}, {'_id': 0})
            if not approved and doc['creator_id'] != reviewer['user_id']:
                raise HTTPException(409, 'Approva prima il creatore')
        target = 'published' if body.decision == 'approved' else 'rejected'
        result = await db.courses.update_one({'id': cid, 'status': {'$in': ['pending', 'published']}},
            {'$set': {'status': target, 'review_note': body.note, 'reviewed_by': reviewer['user_id'], 'updated_at': now()}})
        if not result.matched_count:
            raise HTTPException(409, 'Il corso deve essere inviato in revisione')
        return {'ok': True}

    @router.post('/admin/earnings/{eid}/paid', response_model=Earning)
    async def mark_paid(eid: str, body: Payout, request: Request):
        reviewer = await admin(request)
        # One atomic state transition. No endpoint accepts sales or balances from clients.
        doc = await db.course_earnings.find_one_and_update({'id': eid, 'verified': True, 'status': 'earned', 'creator_cents': {'$gt': 0}},
            {'$set': {'status': 'paid', 'payment_reference': body.reference, 'paid_at': now(), 'paid_by': reviewer['user_id']}},
            projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if not doc:
            raise HTTPException(409, 'Movimento non pagabile o già registrato')
        return Earning(**doc)

    @router.get('/coach/history')
    async def coach_history(request: Request):
        user = await get_user(request)
        docs = await db.coach_messages.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(40)
        return {'items': list(reversed(docs))}

    @router.post('/coach/message')
    async def coach_message(body: CoachBody, request: Request):
        user = await get_user(request)
        history = await db.coach_messages.find({'user_id': user['user_id']}, {'_id': 0, 'role': 1, 'content': 1}).sort('created_at', -1).to_list(12)
        pantry = await db.pantry.find({**scope(user), 'kind': {'$ne': 'non_food'}, 'qty': {'$gt': 0}}, {'_id': 0, 'name': 1}).to_list(30)
        text = await generate_coach(user, body.message, list(reversed(history)), pantry)
        docs = [{'id': uuid4().hex, 'user_id': user['user_id'], 'role': role, 'content': content, 'created_at': now()}
                for role, content in [('user', body.message), ('assistant', text)]]
        await db.coach_messages.insert_many(docs)
        for d in docs:
            d.pop('_id', None)
        return {'items': docs}

    return router