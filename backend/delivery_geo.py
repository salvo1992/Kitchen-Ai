"""Explicit Italian city search, shared throttling and cached real geocoding."""
import asyncio
import hashlib
import math
import os
import re
from datetime import datetime, timedelta, timezone
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

load_dotenv()


def distance_km(a, b):
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    x = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(math.radians(b['lon'] - a['lon']) / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(x)))


async def get_city(db, city_id):
    city = await db.delivery_cities.find_one({'id': city_id}, {'_id': 0})
    if not city:
        raise HTTPException(422, 'Cerca e seleziona un comune italiano valido')
    return city


async def city_search(db, query):
    normalized = re.sub(r'\s+', ' ', query.strip().casefold())
    key = hashlib.sha256(normalized.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    cached = await db.delivery_geo_cache.find_one({'_id': key, 'expires_at': {'$gt': now}}, {'_id': 0})
    if cached:
        return cached['items']
    # Shared Mongo lease also spaces requests across backend processes.
    try:
        await db.delivery_geo_locks.update_one({'_id': 'nominatim'}, {'$setOnInsert': {'next_at': now}}, upsert=True)
    except DuplicateKeyError:
        pass
    for _ in range(20):
        now = datetime.now(timezone.utc)
        lock = await db.delivery_geo_locks.find_one_and_update({'_id': 'nominatim', 'next_at': {'$lte': now}},
            {'$set': {'next_at': now + timedelta(seconds=1.1)}}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if lock:
            break
        await asyncio.sleep(0.3)
    else:
        raise HTTPException(429, 'Ricerca città occupata, riprova tra qualche secondo')
    base = os.getenv('NOMINATIM_BASE_URL', '').rstrip('/')
    agent = os.getenv('NOMINATIM_USER_AGENT', '')
    if not base or not agent:
        raise HTTPException(503, 'Ricerca geografica non configurata')
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(f'{base}/search', params={'q': normalized, 'format': 'jsonv2', 'addressdetails': 1,
                'countrycodes': 'it', 'limit': 8, 'featureType': 'city'}, headers={'User-Agent': agent, 'Accept-Language': 'it'})
            response.raise_for_status()
            rows = response.json()
        items, seen = [], set()
        for row in rows:
            address = row.get('address', {})
            city_name = next((address[k] for k in ['city', 'town', 'village', 'municipality'] if address.get(k)), None)
            if address.get('country_code') != 'it' or not city_name:
                continue
            lat, lon = float(row['lat']), float(row['lon'])
            if not (35 <= lat <= 48 and 6 <= lon <= 20):
                continue
            city_id = f"osm_{row['osm_type']}_{row['osm_id']}"
            if city_id in seen:
                continue
            seen.add(city_id)
            city = {'id': city_id, 'name': city_name, 'region': address.get('state', ''),
                    'label': f"{city_name} · {address.get('state', 'Italia')}", 'lat': lat, 'lon': lon}
            await db.delivery_cities.update_one({'_id': city_id}, {'$set': city}, upsert=True)
            items.append(city)
        await db.delivery_geo_cache.update_one({'_id': key}, {'$set': {'items': items, 'expires_at': now + timedelta(days=30)}}, upsert=True)
        return items
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'Ricerca città temporaneamente non disponibile. Nessuna posizione è stata stimata: riprova.')