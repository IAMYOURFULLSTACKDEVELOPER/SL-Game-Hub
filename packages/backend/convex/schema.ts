import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

// Field names stay snake_case so they match the shapes the apps already render.
// Timestamps are epoch milliseconds; `_creationTime` replaces every `created_at` column.

export const ageBand = v.union(v.literal('under_13'), v.literal('13_17'), v.literal('18_plus'));
export const role = v.union(v.literal('player'), v.literal('admin'));
export const gameMode = v.union(v.literal('single'), v.literal('multi'));
export const gameStatus = v.union(
  v.literal('draft'), v.literal('review'), v.literal('approved'), v.literal('published'), v.literal('unpublished'),
);
export const reportStatus = v.union(v.literal('open'), v.literal('resolved'), v.literal('dismissed'));
export const leaderboardType = v.union(
  v.literal('global'), v.literal('per_game'), v.literal('weekly'), v.literal('monthly'), v.literal('per_district'),
);
export const momoProvider = v.union(v.literal('m17'), v.literal('m18'));
export const walletTxType = v.union(
  v.literal('deposit'), v.literal('stake'), v.literal('stake_refund'), v.literal('stake_lost'), v.literal('winnings'),
  v.literal('withdrawal_hold'), v.literal('withdrawal_paid'), v.literal('withdrawal_refund'), v.literal('adjustment'),
);
const rarity = v.union(v.literal('common'), v.literal('rare'), v.literal('epic'), v.literal('legendary'));

