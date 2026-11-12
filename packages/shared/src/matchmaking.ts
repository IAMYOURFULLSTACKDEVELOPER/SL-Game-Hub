import type { MatchmakingQueue, MatchFoundNotification, MatchmakingResponse, EloRating } from './multiplayer';

/**
 * Matchmaking system with Elo-based pairing
 * Note: This is a stub implementation. The actual implementation should use
 * a Convex function in packages/backend/convex.
 */
export class MatchmakingSystem {
  /**
   * Join matchmaking queue for a game
   */
  static async joinQueue(gameId: string): Promise<MatchmakingResponse> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Leave matchmaking queue
   */
  static async leaveQueue(queueId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get current queue status
   */
  static async getQueueStatus(queueId: string): Promise<MatchmakingQueue> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get Elo rating for a user in a specific game
   */
  static async getEloRating(userId: string, gameId: string): Promise<EloRating> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get all Elo ratings for a user
   */
  static async getAllEloRatings(userId: string): Promise<EloRating[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get leaderboard for a game
   */
  static async getLeaderboard(gameId: string, limit: number = 10): Promise<EloRating[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Calculate estimated wait time based on Elo rating
   */
  static async estimateWaitTime(gameId: string, eloRating: number): Promise<number> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Cancel all pending queue entries for user
   */
  static async cancelAllQueues(userId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }
}

/**
 * Real-time matchmaking listener (a Convex query subscription on matchmaking_queue)
 */
export class MatchmakingListener {
  private subscription: any = null;

  /**
   * Listen for match found events
   */
  static onMatchFound(callback: (notification: MatchFoundNotification) => void): void {
    // TODO: Implement with a Convex query subscription
    throw new Error('Not implemented - use a Convex query subscription');
  }

  /**
   * Stop listening for match events
   */
  static unsubscribe(): void {
    // TODO: Implement by dropping the Convex query subscription
    throw new Error('Not implemented - use a Convex query subscription');
  }
}
