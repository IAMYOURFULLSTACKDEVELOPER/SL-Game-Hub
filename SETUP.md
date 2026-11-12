# SL Game Hub - Complete Setup Guide

This guide walks you through setting up and running the whole project: the Convex backend, the web app and the mobile app.

## Prerequisites

- Node.js 18+ and npm
- Git
- A Convex account (free) for a cloud deployment, or nothing at all for a local one
- Expo Go on a phone (for the mobile app)

---

## Step 1: Clone and install

```bash
git clone <repository-url>
cd sl-game-hub
npm install
```

This installs every workspace:
- `packages/shared` (game engines, validation, i18n; used everywhere)
- `packages/backend` (Convex schema and functions)
- `apps/web` (Next.js web app)
- `apps/mobile` (Expo mobile app)

---

## Step 2: Start the Convex backend

```bash
npm run dev:backend
```

On the first run the Convex CLI asks you to log in and create a project. You can also choose a local
deployment, which runs on your computer and needs no account. It then:

- pushes `packages/backend/convex/schema.ts` and all functions (there are no SQL migrations),
- writes `CONVEX_DEPLOYMENT` and `CONVEX_URL` to `packages/backend/.env.local`,
- keeps watching `convex/` and redeploys whenever you save.

Leave it running in its own terminal.

---

## Step 3: Configure authentication (once per deployment)

In a second terminal, from the repo root:

```bash
npm run setup:auth
```

This generates the RS256 key pair Convex Auth uses to sign sessions and stores `JWT_PRIVATE_KEY`, `JWKS`
and `SITE_URL` (default `http://localhost:3000`) on the deployment.

### Optional: password-reset emails

