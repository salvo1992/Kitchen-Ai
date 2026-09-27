# Smart Kitchen AI (ex CucinaSmart AI) — Product Requirements

## Vision
Full kitchen command center: plan meals, cook with AI, run pantry/fridge/freezer with expiration triage, auto shopping list, import meal plans from photos with Gemini vision. Warm sage-green Italian UX.

## Stack
- FastAPI + Motor (MongoDB) backend
- Expo Router 5 + React Query + expo-image + expo-blur
- Auth: email/password (bcrypt + session token) OR Emergent-managed Google OAuth
- AI: Gemini 3 Flash via `emergentintegrations` (EMERGENT_LLM_KEY)
- Files: Emergent Managed Object Storage (`/api/upload`, `/api/files/{path}?token=…`)

## Screens
- (auth)/login — email/password + Google
- (tabs)/oggi — greeting, expiring KPI, today menu carousel, shortcuts
- (tabs)/ricette — search, category chips, grid, favorites
- (tabs)/dispensa — segmented pantry/fridge/freezer, "Da usare prima" vs "Tutto ok"
- (tabs)/spesa — grouped by aisle, check/uncheck, clear checked
- chef — Chef AI streaming-style chat (Gemini)
- what-can-i-cook — pantry-based AI suggestions, save to cookbook
- import-photo — pick/shoot → Gemini vision → parse meals → import into calendar
- calendar — 14-day meal plan
- add-recipe, add-meal, recipe/[id], cook/[id] (Cucina passo-passo)
- settings — profile + logout

## Data
- users {user_id, email, name, picture, password_hash, created_at}
- user_sessions {session_token, user_id, expires_at, created_at} (TTL)
- recipes {id, user_id, title, description, ingredients[], steps[], time_min, servings, tags[], image_url, favorite, created_at}
- pantry {id, user_id, name, qty, unit, location, expires_at, barcode, image_url, created_at}
- shopping {id, user_id, name, qty, unit, aisle, checked, note, created_at}
- meals {id, user_id, date(YYYY-MM-DD), slot, title, recipe_id, notes, created_at}
- chat_messages {id, user_id, session_id, role, content, created_at}
- uploads {path, user_id, content_type, created_at}
- file_tokens {token, path, user_id, expires_at} (TTL)

## Status (Giugno 2026)
- Backend: 32/32 test OK (iteration_1) + 8/8 nuove feature (iteration_3)
- Frontend E2E: 11/11 flussi base (iteration_2) + 11/11 nuove feature (iteration_3)
- Lint frontend: 0 warning
- Backlog: nessuno

