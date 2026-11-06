import type { MatchmakingQueue, MatchFoundNotification, MatchmakingResponse, EloRating } from './multiplayer';

/**
 * Matchmaking system with Elo-based pairing
 * Note: This is a stub implementation. The actual implementation should use
 * the Supabase client from the app context (web/mobile).
 */
export class MatchmakingSystem {
  /**
   * Join matchmaking queue for a game
   */
  static async joinQueue(gameId: string): Promise<MatchmakingResponse> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Leave matchmaking queue
   */
  static async leaveQueue(queueId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get current queue status
   */
  static async getQueueStatus(queueId: string): Promise<MatchmakingQueue> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get Elo rating for a user in a specific game
   */
  static async getEloRating(userId: string, gameId: string): Promise<EloRating> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get all Elo ratings for a user
   */
  static async getAllEloRatings(userId: string): Promise<EloRating[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get leaderboard for a game
   */
  static async getLeaderboard(gameId: string, limit: number = 10): Promise<EloRating[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Calculate estimated wait time based on Elo rating
   */
  static async estimateWaitTime(gameId: string, eloRating: number): Promise<number> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Cancel all pending queue entries for user
   */
  static async cancelAllQueues(userId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }
}

/**
 * Real-time matchmaking listener using Supabase Realtime
 */
export class MatchmakingListener {
  private subscription: any = null;

  /**
   * Listen for match found events
   */
  static onMatchFound(callback: (notification: MatchFoundNotification) => void): void {
    // TODO: Implement with Supabase Realtime subscription
    throw new Error('Not implemented - requires Supabase Realtime');
  }

  /**
   * Stop listening for match events
   */
  static unsubscribe(): void {
    // TODO: Implement with Supabase Realtime unsubscribe
    throw new Error('Not implemented - requires Supabase Realtime');
  }
}
