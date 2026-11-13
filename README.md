# SL Game Hub

Online games platform for players in Sierra Leone. Web (Next.js) + mobile (Expo) on one Convex backend.

## Folder structure
```
sl-game-hub/
├─ apps/
│  ├─ web/                 Next.js 14 (App Router) + Tailwind
│  │  └─ src/app/          pages, server actions (actions.ts)
│  └─ mobile/              Expo + expo-router (login, library, game detail, profile)
├─ packages/
│  ├─ backend/             Convex backend (@slgh/backend)
│  │  └─ convex/           schema.ts, one module per feature, auth.ts, seed.ts
│  └─ shared/              TypeScript used by web, mobile AND the backend
│     └─ src/              types, validation, avatars, game engines, i18n (en.json), tokens.json (colours)
└─ scripts/                setup-convex-auth.mjs, bundle-size check, Scrabble dictionary
```

## Schema (text diagram)
```
users (Convex Auth + profile) ───< game_stats >─── games >─── categories
   │  │                                              │
   │  └── district_id ──> districts                  └──< game_versions (files in Convex storage)
   └───< reports (reporter, target user, game)

users:      email, full_name, username (unique, case-insens. via username_lower), avatar, country,
            district_id, age_band, role[player|admin], is_public, banned
games:      slug, name, description, icon, thumbnail_url, category_id, min/max_players,
            modes[single|multi], version, status[draft|review|approved|published|unpublished],
            coming_soon, sort_order
game_stats: (user_id, game_id) played, wins, losses, draws, best_score, last_played_at
reports:    reporter_id, target_user_id, game_id, reason, details, status
```
Also in `packages/backend/convex/schema.ts`: leaderboards, tournaments, achievements & badges, chat
(rooms, messages, DMs, blocks, profanity list), rewards (coins, cosmetics, daily login streaks),
multiplayer (friends, rooms, matchmaking, Elo, match history), the live Dice rooms, and the wallet
(wallets, wallet_transactions, deposits, withdrawals, pots, pot_entries).

Security model: clients never touch tables directly. Every read and write is a Convex function that checks
who is calling (`requireUser` / `requireAdmin` in `convex/lib.ts`), which replaces Postgres Row Level Security.
Players read published games and their own stats, and only change stats through `games:recordPlay` /
`games:recordResult`. `role`, `banned` and `age_band` are never accepted from players. Under-13 profiles are
forced private. Coins, achievements and Elo are changed only by server code.

## Setup
1. `npm install`
2. `npm run dev:backend`. The first run asks you to log in to Convex and create a project (or choose
   a local deployment). It pushes the schema and functions, keeps watching for changes, and saves
   the deployment URL as `CONVEX_URL` in `packages/backend/.env.local`. Leave it running.
3. In a second terminal, once per deployment:
   - `npm run setup:auth` creates the key pair Convex Auth signs sessions with and sets `SITE_URL`.
     Pass your site URL for production: `npm run setup:auth -- https://your-site.example`.
   - `npm run seed` adds the districts, categories and the 8 planned games (safe to run again).
4. `cp apps/web/.env.example apps/web/.env.local` and set `NEXT_PUBLIC_CONVEX_URL` to that `CONVEX_URL`.
5. `npm run dev:web` → http://localhost:3000
6. Make yourself admin: sign up in the app, then
   `cd packages/backend && npx convex run seed:makeAdmin '{"username":"YOUR_USERNAME"}'`.

