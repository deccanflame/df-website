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

## Restaurant operations

- Customers choose **Pickup** or **Delivery** before entering their name, phone, email and optional kitchen note. Both intentionally retain Square's `PICKUP` fulfillment: delivery is a tag for the restaurant's team, not Square-managed delivery or courier dispatch. Delivery notes always start with `Website delivery order`, so staff can distinguish them even outside the community window. Square may still display pickup wording; the website explains this for delivery customers. No address collection, delivery fee, driver assignment or delivery-area validation is added.
- In **Dashboard → Community delivery**, admins can add, rename and delete communities and edit the daily start/end time. Click **Save delivery settings** to apply all draft changes atomically. The timezone stays **America/Phoenix**, the start is inclusive and the end is exclusive; an earlier end time runs overnight. Equal start/end times are rejected. Up to 20 unique names of 1–60 characters are supported. An empty list disables the selector and community suffixes, not the delivery option. Concurrent edits are rejected with a reload prompt rather than overwriting another admin's changes.
- Settings are stored in `orderingSettings/communityDelivery` with a version and server timestamp. Only admins can write; only this public policy document is guest-readable. A missing document defaults to **Northgate, 19:00–20:00**; storage errors or invalid settings fail closed instead of silently restoring defaults. Functions reads it on every menu load and checkout; no new deployment is needed for future admin edits. Existing menu tabs refresh on return or after a checkout conflict. Already-issued Square payment links are unchanged.
- During the saved window, the server sets the recipient name to `Name - Community` and adds the community to the staff note. Outside it, and for every pickup order, the name stays unchanged. The window uses server time when checkout is requested, **not when payment completes on Square**. The backend ignores client-supplied policies and rejects removed/renamed communities so the browser can reload the latest list. Old clients without an order type continue as pickup.
- Deploy the updated **Firestore rules and ordering function before the frontend** using the production deployment commands above. Even localhost needs these rules if its Firebase configuration points to the live project. The local Sandbox worker derives `ORDERING_FIREBASE_PROJECT_ID` from `.env.local`'s public Firebase project ID (or an explicit `.dev.vars` override), reads the same public settings via Firestore REST, and never writes settings itself. Restart local development after changing that configuration. Staff should fulfill only paid orders in Square; confirm POS/KDS notification and printing behavior during acceptance checks.
- Square owns the checkout, final taxes, automatic discounts, optional tip and receipt. Configure tax rules on the actual catalog items in Square; the site does not invent a tax rate.
- Menu data is fetched when the page opens and rechecked before checkout. Prices in the cart are estimates; Square displays the final amount before charging.
- Stock is checked before checkout, but an open hosted link does not reserve inventory. Simultaneous purchases or an old checkout link can still race with availability changes. For scarce items, staff need to manage inventory and any refunds in Square. Pausing this site's checkout prevents new links but does not revoke already-issued Square payment links.
- The website deliberately does not mark orders as paid based on a URL parameter. Customers see Square's actual receipt. Signed webhooks now update community progress; no customer order-history page, delivery dispatch or scheduled pickup is implemented.
- Archived, location-excluded, alcoholic, service/subscription, variable-price and fractional-unit items are excluded. Sold-out variations are disabled. Text, nested, conversational or repeated-quantity modifier configurations are not supported; affected dishes show “Call to order” rather than dropping required choices. Ordinary single/multiple selections and modifier prices are supported.
- Optional category IDs define this website's menu. Square Online's own channel visibility is not used as an implicit website publishing filter; explicitly select categories if the account also contains retail or other items.
- The browser saves cart IDs/quantities and an idempotency key in session storage. Pickup contact details are not saved in browser storage or this site's Firestore.

## Acceptance checks

### Community delivery goals — deployment required before use

The menu now displays one progress bar for the selected community, with **5 paid orders OR $50** in combined food subtotal after discounts, excluding taxes, service charges and tips. Sharing the existing `/menu/` link in WhatsApp 10 minutes before the configured window shows a countdown. This website does not post messages to WhatsApp.

Each community/window/location/environment has its own campaign. Only completed, fully paid website community orders count; abandoning checkout adds nothing. Payment must complete **before the window ends**, even if checkout was opened earlier. The checkout acknowledgment and Square payment note disclose the goal and pickup/refund fallback. Two minutes after the cutoff are reserved for processing final notifications; later notifications can still reconcile payments actually captured within the window. There is no automatic refund, automatic customer message, or automatic closure of an already-issued Square link. Late payments are flagged in the private ledger and must be handled as pickup or refund.

