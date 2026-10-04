# Zimi Live admin console

## How it fits with the React Native app

The phone app and the admin console are two separate products that share one backend.

```
            ┌──────────────── Backend API (your server) ────────────────┐
            │ accounts · wallets · calls · KYC · payouts · rules · audit │
            └───────────▲──────────────────────────────▲─────────────────┘
                        │ HTTPS                        │ HTTPS
   Phone app (React Native / Expo)          Admin console (web, desktop only)
   App.tsx shows web/ in a WebView          web/admin.html
   Ships to the Play Store                  Deployed to admin.zimilive.in
```

- The phone app is built with React Native, but every screen is the web bundle in `web/`, shown inside a WebView. React Native does not limit what the admin console can do.
- The admin console is a normal web page, `web/admin.html`. It never ships inside the phone app; `assets/aurora-bundle.js` does not contain it.
- Both talk to the same backend. A rule changed in the admin console, such as the entry fee hold, is saved by the backend, and the app reads it from there.

## Builds

| Command | Output | Use |
| --- | --- | --- |
| `npm run build:web` | `dist/` (+ `dist/admin/` for previews) | Public website and the app bundle |
| `INCLUDE_ADMIN=0 npm run build:web` | `dist/` without the admin page | Production public website |
| `npm run build:admin` | `admin-site/dist/index.html` | Production admin console |

## Deploying to production

1. **Public site (existing Vercel project).** Add the environment variable `INCLUDE_ADMIN=0`, so the public site no longer serves `/admin`.
2. **Admin console (new Vercel project).** Import the same GitHub repository again and set **Root Directory** to `admin-site`. Its `vercel.json` builds the console and adds security headers (no indexing, no framing, HTTPS only).
3. **Domain.** Point `admin.zimilive.in` at the new project.
4. **Lock the door in front of it.** Turn on Vercel Deployment Protection (password or Vercel login), or put the domain behind Cloudflare Zero Trust so only company Google accounts can even load the page. This is in addition to the admin's own sign-in.

## What the backend must provide before launch

The console is a front end with demo data. Every button maps to an API call that the server must check:

- **Sign-in:** email + password + authenticator code (TOTP). Short sessions (8 hours), sign out everywhere, log device and IP.
- **Roles on the server:** the same map as `ROLES` in `web/admin.html` (Super admin, KYC reviewer, Finance, Moderator, Support). The server rejects any action outside the admin's role; hiding buttons is not security.
- **Two-person approval:** rule changes and payouts above ₹50,000 are saved as requests. The server applies them only after a different admin approves.
- **Audit log:** every write records who, what, when, before and after. Nobody can edit or delete entries.
- **Data protection:** KYC images are stored encrypted with short-lived signed URLs, ID numbers are masked except to KYC reviewers, and payouts go through the payment provider's API (not manual transfers).
- **Rules the app reads:** entry fee hold, early-ending limit and penalty, payout unlock, minimum withdrawal, payout rate, host share, coin packs, gifts, rewards and promo codes all come from the API. The app no longer hard-codes them.

## Suggested path from prototype to production

1. Keep `web/admin.html` as the agreed design and behaviour.
2. Rebuild it as a React + TypeScript web app (Vite or Next.js) in an `admin/` folder, using the same screens. React on the web is the natural fit for a team that already writes React Native.
3. Generate API types once and share them between the app and the console, so a field renamed on the server breaks the build instead of production.
4. Add end-to-end tests for the money paths: KYC approve, payout with second approval, refund, rule publish.
