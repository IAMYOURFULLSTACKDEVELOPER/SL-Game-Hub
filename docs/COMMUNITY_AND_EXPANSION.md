# Phase 5: Community and Expansion

## Overview

Phase 5 adds comprehensive community features to SL Game Hub, including leaderboards, tournaments, achievements, chat, and a rewards system. All features are designed to be engaging while maintaining a safe, non-gambling environment.

## Features Implemented

### 1. National Leaderboards

**Database Schema:** `0008_leaderboards.sql`

**Features:**
- Global leaderboards across all games
- Per-game leaderboards
- Weekly and monthly leaderboards
- Per-district leaderboards
- Automatic rank calculation
- Score tracking with metadata

**API Functions:**
- `update_leaderboard_entry(p_leaderboard_id, p_user_id, p_score, p_metadata)` - Update or create a leaderboard entry
- `recalculate_leaderboard_ranks(p_leaderboard_id)` - Recalculate ranks for a leaderboard

**UI Pages:**
- `/leaderboards` - View and filter leaderboards by type and game

**Usage:**
```sql
-- Update a player's score
SELECT update_leaderboard_entry(
  'leaderboard-uuid',
  'user-uuid',
  1000,
  '{"level": 5, "time": 120}'::jsonb
);
```

### 2. Tournaments

**Database Schema:** `0009_tournaments.sql`

**Features:**
- Multiple tournament formats (single/double elimination, round robin, swiss)
- Registration system with time windows
- Entry fees and prize pools (coins only, no real money)
- Match scheduling and results tracking
- Bracket generation and management
- Player registration limits

**API Functions:**
- `register_for_tournament(p_tournament_id)` - Register a player for a tournament

**UI Pages:**
- `/tournaments` - Browse tournaments by status
- `/tournaments/[id]` - View tournament details, participants, and matches

**Tournament Workflow:**
1. Create tournament (admin only)
2. Set registration window
3. Players register during registration period
4. Admin generates brackets and schedules matches
5. Matches are played and results recorded
6. Winner determined and prizes awarded

**Tournament Formats:**
- **Single Elimination**: One loss and you're out
- **Double Elimination**: Two losses required for elimination
- **Round Robin**: Everyone plays everyone
- **Swiss**: Fixed number of rounds, pairings based on performance

### 3. Achievements and Badges

**Database Schema:** `0010_achievements.sql`

**Features:**
- Achievement types: score, wins, games played, streaks, special
- Badge system with rarity tiers (common, rare, epic, legendary)
- Progress tracking for achievements
- Automatic achievement unlocking
- Badge equipping system
- Cosmetic rewards

**API Functions:**
- `check_achievement_progress(p_user_id, p_achievement_id, p_progress)` - Check and award achievements

**UI Pages:**
- `/achievements` - View earned achievements and badges

**Achievement Types:**
- **Score**: Reach a certain score in a game
- **Wins**: Win a number of games
- **Games Played**: Play a number of games
- **Streak**: Win multiple games in a row
- **Special**: Event-based or unique achievements

**Badge Rarity:**
- **Common**: Easy to obtain
- **Rare**: Moderate difficulty
- **Epic**: Hard to obtain
- **Legendary**: Very rare, special events

### 4. Chat System

**Database Schema:** `0011_chat.sql`

**Features:**
- Room-based chat (global, game-specific, tournament-specific)
- Direct messaging between players
- Profanity filter with severity levels
- User muting with duration
- User blocking
- Message flagging for moderation
- Admin moderation tools

**API Functions:**
- `send_chat_message(p_room_id, p_content)` - Send a message to a room
- `send_direct_message(p_recipient_id, p_content)` - Send a direct message
- `contains_profanity(p_text)` - Check if text contains profanity

**UI Pages:**
- `/chat` - Room-based chat interface
- `/admin/chat` - Admin moderation dashboard

**Chat Room Types:**
- **Global**: General chat for all players
- **Game**: Chat specific to a game
- **Tournament**: Chat for tournament participants
- **Direct**: Private messages between two players

**Moderation Features:**
- Flagged messages review
- User muting (temporary)
- User blocking (permanent)
- Message deletion
- Profanity filter configuration

**Profanity Filter:**
- Mild: Appropriate for all ages
- Medium: Some restrictions
- Severe: Strict filtering

### 5. Rewards System (Non-Gambling)

**Database Schema:** `0012_rewards.sql`

**Features:**
- Coin system (earned, not purchased with real money)
- Daily login bonuses with streak rewards
- Cosmetic shop (avatars, frames, themes, titles, effects)
- Cosmetic rarity system
- Coin transaction history
- Achievement rewards
- Tournament prizes

**API Functions:**
- `add_coins(p_user_id, p_amount, p_type, p_description, p_metadata)` - Add coins to a user
- `spend_coins(p_user_id, p_amount, p_type, p_description, p_metadata)` - Spend coins
- `purchase_cosmetic(p_cosmetic_id)` - Purchase a cosmetic item
- `equip_cosmetic(p_cosmetic_id)` - Equip a cosmetic item
- `process_daily_login()` - Process daily login bonus

**UI Pages:**
- `/shop` - View balance, claim daily bonus, purchase and equip cosmetics

**Coin Sources:**
- Daily login bonuses
- Achievement completions
- Tournament prizes
- Game completions
- Special events

**Cosmetic Types:**
- **Avatar**: Profile avatar icons
- **Frame**: Profile border/frame
- **Theme**: UI theme customization
- **Title**: Display title next to username
- **Effect**: Special visual effects