Once reached, a goal stays confirmed even if later orders are refunded. Before confirmation, full refunds/cancellations remove an order and its subtotal; partial refunds conservatively subtract the entire refund amount from the food subtotal (Square amount-only refunds do not identify the food/tax/tip split). Staff must honor an already-confirmed delivery. Checkout requires explicit acceptance of this policy. With tracking enabled, delivery checkout outside the saved window is rejected; pickup remains available during business hours.

Setup (use a **separate Sandbox Firebase project** first; do not switch the live restaurant backend to Sandbox):

1. In Square Developer Dashboard, select the matching application/environment and add a webhook subscription. Use the HTTPS URL of `squareCommunityWebhook` in region `us-central1`. For a first deployment, register the standard URL `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/squareCommunityWebhook`; verify it against the deployment output. Subscribe to `payment.created`, `payment.updated`, `refund.created`, `refund.updated`, and `order.updated`, API version `2026-09-16`.
2. Store that subscription's signature key with `npx firebase functions:secrets:set SQUARE_WEBHOOK_SIGNATURE_KEY --project YOUR_PROJECT_ID`. Never paste it into frontend env variables or Git.
3. In `functions/.env.YOUR_PROJECT_ID`, set `SQUARE_WEBHOOK_NOTIFICATION_URL` to the **exact** URL registered in Square, `COMMUNITY_PROGRESS_ENABLED=false`, plus the matching Square environment/location and existing backend configuration. Keep the access token in Secret Manager.
4. Deploy the backend: `npx firebase deploy --only functions:ordering:squareOrdering,functions:ordering:squareCommunityWebhook,firestore:rules --project YOUR_PROJECT_ID`. Send Square's `order.updated` test event and confirm valid signatures receive HTTP 200. The sample order is safely ignored. A test event with a nonexistent payment cannot prove reconciliation; use a real Sandbox payment for the next step.
5. In the Sandbox project, set `COMMUNITY_PROGRESS_ENABLED=true`, redeploy `functions:ordering:squareOrdering`, and deploy the frontend. Verify an actual Sandbox community payment updates the bar, a second notification does not count twice, both goals work independently, and late payments/refunds behave correctly. Pickup must continue to work. A webhook pointing to localhost cannot receive Square events.
6. Repeat configuration with the **Production** subscription/key and production location/token. Enable the production flag only after webhook delivery is working and staff have reviewed the pickup/refund procedure. Deploy the backend before publishing the new frontend. Deployment and webhook tests do not issue payments/refunds; a merchant-approved paid-order acceptance test remains necessary.

The local vinext Worker deliberately has no privileged Firestore credentials or aggregate writes. It shows “tracking is not connected” and refuses in-window community checkout; pickup Sandbox testing continues to work. Use `npm run test:ordering`, `npm run test:unit`, and `npm run test:rules` for deterministic local coverage, or the separate Sandbox Firebase deployment for end-to-end payment testing. UI tests cover the populated bar/countdown without fabricated live totals.

The browser polls safe aggregate data every 20 seconds while visible; network failures retain totals with a stale warning. Firestore collections `communityCampaigns` and `_communityOrders` are server-only under the existing deny-all rules, including for browser admins. The private ledger stores Square order/payment IDs, campaign IDs, timestamps and acknowledgment version, not customer names/emails/phones or card details. The server verifies HMAC over the exact notification URL plus raw bytes, re-fetches current Square records, checks the configured location, and updates counters transactionally. Monitor failed webhook deliveries in Square; redeliver failed events after fixing outages. Retries are idempotent. Do not delete ledger records while payments can still be retried/refunded, or replay protection/history would be lost.

Change community names/times **between** campaigns only: changing a name/window creates a separate campaign and does not transfer previous payments. Already-created links keep their original campaign/cutoff. Review `communityCampaigns` and `_communityOrders` in the Firebase console for operational reconciliation, and use the corresponding Square order ID for pickup/refund handling. No refund decision is automated. Review Firestore/function usage and configure billing alerts; live polling adds reads.

Square references: [signature validation](https://developer.squareup.com/docs/webhooks/step3validate), [payment events](https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated), [order updates](https://developer.squareup.com/reference/square/webhooks/order.updated).

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
