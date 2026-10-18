#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 16 (main agent) — Shop, managed RevenueCat, Food Coach, course foundation
### FINAL — iterations 16–19 (2026-10-18)
- Implemented scope verified: backend10/10 plus identity/privacy smoke4/4; monthly SDK TestStore purchase/cancel/restore; Coach real AI/history; same-browser Chef→Nonna→Chef isolated; creator draft/submit; admin preview/publish/manual payment registration; student search/follow/preview completion/My Courses and locked lesson guard. All current reports read, reported app issues fixed and retested.
- Definitive fixes: Constants web manifest fallback, empty-string JSX condition boolean coercion (NOT Notice formatting), SDK CURRENT ID vs historical originalAppUserId alias. Shared operation/identity queue. No global LogBox suppression or auth test bypasses.
- Iter19 admin UI harness issue resolved via isolated normal-login fixture setup, no product auth change. Admin and ledger fixtures cleaned; real owner Google login/native real billing still pending. Two orphan it16 test applications removed separately.
- Supported scope only: subscription Coach + course content/moderation/previews/progress/ledger foundation. PDF/Freezer/Lab/paid-course purchases not yet implemented, explicitly marked unavailable. Store real money transactions require owner Apple/Google configuration/device verification; Test Store explicitly SIMULATED.
- Final reports: test_reports/iteration_16.json (10 backend pass), iteration_17.json (purchase pass, outdated text warning fixed), iteration_18.json (identity pass, outdated admin test limitation resolved), iteration_19.json (course admin/student flow100% pass). No new app bugs remain in implemented scope.
### Focused retest update
- Iteration17 Test Store actual SDK simulated purchase PASS: valid purchase activates pro. Remaining text-node issue definitively fixed at CoachOffer retry guard: string OR condition returned empty string; now boolean-coerced. Global LogBox suppression removed. Full next screenshot saw ZERO text-node errors; Coach reply/history, restore, manage passed.
- Account switch issue discovered in self-test: Nonna correct SDK getAppUserID=user_42cec3f443bc, originalAppUserId=$RCAnonymousID historic alias, entitlements empty. Strict original==backend rejected legitimate account. Confirmed via real SDK diagnostic + RevenueCat docs identifying-customers and codelab identify-users-login-logout. Updated checks to successful logIn + current getAppUserID exact stable backend ID + !isAnonymous. Historical original is only used to filter stale listener events, never as active identity.
- All purchase/restore/logIn/logOut operations now serialized in same queue, with account match before and after store operation. Entitlements remain solely returned CustomerInfo.active.pro, never local grant. Pending focused retest for this critical identity fix.
- Use visible route locators after switch: Expo Router may retain hidden stack screens, e.g. locator('[data-testid="oggi-shop"]:visible'). No route/onboarding bypass needed.
- Backend iteration16 10/10 passed; do not repeat whole backend. Admin email now backend/.env SHOP_ADMIN_EMAIL, fail-closed absent; same value. Fixture admin password removed from test script, user row is test-only verified session, cleanup retained.
- No onboarding bypass: intended first-login tour. Deterministic tested path is login -> await onboarding-skip -> click -> await oggi-shop -> click. Shop confirmed renders.
- ACTUAL RC blocker discovered: web Constants manifest omitted new extra keys. Fixed with static EXPO_PUBLIC fallback (real same configured keys), kept native Constants lookup. Price now actual €4.99 / month; custom test confirmation and cancel both screenshot-verified.
- Retest requires SDK Test Store checkout SUCCESS -> pro -> Coach -> restore/manage. Last screenshot clicked confirm-test-purchase but ended before awaiting SDK UI, so no purchase performed yet. All ops must await resulting SDK UI.
- RN dev warning empty text-node was seen. Troubleshooter suggested separate Notice components onto lines; applied but verify, diagnose precisely if still seen (no errors suppression).
user_problem_statement: "Shop in italiano, RevenueCat native store purchases, Coach EUR4.99/month, courses creator/admin/student, creator90/app10 internal balances and manual payment recording; authorized admin thevikingoftheweb@gmail.com. User: RevenueCat is connected, proceed with integration."
backend:
  - task: "Course RBAC, moderation, public preview redaction, learning progress, ledger paid transition, real AI Coach history"
    implemented: true
    working: NA
    needs_retesting: true
    priority: high
    file: /app/backend/shop.py
    status_history:
      - agent: main
        working: NA
        comment: "New injected router, trusted Google-session-only admin, approved creators, no client sale/grant endpoint, paid content withheld, only preview progress; only verified ledger records can be marked paid atomically. No real course purchase integration exists yet."
