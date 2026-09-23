# Square ordering

The `/menu` page loads items, categories, descriptions, images, variations, modifiers, prices and availability from Square. Guests can build a pickup order and pay on Square's hosted checkout page. Square stores the order and payment; the website never handles card data. Existing Firebase registration and voting remain independent of checkout.

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

The backend uses Catalog read, Inventory read, Locations read, Orders read/write, and Payments write access. If using an OAuth token, grant those permissions. The merchant's own personal token should stay in Secret Manager.

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

These commands publish changes. They have **not** been run by this integration task. Both `firebase.json` and `firebase.hosting.json` include the API rewrites and clickjacking/object-embedding protection headers. The GitHub workflow deploys **Hosting only**, so the function and rules must be deployed separately before publishing the ordering frontend. Future backend/rule changes also require a deployment. Main-branch hosting builds now require the App Check site key and run frontend/ordering tests before publishing. Preview builds do not allow production checkout.

The function belongs to the `ordering` codebase, so backend-only redeployments must use `--only functions:ordering:squareOrdering`. Backend dependencies retain a flat `uuid` override at `11.1.1`: a version-scoped nested override produced a missing-`uuid@9.0.1` lockfile error under npm 10 despite passing local npm 11 checks. Validate dependency changes with a clean install under both npm versions; do not delete the lockfile or downgrade `uuid` to bypass this error.

Start with `SQUARE_ORDERING_ENABLED=false` in production. Verify the live catalog, location, actual business hours/timezone, prices, modifiers and taxes first. Then set it to `true`, redeploy the function and perform a merchant-approved real payment/receipt/POS acceptance test. A passing Sandbox test does not verify live Apple Pay, production account readiness, staff notifications or production App Check domain registration.

For the production function identity, use a dedicated least-privilege service account where possible (Firestore access for rate limiting and secret access only to this Square token). Review project IAM, enable MFA on Firebase/Square/GitHub administrator accounts, configure billing alerts, and enable log/error monitoring before launch. The five-instance cap limits scale, not total monthly spend. Do not commit service-account keys or personal tokens.

Set a Firestore TTL policy on collection group `_orderingRateLimits`, field `expiresAt`, so old rate-limit buckets are removed. The existing rules already deny all browser access to this collection. Each instance shares limits through Firestore: 10 checkout attempts and 60 menu reads per IP per minute. Document creation/reads and TTL deletion incur normal Firebase charges; set billing alerts. The local development Worker does not use this Firestore limiter and is not the recommended production ordering host.

Add an exact Firebase Hosting preview origin to `ORDERING_ALLOWED_ORIGINS` only when you intentionally want checkout on that preview. Do not add a wildcard or deploy a production token for untrusted previews.

## Restaurant operations

- Orders are **pickup only**, with a name, phone, email and optional kitchen note collected before payment. Orders include a `PICKUP` fulfillment and appear in Square. Staff should fulfill paid orders in Square; confirm your POS/KDS notification and printing behavior during the sandbox and live acceptance checks.
- Square owns the checkout, final taxes, automatic discounts, optional tip and receipt. Configure tax rules on the actual catalog items in Square; the site does not invent a tax rate.
- Menu data is fetched when the page opens and rechecked before checkout. Prices in the cart are estimates; Square displays the final amount before charging.
- Stock is checked before checkout, but an open hosted link does not reserve inventory. Simultaneous purchases or an old checkout link can still race with availability changes. For scarce items, staff need to manage inventory and any refunds in Square. Pausing this site's checkout prevents new links but does not revoke already-issued Square payment links.
- The website deliberately does not mark orders as paid based on a URL parameter. Customers see Square's actual receipt. No order-history page, delivery dispatch, scheduled pickup or payment webhook is implemented in this version.
- Archived, location-excluded, alcoholic, service/subscription, variable-price and fractional-unit items are excluded. Sold-out variations are disabled. Text, nested, conversational or repeated-quantity modifier configurations are not supported; affected dishes show “Call to order” rather than dropping required choices. Ordinary single/multiple selections and modifier prices are supported.
- Optional category IDs define this website's menu. Square Online's own channel visibility is not used as an implicit website publishing filter; explicitly select categories if the account also contains retail or other items.
- The browser saves cart IDs/quantities and an idempotency key in session storage. Pickup contact details are not saved in browser storage or this site's Firestore.

## Acceptance checks

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
