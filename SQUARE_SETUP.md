# Square ordering

The `/menu` page loads items, categories, descriptions, images, variations, modifiers, prices and availability from Square. Guests can choose pickup or restaurant-managed delivery and pay on Square's hosted checkout page. Square stores the order and payment; the website never handles card data. Existing Firebase registration and voting remain independent of checkout.

## What needs connecting

1. A Square developer application and a matching access token/location ID. Start with **Sandbox**, then switch to Production only after a successful end-to-end test.
2. Menu items in that Square environment, including prices, taxes, modifiers and location availability. Sandbox and Production have separate catalogs and location IDs.
3. An active Square location with its timezone and business hours set. No hours means checkout is closed. The implementation uses these business hours, not Square Online delivery areas, pickup schedules, holiday overrides or ordering windows.
4. Firebase **Blaze** billing for Functions and a Firestore database. The static frontend alone cannot safely call Square with an access token.

Keep all access tokens out of chat, Git, browser code and `NEXT_PUBLIC_*` variables. A token for this restaurant's own account is enough; there is no multi-merchant OAuth flow.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, then fill in the Square **Sandbox** token and Sandbox location ID. `.dev.vars` is ignored by Git. Confirm the pickup preparation time, set `SQUARE_ORDERING_ENABLED=true`, and run:

```sh
npm run dev
```

Visit `http://localhost:3000/menu`. The existing vinext Worker handles `/api/square/menu` and `/api/square/checkout`, using the same Square service as Firebase Functions. Restart the server after changing `.dev.vars`. If you use a different local URL or port, add its exact origin to `ORDERING_ALLOWED_ORIGINS`.

When credentials are missing, the printed menu remains available with a call-to-order message. It cannot be checked out at old hardcoded prices. An empty connected Square catalog remains empty; it is never replaced with orderable demo items.

## Firebase production setup

Install the backend dependencies:

```sh
npm ci --prefix functions
```

Copy `functions/.env.example` to `functions/.env.deccanflame-website`, and fill in:

| Setting | Purpose |
| --- | --- |
| `SQUARE_LOCATION_ID` | The location that receives website orders |
| `SQUARE_ENVIRONMENT` | `sandbox` first; `production` for real payments |
| `SQUARE_ORDERING_ENABLED` | Explicit on/off switch; defaults to `false` |
| `SQUARE_PICKUP_MINUTES` | Estimated preparation time, 5–180 minutes; restaurant-approved value: `20` |
| `ORDERING_APP_ID` | Firebase web app ID; production checkout accepts App Check tokens only for this app |
| `SQUARE_MENU_CATEGORY_IDS` | Optional comma-separated Square category IDs; blank includes all eligible items at the location |
| `ORDERING_ALLOWED_ORIGINS` | Exact trusted website origins, comma-separated, without paths or trailing slashes |

Store the matching token using an interactive prompt, without putting it into shell history:

```sh
npx firebase functions:secrets:set SQUARE_ACCESS_TOKEN --project deccanflame-website
```

The backend uses Catalog read, Inventory read, Locations read, Orders read/write, and Payments read/write access. Community webhooks need Payments read to verify payment status. If using an OAuth token, grant those permissions. The merchant's own personal token should stay in Secret Manager.

### Required production protection: Firebase App Check

Register the Firebase web app with **App Check → reCAPTCHA Enterprise** in the Firebase console. Create a website key restricted to `deccanflame.com` and `www.deccanflame.com` in the same Google Cloud project. Add its public site key as `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` to the frontend build environment (`.env.local` locally and the same-named GitHub Actions repository variable). Never add a debug token to production. Set `ORDERING_APP_ID=1:234171924559:web:4714ccb40ffded7b8eea3a` in the Functions env file.

Production checkout verifies `X-Firebase-AppCheck` server-side and rejects missing, invalid, expired or wrong-app tokens before creating any order. App Check reduces automated abuse; it is not a guarantee against all bots or denial-of-service. Origin checking is an additional browser defense, not authentication. Public menu reads remain rate-limited but do not require App Check. Do **not** enable project-wide Firestore/Auth App Check enforcement until those separate client flows are registered and tested; this integration enforces it specifically on production ordering.

The local Worker is for Sandbox only and refuses production checkout. Firebase Functions is the supported production ordering backend. Leave `.dev.vars` using Sandbox; do not copy its test location or 24-hour testing schedule into production.

After reviewing the configuration and testing, deploy the function and rules first and then the website:

