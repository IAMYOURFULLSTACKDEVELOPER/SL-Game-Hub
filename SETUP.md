# SL Game Hub - Complete Setup Guide

This guide will walk you through setting up and running the entire SL Game Hub project, from Supabase to the mobile app.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Git
- Supabase account (local or cloud)
- Expo CLI (for mobile development)

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd sl-game-hub
```

---

## Step 2: Install Dependencies

Install dependencies for all workspaces:

```bash
npm install
```

This will install dependencies for:
- Root package
- `packages/shared` (shared code)
- `apps/web` (Next.js web app)
- `apps/mobile` (Expo mobile app)

---

## Step 3: Supabase Setup

### Option A: Supabase Cloud (Recommended for Production)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your:
   - Project URL
   - Anon Key (public)
   - Service Role Key (server-side, keep secret!)

### Option B: Supabase Local (Recommended for Development)

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Start local Supabase:
```bash
supabase start
```

3. This will output your local credentials:
   - Local API URL
   - Anon Key
   - Service Role Key

---

## Step 4: Configure Environment Variables

### Root Environment (.env)

Create or edit `.env` in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Web App Environment (apps/web/.env)

Create or edit `apps/web/.env`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Mobile App Environment (apps/mobile/.env)

Create or edit `apps/mobile/.env`:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Important:** Replace the placeholder values with your actual Supabase credentials.

---

## Step 5: Run Database Migrations

### For Supabase Cloud:

```bash
# Link your local project to Supabase cloud
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### For Supabase Local:

```bash
# Migrations are automatically applied when you start
# If you need to reset:
supabase db reset
```

### Migration Order (Applied Automatically):

1. `0001_schema.sql` - Core schema (users, games, stats)
2. `0002_rls.sql` - Row Level Security policies
3. `0003_storage.sql` - Storage buckets (thumbnails, game bundles)
4. `0004_snake_published.sql` - Mark built-in games as published
5. `0005_multiplayer.sql` - Multiplayer support
6. `0006_multiplayer_rls.sql` - Multiplayer RLS policies
7. `0007_game_versions.sql` - Game versioning for publishing
8. `0008_leaderboards.sql` - Leaderboard system
9. `0009_tournaments.sql` - Tournament system
10. `0010_achievements.sql` - Achievements and badges
11. `0011_chat.sql` - Chat system
12. `0012_rewards.sql` - Rewards system

---

## Step 6: Seed Initial Data

Run the seed script to populate initial data:

```bash
# For Supabase Cloud
supabase db query --file supabase/seed.sql --remote

# For Supabase Local
supabase db query --file supabase/seed.sql
```

This will create:
- Default districts
- Game categories
- Built-in games (Snake, Snake & Ladder)
- Default chat rooms

---

## Step 7: Run the Web Application

### Development Mode:

```bash
npm run dev:web
```

The web app will be available at: http://localhost:3000

### Production Build:

```bash
npm run build:web
```

### Web App Features:
- Game library
- Built-in game play (Snake, Snake & Ladder)
- User authentication
- Leaderboards
- Tournaments
- Achievements
- Chat
- Shop
- Admin dashboard

---

## Step 8: Run the Mobile Application

### Install Expo CLI (if not already installed):

```bash
npm install -g expo-cli
```

### Start the Expo Development Server:

```bash
npm run dev:mobile
```

This will start the Expo development server and open Expo DevTools.

### Running on Device:

#### Option A: Expo Go App (Easiest)

1. Download Expo Go app on your mobile device
   - iOS: App Store
   - Android: Google Play Store

2. Scan the QR code shown in the terminal or Expo DevTools

3. The app will load on your device

#### Option B: iOS Simulator (Mac only)

```bash
# Press 'i' in the terminal where Expo is running
# Or use:
npx expo run:ios
```

#### Option C: Android Emulator

```bash
# Press 'a' in the terminal where Expo is running
# Or use:
npx expo run:android
```

### Mobile App Features:
- Game library
- Built-in game play
- User authentication
- Leaderboards
- Tournaments
- Achievements
- Chat
- Shop

---

## Step 10: Verify Setup

### Test Web App:

