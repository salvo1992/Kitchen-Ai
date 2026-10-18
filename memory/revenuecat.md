# RevenueCat — subscription integration Test Store verified (2026-10-18)

- Job: 086661af-26b0-4200-8e79-64ce7083d0c3
- rc_project_id: proj94eb5ca1
- apple_app_id: app001300107e
- play_app_id: app6e3c94c5d4
- entitlement_lookup_key: pro
- offering_lookup_key: default
- $rc_monthly -> prode452a97013 (RevenueCat product resource ID), EUR 4.99 / P1M, no trial.
- Default annual package removed via proxy. Monthly product attached to pro; verified setup/products responses.
- Dashboard: https://app.revenuecat.com/projects/proj94eb5ca1
- Public SDK keys from build-config saved only in frontend/.env; exposed through app.config.js extra.revenuecat.
- All provisioning via $INTEGRATION_PROXY_URL/internal/revenuecat/projects/<job>/{status,setup,build-config,products}. Obtain authorization from refreshed playbook; never save it here.
- Price upsert: POST products with products [{package: $rc_monthly, price: 4.99, currency: EUR, period: P1M, prices:[{amount_micros:4990000,currency:EUR}]}]. SDK reads offering/packages, never hardcoded product IDs.

## Scope / blockers
- Managed integration supports subscriptions only. Consumable PDF exports, lifetime Freezer, paid course purchases NOT provisioned. Do not simulate successful orders or creator earnings.
- Subscription gating per managed playbook: client CustomerInfo.entitlements.active.pro only; no backend pro flags, webhooks, or premium endpoints.
- Dev/Expo Go/web: RevenueCat Test Store, explicitly simulated; custom confirmation required.
- Real transactions require matching App Store Connect / Play Console products and store credentials configured by owner, release-device testing. These were not provided/verified.
- FAQ in payments panel contains real-store setup instructions. No Stripe fallback authorized.

## Identity compatibility finding (2026-10-18)
- Managed playbook's originalAppUserId equality assumption fails for a legitimate aliased customer: Nonna SDK getAppUserID returns exact backend user_42cec3f443bc, but originalAppUserId retains a historical anonymous ID, active entitlements empty. Actual SDK diagnostic captured, no purchase attempted while blocked.
- Correct SDK identity check per RevenueCat docs: successful logIn(stableBackendId), getAppUserID() === backend ID, isAnonymous() === false. originalAppUserId is historical, not the current active ID. Never rewrite CustomerInfo or generate a new account ID to work around it.
- Source: https://www.revenuecat.com/docs/customers/identifying-customers and https://revenuecat.github.io/codelabs/guides/identify-users-login-logout.html
- Shared queue serializes purchases/restores AND identity changes, immediate UI entitlement clear on account changes; listener accepts only original alias captured for the currently bound user.
- Iter17 actual SDK TestStore purchase/cancel PASS; self-test restore/manage/Coach PASS. Iter18 same-browser Chef→Nonna→Chef PASS: Nonna sees EUR4.99 offer without inherited pro, Chef restores and uses real Coach. No anonymous active identity allowed.
- Iter19 admin/student course UI PASS using isolated verified-session and earning fixtures, cleaned afterward. These tests do not prove real owner Google login, actual course sales or external bank transfers.
- All supported preview flows verified; real native store transaction configuration/device testing still pending. Single-purchase products remain unavailable.