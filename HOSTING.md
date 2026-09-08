# Hosting Deccan Flame

Domain: **deccanflame.com**. Catering inbox: **deccanflame1@gmail.com**.

The app now has a static export command, `npm run build:static`, that generates `out/`. Authentication, votes and admin data continue to use Firebase from the browser. The existing `npm run build` command still builds the Cloudflare/Sites version.

## Choose the host

**Firebase Hosting is the recommended production option for this site.** GitHub Pages says it is not intended for running an online business and that Pages sites should not be used for sensitive transactions such as sending passwords. This restaurant site includes catering enquiries and password sign-in. The GitHub instructions below explain the technical setup, but do not establish that this use is permitted; use Firebase Hosting for the complete production site unless GitHub confirms your intended use is allowed. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

Buying the domain at Hostinger does not require moving it or buying Hostinger hosting. Change its DNS records to connect the selected host. Manage the records at the active DNS provider; if the domain uses Hostinger nameservers, use **hPanel → Domains → Domain portfolio → Manage → DNS / Nameservers**. [Hostinger DNS editor](https://www.hostinger.com/support/how-to-use-hostingers-dns-zone-editor/)

## Recommended: Firebase Hosting

1. Confirm `.env.local` contains the six Firebase web config values listed in `.env.example`. Use the same Firebase project for Authentication and Firestore.
2. Enable Email/Password sign-in and create the default Cloud Firestore database in Firebase Console if you have not already.
3. From the project folder, run:

   ```bash
   npm ci
   npm run test:unit
   npm run build:static
   node --test tests/static-export.test.mjs
   npx firebase login
   npx firebase deploy --config firebase.hosting.json --only hosting,firestore:rules --project YOUR_FIREBASE_PROJECT_ID
   ```

   Replace `YOUR_FIREBASE_PROJECT_ID` with `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from your local config. This last command publishes the website and the repository's Firestore rules; review both before running it. There is no need to run `firebase init` over the prepared configuration. [Firebase Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)
4. In **Firebase Console → Hosting → Add custom domain**, enter `deccanflame.com`. Follow the wizard and add its exact verification and address records in Hostinger. Add `www.deccanflame.com` too, with a redirect to the main domain. Wait for verification and HTTPS provisioning. Use the values shown for your project rather than guessed DNS values. [Firebase custom domains](https://firebase.google.com/docs/hosting/custom-domain)
5. In **Authentication → Settings → Authorized domains**, add `deccanflame.com` and `www.deccanflame.com`. Keep the Firebase `authDomain` configuration from your web app; changing your website domain does not require replacing it.
6. Register your owner account, then set its Firestore document `users/{uid}` role to `admin` in the console. Test `/dashboard/`, voting, signing out, and the catering draft on the final HTTPS domain.

## GitHub Pages technical setup

Only proceed with this host once you have resolved the usage limitation above.

1. Create or select a GitHub repository. Push the source and `package-lock.json`; `.env.local`, `node_modules`, `out/` and build logs are ignored. A public repository works with GitHub Free; private-repository Pages requires an eligible paid plan. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

   If the new repository is empty and this project is not already connected to it, use a separate remote so the existing `origin` is preserved:

   ```bash
   git add .
   git commit -m "Prepare v1 release with tests and static hosting"
   git remote add github https://github.com/YOUR_GITHUB_USERNAME/deccanflame.git
   git push -u github HEAD:main
   ```

   Replace the username and repository name. If you have already committed or connected this repository, use your existing GitHub remote and skip those setup commands.
2. Rename `.github/workflows/pages.yml.example` to `.github/workflows/pages.yml`, then commit and push it to the default branch. The workflow is manual: it runs only when you choose **Run workflow**.
3. In **repository Settings → Secrets and variables → Actions → Variables**, create all six `NEXT_PUBLIC_FIREBASE_*` variables from `.env.local`. These are the Firebase browser configuration values. Never put a service-account private key in a `NEXT_PUBLIC_*` variable.
4. In **Settings → Pages**, select **GitHub Actions** as the source. Run **Actions → Deploy GitHub Pages → Run workflow**. It validates the code, generates `out/`, and publishes that directory. The source repository and Cloudflare `dist/server` output cannot be served directly by Pages. [Custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
5. Add **deccanflame.com** under **Settings → Pages → Custom domain** before changing DNS. Then replace conflicting website records at Hostinger with:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | YOUR_GITHUB_USERNAME.github.io |

   The CNAME value contains no `https://` or repository path. Replace any old conflicting apex A/AAAA and `www` records, while preserving email MX/TXT records. If you keep IPv6 records, use GitHub's documented IPv6 addresses. DNS propagation can take up to 24 hours. [GitHub custom-domain configuration](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
6. Once the DNS check and certificate are ready, select **Enforce HTTPS** in Pages. Add both website domains to Firebase Authentication's authorized domains, and publish `firestore.rules` separately:

   ```bash
   npx firebase login
   npx firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
   ```

7. Visit `https://deccanflame.com/` and directly refresh `https://deccanflame.com/dashboard/`. This build targets the root of the custom domain. A temporary `USERNAME.github.io/REPOSITORY/` URL needs a separate base-path setup and is not a reliable preview of this root-domain build.

There is no server-side email handler: the catering form creates a draft addressed to the restaurant. The visitor must have an email app configured and must send the draft. No enquiry is submitted to a database.

## Local checks

```bash
npm run lint
npm run typecheck
npm run test:unit
npm test
npm run build:static
node --test tests/static-export.test.mjs
```

The Firebase integration suite uses a disposable `demo-deccan-flame` project and requires Java 21+:

```bash
npm run test:rules
```

After a static build, preview the exact exported files with:

```bash
python3 -m http.server 3100 --bind 0.0.0.0 --directory out
```

On a phone using the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:3100`. Python can serve this generated `out/` directory because it contains complete static pages. [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)
