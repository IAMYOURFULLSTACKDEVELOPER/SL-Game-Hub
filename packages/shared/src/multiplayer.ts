/** Friend status */
export type FriendStatus = 'pending' | 'accepted' | 'blocked';

/** Friendship relationship */
export interface Friendship {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
}

/** Room status */
export type RoomStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

/** Game room for private multiplayer */
export interface GameRoom {
  id: string;
  room_code: string;
  host_id: string;
  game_id: string;
  max_players: number;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Room participant */
export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_ready: boolean;
}

/** Queue status */
export type QueueStatus = 'queued' | 'matched' | 'cancelled' | 'timeout';

/** Matchmaking queue entry */
export interface MatchmakingQueue {
  id: string;
  user_id: string;
  game_id: string;
  status: QueueStatus;
  elo_rating: number;
  queued_at: string;
  matched_at: string | null;
  timeout_at: string;
}

/** Match result */
export type MatchResult = 'win' | 'loss' | 'draw' | 'forfeit' | 'abandoned';

/** Game match record */
export interface GameMatch {
  id: string;
  room_id: string | null;
  game_id: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  final_state: Record<string, unknown> | null;
  created_at: string;
}

/** Match participant with results */
export interface MatchParticipant {
  id: string;
  match_id: string;
  user_id: string;
  result: MatchResult;
  score: number;
  elo_change: number;
  new_elo: number;
  moves_made: number;
  time_used_ms: number;
}

/** Elo rating per game */
export interface EloRating {
  user_id: string;
  game_id: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string;
}

/** Game move for replay */
export interface GameMove {
  id: string;
  match_id: string;
  user_id: string;
  move_order: number;
  move_data: Record<string, unknown>;
  timestamp: string;
}

/** Friend request response */
export interface FriendRequestResponse {
  friendship_id: string;
  status: FriendStatus;
}

/** Room creation response */
export interface RoomCreationResponse {
  room_id: string;
  room_code: string;
}

/** Matchmaking entry response */
export interface MatchmakingResponse {
  queue_id: string;
  estimated_wait_time?: number;
}

/** Match found notification */
export interface MatchFoundNotification {
  match_id: string;
  room_id: string;
  game_id: string;
  participants: Array<{
    user_id: string;
    username: string;
    elo_rating: number;
  }>;
}

/** Real-time game event types */
export type GameEventType =
  | 'player_joined'
  | 'player_left'
  | 'player_ready'
  | 'game_started'
  | 'move_made'
  | 'turn_changed'
  | 'game_ended'
  | 'player_forfeited'
  | 'chat_message';

/** Real-time game event */
export interface GameEvent {
  type: GameEventType;
  match_id: string;
  user_id?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/** Turn timer state */
export interface TurnTimer {
  player_id: string;
  time_remaining_ms: number;
  turn_started_at: string;
  max_time_ms: number;
}

/** Anti-cheat report */
export interface AntiCheatReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  match_id: string;
  reason: string;
  details: string;
  evidence?: string;
  created_at: string;
}

/** Rate limit info */
export interface RateLimitInfo {
  requests_per_minute: number;
  requests_per_hour: number;
  current_minute: number;
  current_hour: number;
  reset_at: string;
}
