# Deccan Flame

A responsive restaurant experience with Firebase email/password accounts, live special-dish voting, and an admin-only poll dashboard.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the exact `Local:` URL printed by the terminal (normally `http://localhost:3000`).

## Connect Firebase

1. Create a Firebase project and add a Web app.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Create a Cloud Firestore database.
4. Copy `.env.example` to `.env.local` and replace every placeholder with the Web app configuration values.
5. Restart `npm run dev` after changing environment variables.
6. Deploy `firestore.rules` to the Firebase project before accepting real registrations or votes.

The browser-safe Firebase web configuration belongs in `NEXT_PUBLIC_*` variables. Access control is enforced by `firestore.rules`, not by hiding UI elements.

## Bootstrap the first admin

1. Register a normal account on the website.
2. Open Firestore in Firebase Console and find `users/{uid}` for that account.
3. Change its `role` field from `user` to `admin`.
4. Refresh the website. **Dashboard** will appear in the hamburger menu for that account.

All later poll settings and dish options can be managed at `/dashboard`. The dashboard can open/close voting, edit the poll message, add/edit/hide/delete contenders, and reset votes.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```



