# CucinaSmart AI — Product Requirements

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

## Env
Backend: MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, JWT_SECRET, APP_NAME=cucinasmart-ai
Frontend: EXPO_PUBLIC_BACKEND_URL