```sh
npm run check:production
npx firebase deploy --only functions:ordering:squareOrdering,firestore:rules --project deccanflame-website
npm run build:production
npx firebase deploy --only hosting --project deccanflame-website
```

These commands publish changes. Run them only when ready to release. Both `firebase.json` and `firebase.hosting.json` include the API rewrites and clickjacking/object-embedding protection headers. The GitHub workflow deploys **Hosting only**, so the function and rules must be deployed separately before publishing the ordering frontend. Future backend/rule changes also require a deployment. Main-branch hosting builds now require the App Check site key and run frontend/ordering tests before publishing. Preview builds do not allow production checkout.

The function belongs to the `ordering` codebase, so backend-only redeployments must use `--only functions:ordering:squareOrdering`. Backend dependencies retain a flat `uuid` override at `11.1.1`: a version-scoped nested override produced a missing-`uuid@9.0.1` lockfile error under npm 10 despite passing local npm 11 checks. Validate dependency changes with a clean install under both npm versions; do not delete the lockfile or downgrade `uuid` to bypass this error.

Start with `SQUARE_ORDERING_ENABLED=false` in production. Verify the live catalog, location, actual business hours/timezone, prices, modifiers and taxes first. Then set it to `true`, redeploy the function and perform a merchant-approved real payment/receipt/POS acceptance test. A passing Sandbox test does not verify live Apple Pay, production account readiness, staff notifications or production App Check domain registration.

For the production function identity, use a dedicated least-privilege service account where possible (Firestore access for rate limiting and secret access only to this Square token). Review project IAM, enable MFA on Firebase/Square/GitHub administrator accounts, configure billing alerts, and enable log/error monitoring before launch. The five-instance cap limits scale, not total monthly spend. Do not commit service-account keys or personal tokens.

Set a Firestore TTL policy on collection group `_orderingRateLimits`, field `expiresAt`, so old rate-limit buckets are removed. The existing rules already deny all browser access to this collection. Each instance shares limits through Firestore: 10 checkout attempts and 60 menu reads per IP per minute. Document creation/reads and TTL deletion incur normal Firebase charges; set billing alerts. The local development Worker does not use this Firestore limiter and is not the recommended production ordering host.

Add an exact Firebase Hosting preview origin to `ORDERING_ALLOWED_ORIGINS` only when you intentionally want checkout on that preview. Do not add a wildcard or deploy a production token for untrusted previews.

## Current delivery options

This policy replaces the older conditional community campaign. The menu now offers **Community Delivery**, **Delivery**, and **Pickup**.

- **Community Delivery:** free with no order-count or spending requirement. Checkout creation is allowed daily from **2 p.m. inclusive to 6:30 p.m. exclusive, America/Phoenix**. Delivery is **7–8 p.m. that same evening**. Customers choose a saved community. The recipient is `Name - Community`; Square receives a scheduled pickup fulfillment at 7 p.m. with a one-hour window and an explicit free-community-delivery staff note. It remains restaurant-managed delivery, not Square courier dispatch.
- **Delivery:** enter a U.S. street address and calculate a fee at **$1 per driving mile from the configured Square location**, rounded to the nearest cent, with **no maximum radius**. Google Routes calculates driving distance, not straight-line distance. The backend recalculates the route before checkout and rejects a changed fee for customer review. Address edits invalidate the UI quote. The address is passed to the Square fulfillment recipient, and the fee is a separate, taxable `SUBTOTAL_PHASE` service charge. Review the merchant's Square tax configuration and actual receipt treatment before launch; the website never invents a tax rate. No address or quote is persisted in this website's Firestore.
- **Pickup:** unchanged, using Square location business hours and the configured 20-minute preparation time. Paid Delivery also uses current Square business hours; community orders use their separate fixed ordering window. The global ordering pause switch applies to every type.

Community names remain editable in **Dashboard → Community delivery**. Ordering hours are now read-only, reflecting the confirmed fixed schedule. Existing `orderingSettings/communityDelivery` documents retain their community names and version; their old campaign times do not override the new 2–6:30 p.m. rule. The next community-list save persists the new hours. An empty list disables Community Delivery only. Invalid/unreadable settings fail closed. Concurrent admin edits are still protected by a versioned transaction.