## Feature aggiunte (iteration_6)
- Widget settimana in Oggi: strip 7 giorni (`day-YYYY-MM-DD`, pallini = pasti), query meals su 7 giorni, slot del giorno selezionato
- Timer cucina: `src/components/StepTimer.tsx` estrae minuti dal passo (min/minuti/ore/mezz'ora/range), countdown con pausa/+1m/reset, haptics+vibrazione su nativo; key=idx resetta al cambio passo
- Storico cucinato: `GET /api/stats/history?month=` da consumption_log; schermata `/history` con nav mese, riepilogo, "Ricucina" (ri-POST cooked stesse porzioni); link da card Anti-spreco e Impostazioni
- Export spesa: pulsanti Condividi (Share nativo / clipboard su web), WhatsApp (deep link, nativo), Copia (expo-clipboard); testo raggruppato per corsia, esclusi i presi

## Feature aggiunte (iteration_5)
- Cucinato!: `POST /api/recipes/{id}/cooked {servings}` scala la dispensa (min 0), i finiti vanno in spesa ("Finito cucinando: …"), log in `consumption_log {items[{pantry_id,name,used_qty,unit,days_left,price}], month}`
- Ricerca ingredienti: `GET /api/recipes?q=&cookable=` cerca titolo/ingredienti/tag, restituisce `missing_count/missing_names/cookable` (q.b. e staples ignorati); chip "Con ciò che ho" + badge
- Ricetta AI da ricerca: `POST /api/ai/recipe {query}` → anteprima → salva con ok utente
- Modifica ricetta: `/add-recipe?id=` precompilato, PATCH; input unità ingredienti
- Statistiche sprechi: `GET /api/stats/waste?month=` (ricette cucinate, salvati dalla scadenza ≤3g, € = price o 2,50 default, scaduti ora); card "Anti-spreco" in Oggi; campo `price` opzionale su pantry (Dispensa + scanner)

## Feature aggiunte (iteration_4)
- Scala porzioni: stepper nel dettaglio ricetta, quantità ricalcolate client-side (`fmtQty`), q.b. invariato
- Avvisi scadenze: `GET /api/pantry/expiring?days=3`; banner in Oggi con nomi; `src/reminders.ts` notifica locale giornaliera (expo-notifications, DAILY trigger) risincronizzata a ogni caricamento di Oggi; orario/toggle in Impostazioni (`ReminderCard`, AsyncStorage). Solo su telefono, non web
- Foto ricette: `POST /api/upload-base64` → Object Storage, token 10 anni; `src/media.ts` (pickImage con permessi, uploadImage, resolveUrl); pulsante in dettaglio + area foto in add-recipe
- Spesa da piano: `POST /api/meals/to-shopping {start,end}` unisce ingredienti dei pasti con ricetta (somma qty stessa unità), esclude dispensa/lista; pulsanti in Calendario e Piano AI

## Feature aggiunte (iteration_3)
- Scanner barcode (`/scan-barcode`, expo-camera + Open Food Facts via `GET /api/products/barcode/{code}`); web = inserimento manuale
- Spesa da ricetta: `POST /api/recipes/{id}/to-shopping` (mancanti vs dispensa/lista, corsia stimata, nota "Per: …")
- Piano settimanale AI (`/weekly-plan`): `POST /api/ai/weekly-plan` (preview, Gemini) → `POST /api/ai/weekly-plan/save` (crea ricette con ingredienti normalizzati + pasti con recipe_id, sostituisce i 7 giorni)
- Famiglia (`/family`): households {id,name,owner_id,invite_code,members[]}; users.household_id; docs condivisi hanno household_id; `scope(user)` filtra own+household; join/leave migrano i doc; sync via polling React Query 8s
- Normalizzazione ingredienti lato backend (`norm_ingredients`) su create/patch ricette e output AI

## Env
Backend: MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, JWT_SECRET, APP_NAME=cucinasmart-ai
Frontend: EXPO_PUBLIC_BACKEND_URL

## Deploy readiness (iteration_7-9)
- App rinominata "Smart Kitchen AI" (slug smart-kitchen-ai, scheme smartkitchenai, bundle/package com.smartkitchenai.app)
- `DELETE /api/auth/account` + pulsante "Elimina account e dati" in Profilo (requisito App Store)
- httpx in requirements.txt; JWT_SECRET rimosso (inutilizzato); URL auth Emergent via env `EMERGENT_AUTH_SESSION_URL`
- Rimosso indice TTL su file_tokens (scadenza controllata a runtime); .env sanati; permessi Android POST_NOTIFICATIONS/VIBRATE
- deployment_agent: PASS

## Deploy fix (iteration_10)
- Aggiunti `GET /health` e `GET /` a livello root (probe K8s/nginx senza /api); index/storage init in background task allo startup così la porta 8001 si apre subito

## Feature aggiunte (iteration_11)
- Icona/splash generate (Nano Banana) in assets/images; app.json adaptive bg #7A9B76, splash #F5EFE3
- Onboarding 3 slide (`/onboarding`, flag AsyncStorage `smartkitchen_onboarding_done_v1`, store in `src/storage-keys.ts`), "Rivedi il tour" in Impostazioni
- Categorie alimentari (`src/categories.ts`: emoji + colori) su Spesa (righe/corsie), Dispensa, ingredienti ricetta, scorciatoie Oggi
- Ordine corsie (`/aisle-order`, draggable + frecce, AsyncStorage `smartkitchen_aisle_order_v1`) usato in Spesa e export
- Note + rating 1-5 su ricetta (`RecipeNotes`, PATCH rating/notes), ★ in griglia
- MealEditor (`src/components/MealEditor.tsx`): modifica pasto via Chef AI (preferenza → POST /ai/recipe → crea ricetta) o dal ricettario; in Calendario (4 slot/giorno incl. spuntino, PATCH/POST/DELETE meals) e nell'anteprima Piano AI
- Slot `spuntino` ovunque (backend SLOTS, piano AI 28 pasti, Oggi)
- Dispensa: sezioni Casa (`home`) e Usa e getta (`disposable`) anche nello scanner
- Spesa: "Presi → Dispensa" (`ToPantrySheet` + `DatePicker` inline): scadenza/prezzo/quantità/posizione per ogni preso → POST /shopping/to-pantry (top-up se stesso prodotto senza scadenza)
