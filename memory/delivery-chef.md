# Delivery Chef — implementation in progress

## User requirements / decisions
- Dedicated Home section, Glovo-like service/city discovery, chef & company profiles, specialties/services/reviews.
- Provider registration inside Shop & Accademia; prices, instant and/or quote bookings, appointments, orders, financial trends and reviews.
- All Italy: verified geocoded municipality + provider radius (centroid coverage approximate, disclosed).
- Commission10%, automatically retained in platform-controlled payment; no cash collection/debt-chasing. Automatic provider payouts via Connect dedicated onboarding.
- Also finish prior digital products: course sales, PDF4.99/export, Freezer5.99 lifetime, Lab3.99–7.99. Must remain native digital RevenueCat, NOT Stripe physical-service flow.

## Integration blockers (verified, do not hide or simulate)
- Process STRIPE_API_KEY exists but is a managed placeholder. Official /v1/account401 diagnosed by integration expert: managed hosted-checkout wrapper supports checkout ONLY, no Connect onboarding/transfers/payouts/refunds. No real payment attempted.
- Selected separate-charges/transfers Connect flow needs STRIPE_CONNECT_SECRET_KEY + STRIPE_CONNECT_WEBHOOK_SECRET in backend secure env (not provided). Do NOT ask user to paste keys in chat, never send managed placeholder to direct Stripe again. Money endpoints disabled until configured; no fallback to cash, mock payouts, or simple merchant Checkout.
- Stripe fee/dispute/refund exposure remains platform responsibility; 10% is gross commission before processor fees. Provider90% transfer after completion/hold; bank payout separate Stripe event.
- Existing RevenueCat managed subscription remains untouched. Single-purchase store products / server-verified fulfillment configuration still missing; do not claim real digital sales ready without it.

## New implementation files
- backend/delivery_models.py validated price/city/provider/service/booking/review inputs.
- backend/delivery_geo.py explicit Nominatim search (no autocomplete), shared Mongo throttle1.1s/cache; provider configurable env, real coords only.
- backend/delivery_payments.py Connect-only calls, hosted onboarding/Checkout, serialized money leases, source-charge delayed90% transfer, refunds/reversal, reconciliation worker.
- backend/delivery.py CRUD, approved provider public catalogue, private bookings, quoted/instant mode, overlapping slot locks, verified reviews, admin finance/moderation/disputes, signed webhooks.
- frontend/src/utils/upload.ts native-safe multipart uploadForm (expo/fetch native file URI->Blob); no base64 for new uploads.
- Router + background initialization registered in server.py; existing app routes preserved.

## Default operational policy (shown before request/payment)
- Full refund before event starts; afterward customer reports problem for review. Chef cancellation refunds client.
- Provider declares served only after scheduled end; customer confirms completion after end.
- Confirmed completion holds24h before provider transfer. Without customer confirmation, auto-complete48h after provider served declaration; no unresolved dispute/refund permits transfer.
- Provider city radius approximate between municipality centers; exact address private to order parties/admin. Slots in Europe/Rome time, 30min start increments, exclusive overlapping bucket locks.
- Live legal/tax terms and Stripe Connect availability require owner validation; not escrow or guaranteed risk-free funds.

## Pending next
- Finish frontend customer/provider/admin flows and tests; check all money-state concurrency/idempotency before enabling real Connect.
- Then implement digital feature functionality + real verification/config guards rather than merely upcoming cards.