export default defineSchema({
  ...authTables,

  // Convex Auth's user table doubles as the player profile (was public.profiles).
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    full_name: v.string(),
    username: v.string(),
    username_lower: v.string(),
    avatar: v.string(),
    country: v.string(),
    district_id: v.optional(v.id('districts')),
    age_band: ageBand,
    role,
    is_public: v.boolean(),
    banned: v.boolean(),
    updated_at: v.number(),
  })
    .index('email', ['email'])
    .index('by_username_lower', ['username_lower']),

  // Reference data -------------------------------------------------------
  districts: defineTable({ name: v.string() }).index('by_name', ['name']),
  categories: defineTable({ slug: v.string(), name: v.string(), sort_order: v.number() })
    .index('by_slug', ['slug'])
    .index('by_sort', ['sort_order']),

  // Games ----------------------------------------------------------------
  games: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    thumbnail_url: v.optional(v.string()),
    category_id: v.optional(v.id('categories')),
    min_players: v.number(),
    max_players: v.number(),
    modes: v.array(gameMode),
    version: v.string(),
    status: gameStatus,
    is_builtin: v.boolean(),
    coming_soon: v.boolean(),
    sort_order: v.number(),
    published_at: v.optional(v.number()),
    updated_at: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_sort', ['sort_order'])
    .index('by_status_sort', ['status', 'sort_order']),

  game_stats: defineTable({
    user_id: v.id('users'),
    game_id: v.id('games'),
    played: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    best_score: v.number(),
    last_played_at: v.number(),
  })
    .index('by_user_game', ['user_id', 'game_id'])
    .index('by_user_recent', ['user_id', 'last_played_at'])
    .index('by_game', ['game_id']),

  reports: defineTable({
    reporter_id: v.id('users'),
    target_user_id: v.optional(v.id('users')),
    game_id: v.optional(v.id('games')),
    reason: v.string(),
    details: v.optional(v.string()),
    status: reportStatus,
    resolved_by: v.optional(v.id('users')),
  }).index('by_status', ['status']),

  game_versions: defineTable({
    game_id: v.id('games'),
    version: v.string(),
    bundle_storage_id: v.id('_storage'),
    thumbnail_storage_id: v.optional(v.id('_storage')),
    manifest: v.any(),
    changelog: v.optional(v.string()),
    status: gameStatus,
    is_current: v.boolean(),
    created_by: v.optional(v.id('users')),
  })
    .index('by_game_version', ['game_id', 'version'])
    .index('by_game_current', ['game_id', 'is_current']),

  // Multiplayer ----------------------------------------------------------
  friendships: defineTable({
    requester_id: v.id('users'),
    receiver_id: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('blocked')),
    updated_at: v.number(),
  })
    .index('by_pair', ['requester_id', 'receiver_id'])
    .index('by_receiver', ['receiver_id', 'status']),

  game_rooms: defineTable({
    room_code: v.string(),
    host_id: v.id('users'),
    game_id: v.id('games'),
    max_players: v.number(),
    status: v.union(v.literal('waiting'), v.literal('active'), v.literal('completed'), v.literal('abandoned')),
    updated_at: v.number(),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
  })
    .index('by_code', ['room_code'])
    .index('by_host', ['host_id', 'status']),

  room_participants: defineTable({
    room_id: v.id('game_rooms'),
    user_id: v.id('users'),
    joined_at: v.number(),
    left_at: v.optional(v.number()),
    is_ready: v.boolean(),
  })
    .index('by_room_user', ['room_id', 'user_id'])
    .index('by_user', ['user_id']),

  matchmaking_queue: defineTable({
    user_id: v.id('users'),
    game_id: v.id('games'),
    status: v.union(v.literal('queued'), v.literal('matched'), v.literal('cancelled'), v.literal('timeout')),
    elo_rating: v.number(),
    queued_at: v.number(),
    matched_at: v.optional(v.number()),
    timeout_at: v.number(),
  })
    .index('by_user_status', ['user_id', 'status'])
    .index('by_game_status_elo', ['game_id', 'status', 'elo_rating']),

  game_matches: defineTable({
    room_id: v.optional(v.id('game_rooms')),
    game_id: v.id('games'),
    started_at: v.number(),
    completed_at: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    final_state: v.optional(v.any()),
  })
    .index('by_room', ['room_id'])
    .index('by_game', ['game_id', 'completed_at']),

  match_participants: defineTable({
    match_id: v.id('game_matches'),
    user_id: v.id('users'),
    result: v.union(v.literal('win'), v.literal('loss'), v.literal('draw'), v.literal('forfeit'), v.literal('abandoned')),
    score: v.number(),
    elo_change: v.number(),
    new_elo: v.number(),
    moves_made: v.number(),
    time_used_ms: v.number(),
  })
    .index('by_match', ['match_id'])
    .index('by_user', ['user_id']),

  elo_ratings: defineTable({
    user_id: v.id('users'),
    game_id: v.id('games'),
    rating: v.number(),
    games_played: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    updated_at: v.number(),
  })
    .index('by_user_game', ['user_id', 'game_id'])
    .index('by_game_rating', ['game_id', 'rating']),

  game_moves: defineTable({
    match_id: v.id('game_matches'),
    user_id: v.id('users'),
    move_order: v.number(),
    move_data: v.any(),
    timestamp: v.number(),
  }).index('by_match', ['match_id', 'move_order']),

  // Leaderboards -----------------------------------------------------------
  leaderboards: defineTable({
    game_id: v.optional(v.id('games')),
    type: leaderboardType,
    district_id: v.optional(v.id('districts')),
    name: v.string(),
    description: v.optional(v.string()),
    is_active: v.boolean(),
    updated_at: v.number(),
  })
    .index('by_type', ['type'])
    .index('by_game', ['game_id']),

  leaderboard_entries: defineTable({
    leaderboard_id: v.id('leaderboards'),
    user_id: v.id('users'),
    score: v.number(),
    rank: v.optional(v.number()),
    metadata: v.optional(v.any()),
    achieved_at: v.number(),
  })
    .index('by_leaderboard_score', ['leaderboard_id', 'score'])
    .index('by_leaderboard_user', ['leaderboard_id', 'user_id']),

  // Tournaments ------------------------------------------------------------
  tournaments: defineTable({
    game_id: v.id('games'),
    name: v.string(),
    description: v.optional(v.string()),
    format: v.union(
      v.literal('single_elimination'), v.literal('double_elimination'), v.literal('round_robin'), v.literal('swiss'),
    ),
    max_players: v.number(),
    status: v.union(
      v.literal('upcoming'), v.literal('registration'), v.literal('in_progress'), v.literal('completed'), v.literal('cancelled'),
    ),
    registration_starts_at: v.optional(v.number()),
    registration_ends_at: v.optional(v.number()),
    starts_at: v.optional(v.number()),
    ends_at: v.optional(v.number()),
    prize_coins: v.number(),
    entry_fee_coins: v.number(),
    rules: v.optional(v.string()),
    created_by: v.optional(v.id('users')),
    updated_at: v.number(),
  }).index('by_status_starts', ['status', 'starts_at']),

  tournament_registrations: defineTable({
    tournament_id: v.id('tournaments'),
    user_id: v.id('users'),
    registered_at: v.number(),
    status: v.union(v.literal('registered'), v.literal('withdrawn'), v.literal('disqualified')),
  })
    .index('by_tournament_status', ['tournament_id', 'status'])
    .index('by_tournament_user', ['tournament_id', 'user_id']),

  tournament_matches: defineTable({
    tournament_id: v.id('tournaments'),
    round: v.number(),
    match_number: v.number(),
    player1_id: v.optional(v.id('users')),
    player2_id: v.optional(v.id('users')),
    winner_id: v.optional(v.id('users')),
    score1: v.optional(v.number()),
    score2: v.optional(v.number()),
    status: v.union(v.literal('scheduled'), v.literal('in_progress'), v.literal('completed')),
    scheduled_at: v.optional(v.number()),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    metadata: v.optional(v.any()),
  }).index('by_tournament_round', ['tournament_id', 'round']),

  tournament_brackets: defineTable({
    tournament_id: v.id('tournaments'),
    round: v.number(),
    position: v.number(),
    match_id: v.optional(v.id('tournament_matches')),
    player_id: v.optional(v.id('users')),
  }).index('by_tournament', ['tournament_id', 'round', 'position']),

  // Achievements & badges ----------------------------------------------------
  achievements: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    type: v.union(v.literal('score'), v.literal('wins'), v.literal('games_played'), v.literal('streak'), v.literal('special')),
    game_id: v.optional(v.id('games')),
    requirement: v.record(v.string(), v.number()),
    reward_coins: v.number(),
    reward_badge_id: v.optional(v.id('badges')),
    icon: v.string(),
    is_hidden: v.boolean(),
    is_active: v.boolean(),
  })
    .index('by_slug', ['slug'])
    .index('by_active_type', ['is_active', 'type']),

  // A row without `earned_at` only tracks progress toward the achievement.
  user_achievements: defineTable({
    user_id: v.id('users'),
    achievement_id: v.id('achievements'),
    earned_at: v.optional(v.number()),
    progress: v.record(v.string(), v.number()),
  }).index('by_user_achievement', ['user_id', 'achievement_id']),

  badges: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.string(),
    rarity,
    is_active: v.boolean(),
  })
    .index('by_slug', ['slug'])
    .index('by_active_rarity', ['is_active', 'rarity']),

  user_badges: defineTable({
    user_id: v.id('users'),
    badge_id: v.id('badges'),
    is_equipped: v.boolean(),
    obtained_at: v.number(),
    source_type: v.optional(v.string()),
    source_id: v.optional(v.string()),
  }).index('by_user_badge', ['user_id', 'badge_id']),

  // Chat -------------------------------------------------------------------
  chat_rooms: defineTable({
    type: v.union(v.literal('global'), v.literal('game'), v.literal('tournament'), v.literal('direct')),
    name: v.string(),
    description: v.optional(v.string()),
    game_id: v.optional(v.id('games')),
    tournament_id: v.optional(v.id('tournaments')),
    is_active: v.boolean(),
  }).index('by_active', ['is_active']),

  chat_participants: defineTable({
    room_id: v.id('chat_rooms'),
    user_id: v.id('users'),
    joined_at: v.number(),
    is_muted: v.boolean(),
    muted_until: v.optional(v.number()),
  })
    .index('by_room_user', ['room_id', 'user_id'])
    .index('by_muted', ['is_muted', 'muted_until']),

  chat_messages: defineTable({
    room_id: v.id('chat_rooms'),
    user_id: v.id('users'),
    content: v.string(),
    is_deleted: v.boolean(),
    is_flagged: v.boolean(),
  })
    .index('by_room', ['room_id'])
    .index('by_flagged', ['is_flagged', 'is_deleted']),

  // user1_id is always the smaller id of the pair, so each pair has one conversation.
  conversations: defineTable({ user1_id: v.id('users'), user2_id: v.id('users') })
    .index('by_pair', ['user1_id', 'user2_id']),

  direct_messages: defineTable({
    conversation_id: v.id('conversations'),
    sender_id: v.id('users'),
    content: v.string(),
    is_deleted: v.boolean(),
    is_flagged: v.boolean(),
  }).index('by_conversation', ['conversation_id']),

  user_blocks: defineTable({ blocker_id: v.id('users'), blocked_id: v.id('users'), blocked_at: v.number() })
    .index('by_pair', ['blocker_id', 'blocked_id']),

  profanity_words: defineTable({
    word: v.string(),
    severity: v.union(v.literal('mild'), v.literal('medium'), v.literal('severe')),
  }).index('by_word', ['word']),

  // Rewards (non-gambling) ---------------------------------------------------
  user_coins: defineTable({
    user_id: v.id('users'),
    balance: v.number(),
    total_earned: v.number(),
    total_spent: v.number(),
    updated_at: v.number(),
  }).index('by_user', ['user_id']),

  coin_transactions: defineTable({
    user_id: v.id('users'),
    amount: v.number(), // positive for earning, negative for spending
    type: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index('by_user', ['user_id']),

  cosmetics: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal('avatar'), v.literal('frame'), v.literal('theme'), v.literal('title'), v.literal('effect')),
    icon: v.string(),
    price_coins: v.number(),
    rarity,
    is_limited: v.boolean(),
    is_active: v.boolean(),
    available_from: v.optional(v.number()),
    available_until: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_active_rarity', ['is_active', 'rarity']),

  user_cosmetics: defineTable({
    user_id: v.id('users'),
    cosmetic_id: v.id('cosmetics'),
    is_equipped: v.boolean(),
    obtained_at: v.number(),
    source_type: v.optional(v.string()),
    source_id: v.optional(v.string()),
  }).index('by_user_cosmetic', ['user_id', 'cosmetic_id']),

  daily_login_rewards: defineTable({
    day_number: v.number(),
    coins: v.number(),
    cosmetic_id: v.optional(v.id('cosmetics')),
    is_active: v.boolean(),
  }).index('by_day', ['day_number']),

  user_login_streaks: defineTable({
    user_id: v.id('users'),
    current_streak: v.number(),
    longest_streak: v.number(),
    last_login_date: v.optional(v.string()), // YYYY-MM-DD (UTC)
    total_logins: v.number(),
    updated_at: v.number(),
  }).index('by_user', ['user_id']),

  // Wallet (real money) ---------------------------------------------------------------
  // Amounts are integers in minor units, as Monime counts them: 100 = SLE 1.
  // `balance` can be spent; `held` is locked in game pots and pending withdrawals.
  wallets: defineTable({
    user_id: v.id('users'),
    balance: v.number(),
    held: v.number(),
    updated_at: v.number(),
  }).index('by_user', ['user_id']),

  // The ledger: every change to a wallet, newest last. Never edited or deleted.
  wallet_transactions: defineTable({
    user_id: v.id('users'),
    type: walletTxType,
    amount: v.number(), // change to the spendable balance
    held_change: v.number(), // change to the held amount
    balance_after: v.number(),
    description: v.string(),
    ref: v.optional(v.string()), // deposit / withdrawal / pot id
  }).index('by_user', ['user_id']),

  // A top-up: one Monime USSD payment code. Credited once, when Monime reports it completed.
  deposits: defineTable({
    user_id: v.id('users'),
    amount: v.number(),
    status: v.union(
      v.literal('creating'), v.literal('pending'), v.literal('completed'),
      v.literal('expired'), v.literal('cancelled'), v.literal('failed'),
    ),
    monime_id: v.optional(v.string()), // pmc-...
    ussd_code: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    error: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    updated_at: v.number(),
  })
    .index('by_user', ['user_id'])
    .index('by_monime_id', ['monime_id'])
    .index('by_status_expires', ['status', 'expires_at']),

  // A cash-out to mobile money. The amount is held from the request until the payout ends.
  withdrawals: defineTable({
    user_id: v.id('users'),
    amount: v.number(),
    phone: v.string(), // MSISDN, e.g. 23276123456
    provider: momoProvider,
    status: v.union(
      v.literal('requested'), v.literal('processing'), v.literal('completed'),
      v.literal('failed'), v.literal('rejected'), v.literal('cancelled'),
    ),
    monime_id: v.optional(v.string()), // pyt-...
    error: v.optional(v.string()),
    reviewed_by: v.optional(v.id('users')),
    updated_at: v.number(),
  })
    .index('by_user', ['user_id'])
    .index('by_status', ['status'])
    .index('by_monime_id', ['monime_id']),

  // Money staked on one round of a game. Entries are held until the round is settled.
  pots: defineTable({
    game: v.string(),
    room: v.string(),
    stake: v.number(),
    fee_bps: v.number(), // platform fee in basis points, fixed when the pot opens
    status: v.union(v.literal('open'), v.literal('locked'), v.literal('settled'), v.literal('void')),
    total: v.number(),
    fee: v.optional(v.number()),
    winner_id: v.optional(v.id('users')),
    settled_at: v.optional(v.number()),
  }).index('by_status', ['status']),

  pot_entries: defineTable({
    pot_id: v.id('pots'),
    user_id: v.id('users'),
    amount: v.number(),
    status: v.union(v.literal('held'), v.literal('refunded'), v.literal('won'), v.literal('lost')),
  })
    .index('by_pot', ['pot_id'])
    .index('by_pot_user', ['pot_id', 'user_id']),

  // Dice online rooms (live room state; replaces a broadcast channel) ------------------
  // Free rooms are anonymous: `member_id` is a random id each browser makes for itself.
  // Money rooms (`stake` set) need an account, and `member_id` is then the player's user id.
  dice_rooms: defineTable({
    code: v.string(),
    state: v.optional(v.any()),
    stake: v.optional(v.number()),
    pot_id: v.optional(v.id('pots')), // the round players are staking on now
    last_prize: v.optional(v.number()), // what the last round's winner received
  }).index('by_code', ['code']),
  dice_members: defineTable({
    room_id: v.id('dice_rooms'),
    member_id: v.string(),
    user_id: v.optional(v.id('users')),
    name: v.string(),
    host: v.boolean(),
    joined_at: v.number(),
    last_seen: v.number(),
  })
    .index('by_room', ['room_id', 'joined_at'])
    .index('by_room_member', ['room_id', 'member_id']),

  // UNO and Salone-Poly online rooms (see rooms.ts) ------------------------------------
  // Anonymous, like free Dice rooms. Each browser keeps a private `secret` that proves which seat
  // is theirs; `member_id` is the public id other players see and the id used in the game state.
  play_rooms: defineTable({
    code: v.string(),
    game: v.union(v.literal('uno'), v.literal('salone-poly')),
    state: v.optional(v.any()),
    version: v.number(), // bumps on every game change; scheduled bot moves check it so they never double up
    offer: v.optional(v.any()), // Salone-Poly: a trade waiting for the other player's answer
    created_at: v.number(),
  }).index('by_code', ['code']),
  play_members: defineTable({
    room_id: v.id('play_rooms'),
    member_id: v.string(),
    secret: v.string(),
    name: v.string(),
    host: v.boolean(),
    joined_at: v.number(),
    last_seen: v.number(),
  })
    .index('by_room_id_and_joined_at', ['room_id', 'joined_at'])
    .index('by_room_id_and_secret', ['room_id', 'secret'])
    .index('by_last_seen', ['last_seen']),
});