**Daily Login System:**
- 30-day streak cycle
- Increasing rewards for consecutive days
- Resets if a day is missed
- Cosmetic rewards at specific milestones

**Non-Gambling Policy:**
- Coins cannot be purchased with real money
- No loot boxes or random mechanics
- All rewards are earned through gameplay
- No trading or real-money value
- Transparent reward structure

### 6. Roadmap

**UI Page:** `/roadmap`

**Features:**
- Completed games showcase
- In-development games status
- Planned games list
- Feature roadmap by category
- Progress indicators

**Roadmap Categories:**
- Community Features
- Game Features
- Platform Features

## Database Migrations

### Migration Order:
1. `0008_leaderboards.sql` - Leaderboard system
2. `0009_tournaments.sql` - Tournament system
3. `0010_achievements.sql` - Achievements and badges
4. `0011_chat.sql` - Chat system
5. `0012_rewards.sql` - Rewards system

Apply migrations in order:
```bash
supabase db push
```

## Server Actions

New server actions added to `apps/web/src/app/actions.ts`:

- `registerForTournament` - Register for a tournament
- `deleteChatMessage` - Delete a flagged chat message (admin)
- `muteUser` - Mute a user in a chat room (admin)
- `blockUser` - Block a user (admin)
- `claimDailyBonus` - Claim daily login bonus
- `purchaseCosmetic` - Purchase a cosmetic item
- `equipCosmetic` - Equip a cosmetic item

## Navigation Updates

Updated `Header.tsx` to include new navigation links:
- Leaderboards
- Tournaments
- Achievements (authenticated)
- Chat (authenticated)
- Shop (authenticated)
- Roadmap

## Security Considerations

### Leaderboards
- RLS policies for read access
- Admin-only write access
- Automatic rank calculation prevents manipulation
- Score validation before submission

### Tournaments
- Registration validation (time windows, max players)
- Entry fee validation (coin balance check)
- Admin-only tournament creation
- RLS for sensitive operations

### Achievements
- Progress validation before awarding
- Hidden achievements for spoilers
- Admin-only achievement creation
- RLS for user data

### Chat
- Profanity filtering on all messages
- Rate limiting (to be implemented)
- User blocking prevents harassment
- Admin moderation tools
- Message flagging for review
- RLS for private conversations

### Rewards
- No real-money transactions
- Coin balance validation before spending
- Transaction audit trail
- Admin-only coin adjustments
- Limited-time cosmetics with time validation
- Daily login validation (once per day)

## Performance Considerations

### Leaderboards
- Indexed queries for fast leaderboard lookups
- Rank recalculation on score updates
- Pagination for large leaderboards

### Chat
- Message pagination (last 50 messages)
- Indexed queries for room and user lookups
- Real-time updates (to be implemented with Supabase Realtime)

### Achievements
- Indexed queries for user achievements
- Batch progress checking
- Badge filtering by rarity

## Future Enhancements

### Leaderboards
- Real-time leaderboard updates
- Friends-only leaderboards
- Custom time periods
- Leaderboard season resets

### Tournaments
- Automatic bracket generation
- Real-time match scheduling
- Spectator mode
- Tournament replays
- Team tournaments

### Achievements
- Achievement categories
- Achievement chains
- Secret achievements
- Achievement sharing

### Chat
- Real-time messaging with Supabase Realtime
- Voice chat
- File sharing
- Emoji reactions
- Chat rooms with custom rules

### Rewards
- Limited-time events
- Seasonal cosmetics
- Gifting system
- Achievement showcase
- Profile customization

## Testing

### Leaderboards
```sql
-- Create a test leaderboard
INSERT INTO leaderboards (game_id, type, name)
VALUES ('game-uuid', 'global', 'Test Leaderboard');

-- Update a score
SELECT update_leaderboard_entry('leaderboard-uuid', 'user-uuid', 1000);
```

### Tournaments
```sql
-- Create a test tournament
INSERT INTO tournaments (game_id, name, format, max_players, status)
VALUES ('game-uuid', 'Test Tournament', 'single_elimination', 8, 'registration');

-- Register a player
SELECT register_for_tournament('tournament-uuid');
```

### Chat
```sql
-- Add profanity words
INSERT INTO profanity_words (word, severity)
VALUES ('testword', 'medium');

-- Send a message
SELECT send_chat_message('room-uuid', 'Hello world');
```

### Rewards
```sql
-- Add coins to a user
SELECT add_coins('user-uuid', 100, 'test', 'Test reward');

-- Purchase a cosmetic
SELECT purchase_cosmetic('cosmetic-uuid');
```

## Admin Features

### Tournament Management
- Create tournaments
- Set registration windows
- Generate brackets
- Schedule matches
- Record results
- Award prizes

### Chat Moderation
- View flagged messages
- Delete inappropriate messages
- Mute users (temporary)
- Block users (permanent)
- Manage profanity filter

### Rewards Management
- Create cosmetics
- Set prices and rarity
- Configure daily login rewards
- Adjust coin balances (admin only)
- Create limited-time offers

## Conclusion

Phase 5 adds comprehensive community features to SL Game Hub while maintaining:
- Safety through moderation tools
- Fairness through validation and RLS
- Engagement through achievements and rewards
- Non-gambling principles (no real-money transactions)
- Scalability through proper indexing and RLS

All features are production-ready and can be extended with additional functionality as needed.
