# V1 release audit — 7 September 2026

The checked code passes **75 automated tests**, TypeScript, both production builds, and the browser checks described below. Several functional bugs were fixed during the audit. This is a tested release candidate, not a claim that every possible device, network condition or production configuration has been verified.

## Results

| Check | Result | Coverage |
| --- | --- | --- |
| TypeScript | Pass | Entire configured TypeScript project, including Cloudflare declarations |
| ESLint | Pass with 8 warnings | No errors; warnings concern raw `<img>` elements and image optimization |
| Component and utility tests | 43 passed | Auth forms, errors, password reset UI, dialog focus, account transitions, voting, dashboard gates, catering validation, navigation and bulk deletion |
| Firebase integration tests | 25 passed | Real Auth and Firestore SDKs against local emulators, including the repository's security rules |
| Cloudflare/Sites build | Pass | Existing `npm run build` output retained |
| Server-rendering tests | 3 passed | Homepage, dashboard response and unknown-route 404 |
| Static production build | Pass | Native Next.js export of the homepage, dashboard and error page into `out/` |
| Static artifact tests | 4 passed | Exported pages, referenced assets, anchor targets, image alt attributes and social metadata |
| Browser smoke checks | Pass | Final static output, public Firebase poll reads, sign-in dialog, registration validation, catering constraints and direct dashboard access |
| Responsive checks | Pass for tested conditions | No horizontal overflow at 320, 375, 390, 768 and 1280px; short 320×568 registration dialog also checked |
| Production dependency audit | 0 advisories | `npm audit --omit=dev` after compatible security updates |
| Full dependency audit | 15 advisories remain | 13 moderate and 2 high in development tools; see below |
| Credential-pattern scan | No matches in tracked source | Checked common private-key and token patterns; `.env.local` remains ignored |
| GitHub workflow template | YAML parsed successfully | Actual GitHub Actions execution has not been performed |

The emulator suites use only `demo-deccan-flame` and loopback endpoints. Test account creation, password resets and vote writes did not use the live Firebase project. Public poll reads were checked in the browser using the existing live web configuration.

## Bugs fixed

1. **Catering drafts had no recipient.** They now address `deccanflame1@gmail.com`. The form rejects whitespace-only required values, past event dates and invalid guest counts. It provides a direct email link and accurately describes the draft behavior. The minimum date is set after mounting so a static build does not cause a daily hydration mismatch.
2. **The original output required a server.** Request-dependent metadata prevented a static export. Metadata now uses the trusted `https://deccanflame.com` origin, and `npm run build:static` generates pages with directory URLs suitable for static hosting. The previous server build remains available.
3. **Missing Cloudflare types broke TypeScript checks.** Added the appropriate Worker types and a typed optional database binding.
4. **Account changes could temporarily retain the previous user's profile.** The provider clears the old profile immediately and removes its listener. Regression tests specifically verify that an old admin role is absent while a different account loads.
5. **The account dialog did not contain keyboard focus or reset sensitive fields on close.** It now traps Tab/Shift+Tab, locks background scrolling, restores focus, supports Escape, and remounts with cleared fields when reopened.
6. **Small-phone dialogs clipped content above the viewport.** The scrollable backdrop now uses safe vertical alignment. On the final 320×568 browser check, the registration dialog began at 12px and its close button at 31px; both were reachable.
7. **The navigation overlay lacked equivalent keyboard handling.** It now supports Escape, contained focus, an internal close button and an inert closed state. Focus restoration preserves anchor scrolling.
8. **Poll subscriptions could silently fail or appear open without a valid poll.** Missing/failed poll reads now disable voting; option read failures and empty active-option lists have clear states. The voting component remounts when account identity changes so the previous account's selection and counts are not reused.
9. **Hidden dish votes distorted visible percentages.** Visible totals and percentages now use the active contenders.
10. **Admin deletion used one unbounded batch and allowed votes to arrive during cleanup.** Deletion is divided into batches of at most 400 writes. Dish removal hides the contender first; vote reset closes the poll first and restores its previous open state after successful cleanup. Failure messages explain partial completion. A regression test covers 1,001 document references, and integration tests cover concurrent vote replacement.
11. **Dashboard listener failures looked like empty data.** Subscription errors are now surfaced. Empty trimmed poll/dish fields are rejected, and conflicting edit/delete buttons are disabled during operations.
12. **Existing render tests were stale.** Updated their expectations to match the current poll heading and configured-Firebase initial state, while adding actual behavior, security-rule and static-export tests.
13. **Known dependency vulnerabilities were present.** Applied compatible updates to Next.js, React, React Server Components, Vite, Cloudflare tools and eligible transitive dependencies. The production tree now has no reported advisories.