1. Open http://localhost:3000
2. Sign up for a new account
3. Navigate to the games library
4. Play Snake or Snake & Ladder
5. Check leaderboards
6. Explore the shop and achievements

### Test Mobile App:

1. Open the app on your device/emulator
2. Sign up for a new account
3. Navigate to the games library
4. Play a game
5. Test navigation between features

### Test Admin Features:

1. Create an admin user (you'll need to manually set this in Supabase):

```sql
-- Update a user to admin role
UPDATE public.profiles
SET role = 'admin'
WHERE username = 'your-username';
```

2. Log in as admin
3. Navigate to /admin
4. Test game management, player management, and reports
5. Test game upload (Phase 4)
6. Test chat moderation

---

## Step 11: Common Issues and Solutions

### Issue: "Supabase connection failed"

**Solution:**
- Verify your environment variables are set correctly
- Check that Supabase is running (local) or your project is active (cloud)
- Ensure the URL includes the protocol (https:// for cloud, http:// for local)

### Issue: "Migration failed"

**Solution:**
- Ensure you're using the correct Supabase project
- Check that your migrations are in the correct order
- Try resetting the database: `supabase db reset` (local) or manually in dashboard (cloud)

### Issue: "Shared package build failed"

**Solution:**
- Run `npm install` to ensure all dependencies are installed
- Check that Node.js version is 18+
- Try building the shared package separately: `npm run build --workspace=@slgh/shared`

### Issue: "Mobile app won't load"

**Solution:**
- Ensure Expo server is running
- Check that your mobile device and computer are on the same network
- Verify environment variables in `apps/mobile/.env`
- Try clearing Expo cache: `npx expo start --clear`

### Issue: "TypeScript errors"

**Solution:**
- Run `npm run typecheck` to see all errors
- Ensure all dependencies are installed
- Check that you're using the correct Node.js version

---

## Step 12: Development Workflow

### Making Changes to Shared Code:

1. Edit files in `packages/shared/src/`
2. Build the shared package: `npm run build --workspace=@slgh/shared`
3. Restart web and mobile apps to pick up changes

### Adding New Games:

1. Create game engine in `packages/shared/src/games/`
2. Register game in `packages/shared/src/games/index.ts`
3. Add game to database via seed or admin panel
4. Build shared package
5. Game will appear in library

### Adding New Features:

1. Update database schema (create new migration)
2. Apply migration: `supabase db push`
3. Update types in `packages/shared/src/types.ts`
4. Implement UI in web or mobile app
5. Test thoroughly

---

## Step 13: Production Deployment

### Web App (Vercel recommended):

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Mobile App:

1. Build for production:
```bash
# iOS
npx expo run:ios --configuration Release

# Android
npx expo run:android --variant release
```

2. Or use EAS Build:
```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

---

## Step 14: Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Expo Docs**: https://docs.expo.dev
- **Project Documentation**: Check the `docs/` folder
  - `GAME_PUBLISHING.md` - Game publishing system
  - `COMMUNITY_AND_EXPANSION.md` - Phase 5 features

---

## Step 15: Troubleshooting Commands

### Check Dependencies:
```bash
npm list
```

### Clean and Reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Check Supabase Status:
```bash
supabase status
```

### View Supabase Logs:
```bash
supabase logs
```

### Reset Local Database:
```bash
supabase db reset
```

### Type Check:
```bash
npm run typecheck
```

### Run Tests:
```bash
npm test
```

---

## Quick Start Summary

For experienced developers, here's the quick version:

```bash
# 1. Install dependencies
npm install

# 2. Start Supabase (local)
supabase start

# 3. Configure environment variables
# Edit .env, apps/web/.env, apps/mobile/.env

# 4. Push migrations
supabase db push

# 5. Seed data
supabase db execute --file supabase/seed.sql

# 6. Build shared package
npm run build --workspace=@slgh/shared

# 7. Start web app
npm run dev:web

# 8. Start mobile app (in new terminal)
npm run dev:mobile
```

---

## Support

If you encounter issues not covered in this guide:

1. Check the documentation in the `docs/` folder
2. Review error messages carefully
3. Check Supabase logs: `supabase logs`
4. Ensure all environment variables are set correctly
5. Verify you're using the correct Node.js version (18+)

Happy gaming! 🎮