frontend:
  - task: "Shop RevenueCat purchase and restore, identity isolation, actual Coach and course screens"
    implemented: true
    working: NA
    needs_retesting: true
    priority: high
    file: /app/frontend/src/purchases.tsx
    status_history:
      - agent: main
        working: NA
        comment: "Module-scope configure, serialized login/logout stable user_id, SDK entitlement only. Test Store with custom simulated purchase confirmation. Monthly package only. Core compiler/lint clean and external login screenshot passed."
test_plan:
  current_focus: [RevenueCat monthly pricing and entitlement, identity switching and restore, Coach AI reply/history, course RBAC/creator/moderation/student preview progress, no unauthorized admin, no paid content leaks, no unverified payout, phone layout]
  test_all: false
agent_communication:
  - agent: main
    message: "Use /app/memory/test_credentials.md. Keys in frontend/.env; RC project proj94eb5ca1. RevenueCat Test Store is simulated by provider, no mocked grant API. Unsupported single-purchase catalogue explicitly upcoming. No real course sales/balances. Admin requires verified Google exchange session, not email alone; use isolated fixtures for role tests, never grant Chef/Nonna admin or create owner-password. If credentials created record and cleanup. Source /app/frontend/src/shop-ui.tsx includes testIDs; pages /shop /food-coach /courses /creator /course-editor /course/[id] /my-courses /shop-admin /shop-info. Native real billing not testable here. Test SDK purchase, cancellation, restore and identity log BEFORE purchase."

## Iteration 14 (main agent) — Dieta per membro, pasti per componente, ricetta anti-spreco
- Backend: PATCH /api/auth/profile {name?, diet?}; meals hanno `member_id` (null = tutti); POST/PATCH /api/meals validano member_id (utente o membro household);
  POST /api/ai/expiring-recipe (1 ricetta con prodotti in scadenza ≤3gg, rispetta dieta utente); POST /api/ai/weekly-plan ritorna `member_plans` (piano separato per ogni membro con diet);
  POST /api/ai/weekly-plan/save accetta `member_plans:[{member_id, days}]` → meals con member_id; /api/ai/recipe accetta `member_id` (rispetta la dieta); /api/household members include `diet`; signin ritorna anche diet/household_id.
- Frontend: Impostazioni → "La mia dieta / preferenze" (DietEditor); Oggi → ExpiringRecipeCard (Chiedi al Chef → preview → Metti nel menu di oggi / Salva ricetta); Calendario → più pasti per slot con tag Tutti/membro,
  MealEditor con selettore "Per chi?" quando c'è famiglia; Piano settimanale → sezioni "Menu della famiglia" + "Menu di <membro>"; Famiglia → dieta sotto ogni membro.

## Iteration 15 (main agent) — Dispensa non-food, OCR scadenza, calendario per membro, UI refresh
- Backend: pantry `kind` (food|non_food), locations cleaning|hygiene|disposable|home; non-food senza data → `expires_at` stimato (`is_estimate`, `estimate_source`, DEFAULT_DURATION_DAYS) ;
  GET /api/pantry/duration-estimate?name&location; POST /api/pantry/{id}/finished → impara durata (product_durations), qty 0, rimette in spesa; POST /api/ai/read-expiry {image_base64} → {expires_at};
  barcode: fallback Open Food Facts → Open Beauty Facts → Open Products Facts → Open Pet Food Facts, ritorna kind/location; guess_aisle con corsie "Pulizia casa", "Igiene e bagno", "Usa e getta" (prioritarie);
  POST /api/shopping forza corsia non-food; /api/household members hanno sempre `diet`; ai/expiring-recipe usa solo alimentari.
- Frontend: categories.ts (detersivi/igiene/usaegetta + LOCATIONS condivise), aisle-order AISLES +3; Dispensa riscritta (7 sezioni, header gradient, badge "~Xg"/"finisce circa il", bottone Finito, ExpiryReader);
  scan-barcode (sezioni nuove, tag alimentare/casa, ExpiryReader); ToPantrySheet usa LOCATIONS; Calendario: chip membri (cal-member-all / cal-member-<id>) + ?member= da Famiglia (tap membro);
  UI: src/components/ui.tsx (GradientHeader, Enter, Appear, Bounce) applicati a Oggi/Ricette/Dispensa/Spesa/Calendario; Oggi KPI "prodotti per la casa stanno finendo" (kpi-running-out); Spesa auto-corsia dal nome.