There is no progress bar, minimum-goal checkbox, goal-dependent refund policy, or new community campaign ledger entry. `COMMUNITY_PROGRESS_ENABLED` is obsolete. The old progress endpoint returns a retired-policy response for older tabs. Existing campaign/ledger records and the signed webhook remain intact for reconciling orders created under the old policy; do not delete old financial records as part of this rollout.

### Google Routes setup — required for paid Delivery

1. Enable **Routes API** in the intended Google Cloud project with Maps Platform billing enabled. Create a **server-side API key restricted to Routes API**. Do not reuse the public Firebase or reCAPTCHA key. Set API quotas and billing alerts; quotes and checkout rechecks make billable route requests.
2. Store the key in production Secret Manager:
   ```sh
   npx firebase functions:secrets:set GOOGLE_MAPS_API_KEY --project deccanflame-website
   ```
   It is bound only to `squareOrdering`, never included in the browser bundle. The production function's new secret must exist before deployment.
3. For local Sandbox development, put the same kind of restricted server key in ignored `.dev.vars` as `GOOGLE_MAPS_API_KEY`, then restart `npm run dev`. Never use a `NEXT_PUBLIC_` variable for it. Without a key, the UI clearly marks paid Delivery unavailable and prevents checkout; Community Delivery and Pickup remain independently usable.
4. Test a known nearby address and a distant address, check displayed driving mileage and fee, change the address and confirm re-quoting, then verify the separate fee/address in Square Sandbox. PO boxes, malformed addresses, partial geocoding matches, missing driving routes and provider failures are rejected instead of producing a fabricated quote.
5. Deploy backend **before frontend** when ready:
   ```sh
   FUNCTIONS_DISCOVERY_TIMEOUT=120 npx firebase deploy --only functions:ordering:squareOrdering,firestore:rules --project deccanflame-website
   npm run build:production
   npx firebase deploy --only hosting --project deccanflame-website
   ```
   The GitHub main workflow publishes Hosting only. It does not configure the Maps API or deploy the function. These changes require an explicit release; local edits do not update the live site.

The quote endpoint is `POST /api/square/delivery-quote/`, protected by the same origin validation, JSON/body limits, production App Check and shared 10-per-minute per-IP bucket as checkout. Route responses contain only fee, distance and address; credentials and provider error bodies are never returned. The UI discloses Google/Square address sharing and credits Google for the route result.

### Operational limits and acceptance checks

- The 2–6:30 p.m. rule governs **creation of new community checkout links**. Square-hosted links already opened before the cutoff remain payable afterward; this implementation cannot retroactively close those links. The UI asks customers to finish payment by 6:30 p.m. Staff must review late payments and arrange fulfillment or refund manually. No automatic refunds, driver assignment, WhatsApp posting, international-address entry, delivery ETA promise or delivery-area validation beyond a usable driving route is added.
- Square can still label restaurant-managed delivery as pickup; the UI explains this. Check staff tickets and receipts for the community date/time, address and delivery fee. A successful automated test is not proof of account-specific Square checkout behavior.
- Menu price, stock, required modifiers and availability are revalidated at checkout. Square controls final discounts, taxes, tips and payment receipt. Old payment links do not reserve stock or change when delivery policy changes; review them during rollout.
- Do not enable production based only on mocked tests. Complete a merchant-approved Sandbox test of all three types, then a real-order acceptance check if authorized. This implementation turn does not create payments, change live configuration, push or deploy.

References: [Google Routes address waypoints](https://developers.google.com/maps/documentation/routes/specify_location), [Google Routes API](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [Square service charges](https://developer.squareup.com/reference/square/objects/OrderServiceCharge), [Square scheduled pickup fields](https://developer.squareup.com/reference/square/objects/OrderFulfillmentPickupDetails).

### Automated checks

```sh
npm run test:ordering
npm run test:unit
npm run typecheck
npm run lint
npm test
npm run test:static
```

Automated tests mock Square; they do not demonstrate that a particular merchant account is configured correctly. Before enabling production, use Square Sandbox to verify a real catalog load, required options, taxes, payment completion, receipt, correct location, pickup fulfillment and staff visibility. Also verify sold-out items, closed hours, retry behavior and the pause switch. Do not use a real card for Sandbox tests.

References: [Square catalog](https://developer.squareup.com/reference/square/catalog-api/list-catalog), [Square order checkout](https://developer.squareup.com/docs/checkout-api/square-order-checkout), [Create payment link](https://developer.squareup.com/reference/square/checkout-api/create-payment-link), [Firebase Hosting with Functions](https://firebase.google.com/docs/hosting/functions).
