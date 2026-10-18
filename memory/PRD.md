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

## Versioning (iteration_12)
- app.json: version 1.0.2, android.versionCode 3, ios.buildNumber 3. Incrementare versionCode/buildNumber a ogni nuova build; package definitivo com.smartkitchenai.app (la vecchia app com.emergent.appbuilder.caeb4l va disinstallata)

## UI batch verificato (iteration_13)
- Onboarding 3 schermate + gate post-login + "Rivedi il tour" in Impostazioni: E2E OK.
- Spesa per corsie con emoji/colori; schermata ordine corsie (frecce su web, drag su device) con persistenza locale: OK.
- Dispensa con emoji categoria; Ricette con note personali + voto 1-5 stelle e indicatore in griglia: OK (pytest 3/3 su PATCH /api/recipes/{id}).
- Hardening: PATCH /api/recipes/{id} ora accetta solo campi allowlist e clampa rating 0..5.
- Pendenti lato utente: nuova Publish → build Android (v1.0.2 / versionCode 3) e verifica deploy (/api/health 200).

## Feature aggiunte (iteration_14)
- Dieta personale per membro (Impostazioni → "La mia dieta / preferenze", `users.diet`) usata da Chef AI solo per i pasti di quel membro.
- Pasti per componente: `meals.member_id` (null = tutta la famiglia). Calendario mostra più pasti per slot con tag Tutti/nome; MealEditor ha "Per chi?"; Oggi mostra il pasto personale (se c'è) altrimenti quello comune.
- Piano settimanale AI: piano comune + piano separato per ogni membro con dieta (`member_plans`), salvati con member_id.
- Ricetta anti-spreco: card in Oggi "Salva ciò che sta per scadere" → POST /api/ai/expiring-recipe → salva ricetta e/o mette a pranzo/cena di oggi.

## Feature aggiunte (iteration_15)
- Dispensa non alimentare: sezioni Pulizia, Bagno, Usa e getta, Casa (`kind: non_food`). Senza scadenza stampata → data di fine stimata (default per sezione, poi appresa dai "Finito" per famiglia); bottone "Finito" registra la durata, azzera e rimette in lista spesa. Oggi mostra KPI "prodotti per la casa stanno finendo".
- Barcode anche per non-food (Open Food → Beauty → Products → Pet Food Facts) con sezione suggerita. Lettura scadenza da foto con AI (POST /api/ai/read-expiry) in Dispensa e scanner.
- Corsie spesa: Pulizia casa, Igiene e bagno, Usa e getta (auto dal nome, forzate lato backend).
- Calendario: chip membri (Tutti / per membro) con pasti personali + di famiglia; da Famiglia tocca un membro → calendario filtrato.
- UI: header gradient coi colori del logo (salvia/crema/terracotta), animazioni d'ingresso e feedback pressione (src/components/ui.tsx) su Oggi, Ricette, Dispensa, Spesa, Calendario.

## Shop & Accademia — iterations 16–19 (2026-10-18)
### User choices / scope
- RevenueCat managed connection confirmed. Coach EUR4.99/month; Ricettario PDF EUR4.99/export, Freezer lifetime EUR5.99, Lab EUR3.99–7.99/module, courses marketplace requested.
- Work on Shop first; barcode→expiry camera, household auto-reorder, nutrition/macros remain deferred.
- Two MVP options selected together. Implemented subscription Coach plus course foundation; single-purchase products remain unavailable, NOT represented as completed.
- Managed RevenueCat supports subscriptions only, not lifetime/consumable/individual-course purchases. No Stripe or invented purchase grants.
### Architecture / implementation
- RevenueCat project provisioned, entitlement pro, default offering monthly only. Keys only in frontend/.env; app.config.js via Constants, direct EXPO_PUBLIC fallback for web manifest compatibility. Details: memory/revenuecat.md.
- src/purchases.tsx: module-scope SDK configure in root, serialized login/logout/purchase/restore stable backend user_id, immediate account isolation, CustomerInfo listener/foreground refresh, error gates. Verify CURRENT SDK getAppUserID + !isAnonymous; originalAppUserId may be a legitimate historical anonymous alias. No backend pro state per managed playbook.
- /shop from Oggi and Settings: Coach offer, restore/manage, custom simulated Test Store confirmation, upcoming single-purchase cards.
- /food-coach: SDK-protected conversation, real existing Gemini integration, preferences/food pantry context, private history, medical disclaimer.
- backend/shop.py injected router: creator applications, approval, written lessons, preview/content redaction, learner follows/preview completion. Creator dashboard/editor/admin moderation.
- Admin SHOP_ADMIN_EMAIL configured as thevikingoftheweb@gmail.com; ONLY server-verified Google session. Password/signup same email never grants admin. No admin password created for owner.
- Internal ledger reads verified entries only; atomic earned→paid recording with reference, no money transfer; NO client endpoint creates sales. No real course purchases/earnings ingestion yet. Proposed 90/10 retained; tax/store fee basis not silently decided.
- Fixed prior theme TS error, signup diet response shape, nonfood-info empty state. DietEditor scroll/dedup and household diet defaults already present.
### Verification
- Iteration16 backend 10/10 tests pass (RBAC, course lifecycle/redaction/progress, atomic payout fixtures, real AI Coach/history isolation).
- Iteration17 SDK Test Store cancel/purchase→pro entitlement passed. Web-manifest missing config fixed with EXPO_PUBLIC fallback.
- Iteration18 backend smoke4/4; same-browser Chef→Nonna→Chef identity isolation, no inherited entitlement, monthly4.99 offer, restore, live AI Coach/history passed. Original-ID alias compatibility fixed with authoritative CURRENT SDK ID checks; same queue serializes purchase and logout. No anonymous purchases.
- Actual RN text-node root cause was an empty-string `||`/`&&` condition in CoachOffer; boolean-coerced. Global LogBox suppression removed, zero text-node warnings in final tests. TypeScript and JS/Python lint pass.
- Iteration19 course UI: admin preview/publish/manual payout registration, student search/follow/preview completion/My Courses persistence and locked lesson guard passed at390x844, no horizontal overflow. Admin/payment fixtures isolated; no real owner Google login or money transfer claimed. No production auth bypass routes/helpers introduced.
- Creator draft creation/submission UI passed iteration18; all fixture users/sessions/courses/earnings removed. Removed two orphan iteration16 student applications. Core app smoke passed. All new supported flows agent-tested, not user-confirmed.
- Actual native Android/iOS billing remains unverified; preview uses explicitly SIMULATED RevenueCat Test Store. Minor preexisting RN-web deprecation warnings are non-blocking.
### Backlog
- P0: real-store products/credentials and release-device purchase/restore/cancel testing; owner Google admin login verification. See payments panel FAQ. No outstanding blocker in implemented preview/test-store flows.
- P1: supported single-purchase integration; complete PDF/Freezer; paid lesson enrollment, verified sales/refunds, ledger accounting; 90/10 gross/net/tax policy; store-linked tariff management.
- P1: owner Google admin login on device; course video/media, final store legal documents.
- P2: Laboratorio, barcode→camera flow, auto-reorder, calories/macros.