## Security behavior verified

The Firestore emulator enforced public poll/option reads while rejecting anonymous profile reads, result reads and votes. A signed-in member could create or replace only the vote stored under their own UID. Twelve concurrent writes to the same member's vote still produced one document.

Tests rejected votes for closed polls, hidden/missing options, forged timestamps, extra fields and malformed IDs. Members could not manage polls/options, delete votes, read another member's profile, overwrite another member's vote or promote themselves. Admin writes worked, and revoking the stored admin role removed write access. Unknown collections denied access.

The Auth emulator also verified normal registration and profile creation, duplicate registration rejection, sign-out notifications, invalid and valid passwords, and a complete password-reset cycle.

## Remaining limits and release follow-up

- **Development-tool advisories:** the remaining high findings concern `image-size` through the retained Vinext toolchain. Moderate findings involve Firebase CLI and Drizzle tooling, including transitive HTTP/parsing packages. These are not present in the production dependency audit. npm's remaining suggestions include older major versions of tools and a Vinext beta migration, so no forced dependency migration was applied. Review these before exposing development servers or processing untrusted inputs with these tools.
- **Mobile download size:** the four menu PNGs total about **9.12 MiB**. They are lazy-loaded, but can still be expensive on mobile data. Optimized image variants and an actual throttled performance measurement remain worthwhile; no Lighthouse score or measured production load capacity is claimed.
- **Voting scale and identity:** the tally subscribes to the complete vote collection for each signed-in visitor. This suits a small poll but is not an aggregation architecture for large traffic. Votes are limited per account, not per human, and the current flow does not require email verification. Registered users can read vote document IDs along with the tally data.
- **Production services:** emulator success does not prove that the deployed Firestore rules match this repository, that the live email/password provider and API-key restrictions are configured correctly, or that reset emails reach real inboxes. Verify these on the final HTTPS domain.
- **Catering delivery:** no email or catering enquiry was sent during the audit. The form opens a draft; the visitor still needs a configured mail app and must send it.
- **Browser coverage:** responsive desktop Chromium testing is not physical iPhone Safari or Android Chrome testing. Screen-reader conformance, offline interruption of every action, large-scale traffic, billing limits and real email delivery were not independently certified.
- **Deployment:** the domain and GitHub repository settings were not changed. The optional Pages workflow is an inactive `.example` file. Its remote CI run, final DNS and HTTPS certificate still need verification when you deploy.

## Hosting decision

Use [HOSTING.md](HOSTING.md) for the exact commands, the optional GitHub Pages template, Hostinger DNS records and Firebase Hosting setup.

Firebase Hosting is recommended for the complete business site. GitHub Pages' published limits restrict online-business hosting and discourage sensitive transactions such as sending passwords. A technically successful static export does not resolve that hosting-policy limitation. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## Reproduce the checks

With Node 22.13+ and Java 21+ installed:

```bash
npm ci
npm run test:all
npm audit --omit=dev
```

`test:all` runs lint, TypeScript, the component suite, the Cloudflare build/render suite, the static build/artifact suite and the emulator tests. Java 21 was downloaded into a temporary directory for this audit; the system's default Java installation was not replaced. Lint currently exits successfully with its eight image optimization warnings. The full `npm audit` intentionally remains nonzero for the development-tool findings above.