Password reset sends a 6-digit code by email through [Resend](https://resend.com):

```bash
cd packages/backend
npx convex env set AUTH_RESEND_KEY re_your_key
npx convex env set AUTH_EMAIL_FROM "SL Game Hub <noreply@your-domain>"   # optional
```

Without a key, reset requests fail quietly, and players still see the usual "code sent" message.

### Optional: wallet (Monime mobile money)

Top-ups by USSD and withdrawals to mobile money go through [Monime](https://monime.io). In the Monime dashboard,
create an API token, then go to Developer → Webhooks and create a webhook (HMAC-SHA256). Point it at
`https://<your-deployment>.convex.site/monime/webhook` (the `CONVEX_SITE_URL` in `packages/backend/.env.local`)
with the events `payment_code.completed`, `payment_code.expired`, `payment_code.cancelled`, `payout.completed` and
`payout.failed`. Then:

```bash
cd packages/backend
npx convex env set MONIME_ACCESS_TOKEN mon_test_...
npx convex env set MONIME_SPACE_ID spc-...
npx convex env set MONIME_WEBHOOK_SECRET <webhook secret>
npx convex env set WALLET_FEE_BPS 0          # optional platform fee, 250 = 2.5%
```

Without these, the wallet page says top-ups are not switched on. To try money rooms without paying anything, run
`npx convex env set WALLET_TEST_CREDITS true` on a dev deployment, then
`npx convex run wallet:testCredit '{"username":"you","amount":5000}'` (5000 = SLE 50). Never set this in production.

---

## Step 4: Seed initial data

```bash
npm run seed
```

This adds (and is safe to run again):
- the 16 districts
- game categories
- the 8 planned games (UNO stays "coming soon")

---

## Step 5: Configure the apps

### Web (`apps/web/.env.local`)

```bash
cp apps/web/.env.example apps/web/.env.local
```

```env
NEXT_PUBLIC_CONVEX_URL=<the CONVEX_URL from packages/backend/.env.local>
```

### Mobile (`apps/mobile/.env`)

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

```env
EXPO_PUBLIC_CONVEX_URL=<the same URL>
```

A phone cannot reach `127.0.0.1` on your computer, so use a cloud deployment URL for the mobile app
(or your computer's LAN address if you run a local deployment).

---

## Step 6: Run the web application

```bash
npm run dev:web
```

Open http://localhost:3000. For a production build: `npm run build:web`.

### Web app features
- Game library and built-in games (Snake, Snake & Ladder, Checkers, Chess, Word Search, Scrabble, Dice)
- Accounts (sign up, sign in, password reset by emailed code)
- Leaderboards, tournaments, achievements, shop
- Live chat and live online Dice rooms
- Admin dashboard

---

## Step 7: Run the mobile application

```bash
npm run dev:mobile
```

Scan the QR code with Expo Go (or press `i` / `a` for a simulator). If Expo reports version mismatches,
run `cd apps/mobile && npx expo install --fix`.

---

## Step 8: Verify setup

### Web
1. Open http://localhost:3000 and sign up.
2. Browse the library, open a game and play it.
3. Check your profile, the shop and achievements.
4. Open Dice → Online in two browsers, create a room in one and join it from the other.

### Admin
1. Make your account an admin:

```bash
cd packages/backend
npx convex run seed:makeAdmin '{"username":"your-username"}'
```

2. Open /admin to manage games, players, reports, game uploads and chat moderation.

### Looking at the data
`cd packages/backend && npx convex dashboard` opens the dashboard for the deployment (tables, logs,
functions, environment variables). Local deployments can be browsed with `npx convex data <table>`.

---

## Common issues

### "Environment variable NEXT_PUBLIC_CONVEX_URL is not set"
Set it in `apps/web/.env.local` (Step 5) and restart `npm run dev:web`.

### Sign-in fails with a server error
Run `npm run setup:auth` for this deployment (Step 3). `npx convex env list` (in `packages/backend`)
should show `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL`.

### The library is empty
Run `npm run seed` (Step 4).

### Mobile app can't connect
Check `EXPO_PUBLIC_CONVEX_URL` in `apps/mobile/.env`, make sure it is reachable from the phone (not
`127.0.0.1`), and restart Expo with `npx expo start --clear`.

### TypeScript errors about `convex/_generated`
`npm run dev:backend` regenerates `packages/backend/convex/_generated`. Keep it running while you edit
the schema or functions.

---

## Development workflow

### Changing the backend
1. Edit `packages/backend/convex/schema.ts` or a function module.
2. `npm run dev:backend` pushes it straight away and regenerates the typed `api`.
3. Call it from the web (`query` / `mutate` in `apps/web/src/lib/convex.ts`, or `useQuery` inside a
   `<ConvexIsland>` for live data) or from mobile (`useQuery` / `useMutation`).

Every public function must check access itself (`requireUser`, `requireActiveUser` or `requireAdmin`
from `convex/lib.ts`). There is no Row Level Security behind it.

### Adding a game
1. Create the engine in `packages/shared/src/games/` and register it in `games/index.ts`.
2. Add it to the catalog in `packages/backend/convex/seed.ts` and run `npm run seed`.

---

## Production deployment

### Backend
```bash
cd packages/backend
npx convex deploy
cd ../..
npm run setup:auth -- https://your-site.example --prod
cd packages/backend && npx convex run --prod seed:run
```

### Web (Vercel recommended)
Import the repo, set the root to `apps/web`, and add `NEXT_PUBLIC_CONVEX_URL` (the production
deployment URL) to the environment variables.

### Mobile
```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

---

## Quick start summary

```bash
npm install
npm run dev:backend            # terminal 1: Convex (log in / pick a deployment the first time)
npm run setup:auth             # terminal 2, once per deployment
npm run seed
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_CONVEX_URL
npm run dev:web
npm run dev:mobile             # optional
```

## Resources

- Convex docs: https://docs.convex.dev
- Convex Auth: https://labs.convex.dev/auth
- Next.js docs: https://nextjs.org/docs
- Expo docs: https://docs.expo.dev
- Project docs in `docs/`: `GAME_PUBLISHING.md`, `COMMUNITY_AND_EXPANSION.md`