**Password reset** emails a 6-digit code through [Resend](https://resend.com). Set it up on the deployment with
`npx convex env set AUTH_RESEND_KEY re_...` and, optionally, `npx convex env set AUTH_EMAIL_FROM "SL Game Hub <noreply@your-domain>"`
(run both in `packages/backend`). Without a key, reset requests fail quietly and players see the usual "code sent" message.

## Wallet and money games (Monime)
Players aged 18+ (by the age band they chose at sign-up) get a real-money wallet at `/wallet` (and the mobile Wallet tab).
Code: `convex/wallet.ts` (ledger, top-ups, withdrawals), `convex/pots.ts` (stakes), `convex/monime.ts` (Monime API + webhook).

- **Top up:** the player enters an amount and gets a Monime USSD code (e.g. `*715*1*1234#`) to dial on their phone
  (the "Dial now" button opens the dialer). The wallet is credited only when Monime reports the code `completed`,
  through the signed webhook or the "I've paid, check now" button. Each top-up is credited exactly once.
- **Stake:** in Dice → Online → *For money*, the host sets a stake. Joining moves that stake from the wallet's
  balance to *held*, into the room's pot. Stakes can be taken back until the host starts. Leaving during a round
  forfeits the stake. The server makes every roll, so it settles the pot: the winner gets the pot minus the
  `WALLET_FEE_BPS` fee, straight into their wallet. They can stake again for the next round or leave with it.
  If everyone leaves mid-round, there is no winner and every stake goes back.
- **Withdraw:** the money is held at once and appears in **Admin → Wallet**. Approving it sends a Monime payout to the
  player's Orange Money / Africell Money number. Declined or failed payouts are refunded automatically.
- Every change is a row in `wallet_transactions`, written in the same transaction as the balance change. Amounts are
  integers in minor units (100 = SLE 1).
- Only games whose result the **server** decides can take stakes. Today that is online Dice. The other games run on
  the player's device, so a result they report can't be trusted with money.

Deployment environment variables (`cd packages/backend && npx convex env set NAME value`):

| Variable | |
|---|---|
| `MONIME_ACCESS_TOKEN` | Monime API token (`mon_test_...` sandbox, `mon_...` live) |
| `MONIME_SPACE_ID` | `spc-...` |
| `MONIME_WEBHOOK_SECRET` | HMAC secret of a Monime webhook pointing at `https://<deployment>.convex.site/monime/webhook`, with events `payment_code.completed`, `payment_code.expired`, `payment_code.cancelled`, `payout.completed`, `payout.failed` |
| `MONIME_FINANCIAL_ACCOUNT_ID` | optional `fac-...`; Monime's main account otherwise |
| `WALLET_FEE_BPS` | optional platform fee in basis points (`250` = 2.5%, max 2000); default 0 |
| `WALLET_TEST_CREDITS` | `true` only on test deployments, to allow `npx convex run wallet:testCredit '{"username":"x","amount":5000}'` |

A cron re-checks top-ups and payouts every 5 minutes, in case a webhook is missed.

## Why it is fast on low-end phones
- **Server-rendered pages, almost no client JS.** Pages fetch from Convex on the server (`lib/convex.ts`) and forms post to
  server actions. The Convex client is only shipped where something is live (Chat, online Dice). Sign-in forms post
  straight to the `/api/auth` route instead of loading it.
- **System fonts, emoji icons, preset avatars:** no font or image downloads for the shell.
- **GET-based search/filter:** works instantly without JS, results are cacheable.
- **Colours in CSS variables** (one `tokens.json`): light/dark switch costs no re-render.
- **Games lazy-load:** each game is its own route/chunk, never part of the shell.
- Touch targets ≥ 48px, high-contrast palette for bright sunlight, `prefers-reduced-motion` respected.

## Live features
- **Chat** subscribes to `chat:messages`, so new messages appear without refreshing.
- **Online Dice** keeps each room in Convex (`convex/dice.ts`). Players need no account: each device picks a random
  member id and sends a heartbeat every 10 s, and a cron removes players who stop. The server makes every roll and
  skips the turn of anyone who has left.
- **Online rooms for every other game** (`convex/rooms.ts`, one entry per game in `convex/roomGames.ts`): UNO,
  Salone-Poly, Chess, Checkers, Snake & Ladder and Scrabble take turns; Word Search and Snake are races where everyone
  plays at once. No account needed: each browser keeps a private room secret. The server checks and applies every move,
  rolls every die, plays the bots and only sends each player what they may see (UNO hands, Scrabble racks and the
  positions of unfound words stay hidden). A bot takes over from anyone who leaves a turn-based game.
  - Scrabble words are checked on the server (`convex/scrabbleNode.ts`, Node runtime). The 270,000-word list is the
    `word-list` package; the first check on a deployment downloads it from the npm CDN into Convex storage.
  - Snake races trust each phone's own score (fine for fun, not for prizes).
- **Live games** (`/lobby`): hosts can list their room; anyone can ask to join and the host lets them in or not.
  Room codes are never shown in the list.
- **Voice chat** in every online room (`convex/voice.ts`, `lib/useVoice.ts`): audio goes straight between the players'
  browsers (WebRTC); Convex only relays the connection set-up. Uses public STUN servers; for players on mobile networks
  that block direct connections, add a TURN relay with `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`
  (see `apps/web/.env.example`).

## Mobile app (Expo)
```
cp apps/mobile/.env.example apps/mobile/.env     # same Convex URL as the website
npm install
npm run dev:mobile                                # scan the QR code with Expo Go
```
- A phone cannot reach `127.0.0.1` on your computer. Use a cloud Convex deployment (or your computer's LAN address).
- Sessions are kept in AsyncStorage by `ConvexAuthProvider`. Screens use live `useQuery` hooks.
- If Expo reports version mismatches: `cd apps/mobile && npx expo install --fix`.
- Colours come from the same `tokens.json`; mobile follows the phone's light/dark setting.
- Admin tools are web-only by design.
- Before store release: add `icon`/`splash` images, change the placeholder id `com.slgamehub.app`, run `eas build`.

## Tests and size budget
- `npm test` runs the shared-package unit tests (Node's built-in runner).
- `npm run typecheck` checks every workspace, including the Convex functions.
- `npm run build:web && npm run check:size` fails if any page exceeds 250 KB gzipped JS (`JS_BUDGET_KB` to change).

## Deploying
- Backend: `cd packages/backend && npx convex deploy`, then from the repo root
  `npm run setup:auth -- https://your-site.example --prod` and `cd packages/backend && npx convex run --prod seed:run`.
  Set `AUTH_RESEND_KEY` with `npx convex env set --prod ...`.
- Web (e.g. Vercel): set `NEXT_PUBLIC_CONVEX_URL` to the production deployment URL.

## Adding a game
Documented in Phase 2 (manifest + rules engine + renderer). Add it to the catalog in `packages/backend/convex/seed.ts`.
