# SL Game Hub

Online games platform for players in Sierra Leone. Web (Next.js) + mobile (Expo, Phase 1 Part B) on one Supabase backend.

## Folder structure
```
sl-game-hub/
├─ apps/
│  ├─ web/                 Next.js 14 (App Router) + Tailwind
│  │  └─ src/app/          pages, server actions (actions.ts), auth callback
│  └─ mobile/              Expo SDK 52 + expo-router (login, library, game detail, profile)
├─ packages/
│  └─ shared/              TypeScript used by web AND mobile
│     └─ src/              types, validation, avatars, i18n (en.json), tokens.json (colours)
├─ supabase/
│  ├─ migrations/          0001 schema · 0002 RLS · 0003 storage
│  └─ seed.sql             districts, categories, the 8 planned games
└─ .env.example
```

## Schema (text diagram)
```
auth.users 1───1 profiles ───< game_stats >─── games >─── categories
                  │  │                           │
                  │  └── district_id ──> districts│
                  └───< reports (reporter, target user, game)

profiles: id, full_name, username(unique, case-insens.), avatar, country, district_id,
          age_band, role[player|admin], is_public, banned
games:    slug, name, description, icon, thumbnail_url, category_id, min/max_players,
          modes[single|multi], version, status[draft|review|approved|published|unpublished],
          coming_soon, sort_order
game_stats: (user_id, game_id) played, wins, losses, draws, best_score, last_played_at
reports:  reporter_id, target_user_id, game_id, reason, details, status
```
Security model: RLS on every table. Players read published games and their own stats; they cannot write
stats directly (only via `record_play` / `record_result`). `role`, `banned`, `age_band` can only be changed by
an admin (trigger `protect_profile_columns`). Under-13 profiles are forced private.

## Setup
1. Create a free project at supabase.com.
2. SQL Editor → run, in order: `0001_schema.sql`, `0002_rls.sql`, `0003_storage.sql`, then `seed.sql`.
3. Authentication → URL Configuration: Site URL = your site (`http://localhost:3000` for dev);
   add `http://localhost:3000/auth/callback` (and your production URL) to Redirect URLs.
4. Authentication → Providers → Email: keep enabled. Choose whether "Confirm email" is on
   (on = safer; the app handles both). Supabase's built-in email sender is rate-limited: for launch, add custom SMTP.
5. `cp .env.example apps/web/.env.local` and fill in the Project URL and **anon** key (Settings → API).
6. `npm install` then `npm run dev:web` → http://localhost:3000
7. Make yourself admin: sign up in the app, then in the SQL Editor run
   `update public.profiles set role = 'admin' where lower(username) = lower('YOUR_USERNAME');`

## Why it is fast on low-end phones
- **Server-rendered pages, almost no client JS.** Forms are plain HTML posting to server actions; the only client component is the theme button. Supabase's JS client is not shipped to the browser at all.
- **System fonts, emoji icons, preset avatars:** no font or image downloads for the shell.
- **GET-based search/filter:** works instantly without JS, results are cacheable.
- **Colours in CSS variables** (one `tokens.json`): light/dark switch costs no re-render.
- **Games lazy-load** (Phase 2): each game is its own route/chunk, never part of the shell.
- Touch targets ≥ 48px, high-contrast palette for bright sunlight, `prefers-reduced-motion` respected.

## Mobile app (Expo)
```
cp apps/mobile/.env.example apps/mobile/.env     # same Supabase URL + anon key
npm install
npm run dev:mobile                                # scan the QR code with Expo Go
```
- If Expo reports version mismatches: `cd apps/mobile && npx expo install --fix`.
- Password reset opens the **website** reset page, so set `EXPO_PUBLIC_SITE_URL` to your deployed site.
- Colours come from the same `tokens.json`; mobile follows the phone's light/dark setting.
- Admin tools are web-only by design.
- Before store release: add `icon`/`splash` images, change the placeholder id `com.slgamehub.app`, run `eas build`.

## Tests, CI and size budget
- `npm test` runs the shared-package unit tests (Node's built-in runner).
- `npm run typecheck` checks every workspace.
- `npm run build:web && npm run check:size` fails if any page exceeds 250 KB gzipped JS (`JS_BUDGET_KB` to change).
- `.github/workflows/ci.yml` runs all of the above on every push and pull request.

## Adding a game
Documented in Phase 2 (manifest + rules engine + renderer).
