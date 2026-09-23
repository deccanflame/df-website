# Launch review — 22 September 2026

This is a scoped implementation review, not a penetration test or a guarantee against compromise. No production deployment, real payment, or production account configuration was performed.

## Changes

- Removed arrow icons from “View full menu” and “Back home”; verified mobile navigation at 390px.
- Set pickup preparation to 20 minutes. Sandbox remains separate from the prepared, paused production configuration.
- Production checkout requires a server-verified Firebase App Check token for the expected web app, exact approved HTTPS origins, valid JSON, bounded request size, and server-authoritative Square catalog selections and prices.
- Shared Firestore rate limiting, bounded function instances/concurrency, sanitized errors, HTTPS Square redirect validation, security headers, and stricter profile creation rules are included.
- Production builds require an App Check site key. Hosting CI runs frontend and ordering tests; function/rule deployment remains a separate explicit step.
- Updated vulnerable dependencies. The final npm audit reports **zero known runtime/backend vulnerabilities** and **eight moderate development-tool advisories**. These are not a guarantee that dependencies contain no undiscovered vulnerabilities; continue monitoring updates.

## Verification

All 115 tests listed below passed across the final targeted runs. Earlier combined reruns encountered two timeouts after an elapsed-time jump and worker-start timeouts while the host reported load averages above 250. A single-worker retry passed all 51 frontend tests and all 26 ordering tests; both final builds and all rendered/static tests then passed separately. Run `npm run test:all` with Java 21+ again before deployment. The production-specific build correctly refuses to proceed without the missing App Check site key.

- Frontend/unit tests: 51 passed, including App Check retry behavior.
- Ordering/request-security tests: 26 passed.
- Rendered HTML tests: 5 passed; static-export tests: 6 passed.
- Firebase Auth/Firestore emulator tests: 27 passed, including denial of role escalation, forged profiles, unauthorized poll writes, and browser access to rate-limit records.
- Lint: zero errors, 10 existing/recommended image-optimization warnings. Type checking passed.
- Local mobile menu/cart checked at 390 × 844 without horizontal overflow; both requested navigation links are icon-free and work.
- Real Square Sandbox catalog loaded; browser checkout created a $13.99 test order with `PT20M` pickup preparation. Square's Sandbox Testing Panel reported successful simulated payment and order state OPEN. No real money was charged. POS notifications and receipt delivery were not independently verified.
- Built frontend files were checked for the configured Square access token: no match. Local credential files are ignored by Git.

## Required before launch

1. Supply the **production** Square location ID in the ignored Functions env file and store its matching token using Firebase Secret Manager. Never send it in chat or put it in frontend/GitHub public variables.
2. Register reCAPTCHA Enterprise with Firebase App Check for `deccanflame.com` and `www.deccanflame.com`. Add the public site key locally and to the GitHub Actions build variable. Live token verification still needs testing against this registration.
3. Confirm the production pickup address, hours/timezone, taxes, prices, modifiers, availability, and staff workflow. The Sandbox account currently uses a dummy Washington, DC address, one test dish, and 24-hour test hours; these are not production settings.
4. Review least-privilege IAM, administrator MFA, alerts/monitoring, and the Firestore `_orderingRateLimits.expiresAt` TTL policy. These remote controls were not changed or verified.
5. Follow `SQUARE_SETUP.md`: preflight, function/rules deployment, production build, Hosting deployment, then enable ordering and perform a merchant-approved live acceptance test. Main-branch Hosting builds will fail until the App Check public site key is configured.

The production preflight currently fails deliberately because the production location ID and public App Check site key are missing. The remote production secret has not been verified. Do not treat the Sandbox success as live launch approval.
