import type { AntiCheatReport, RateLimitInfo } from './multiplayer';

/**
 * Anti-cheat system for multiplayer games
 * Validates moves, detects suspicious behavior, and handles abuse reporting
 */
export class AntiCheatSystem {
  private static readonly suspiciousMoveThreshold: number = 5;
  private static readonly timePerMoveMs: number = 30000; // 30 seconds max per move
  private static readonly maxRapidMoves: number = 3;
  private static readonly rapidMoveWindowMs: number = 1000; // 1 second

  /**
   * Validate a move for cheating
   */
  static validateMove(
    move: Record<string, unknown>,
    gameState: Record<string, unknown>,
    previousMoveTime: number
  ): { valid: boolean; reason?: string } {
    // TODO: Implement move validation based on game rules
    // This would check:
    // - Move is legal according to game rules
    // - Move timing is reasonable (not too fast)
    // - Move doesn't exploit game bugs
    return { valid: true };
  }

  /**
   * Check for suspicious rapid moves (possible bot)
   */
  static checkRapidMoves(moveTimes: number[]): boolean {
    if (moveTimes.length < this.maxRapidMoves) return false;

    const recentMoves = moveTimes.slice(-this.maxRapidMoves);
    const timeSpan = recentMoves[recentMoves.length - 1] - recentMoves[0];

    return timeSpan < this.rapidMoveWindowMs;
  }

  /**
   * Check for impossible moves (e.g., teleporting pieces)
   */
  static checkImpossibleMoves(
    move: Record<string, unknown>,
    gameState: Record<string, unknown>
  ): boolean {
    // TODO: Implement based on game-specific rules
    return false;
  }

  /**
   * Check for pattern-based cheating (repetitive moves)
   */
  static checkPatternCheating(moveHistory: Record<string, unknown>[]): boolean {
    if (moveHistory.length < 10) return false;

    // Check for repetitive patterns
    const recentMoves = moveHistory.slice(-10);
    const pattern = JSON.stringify(recentMoves.slice(0, 5));
    const pattern2 = JSON.stringify(recentMoves.slice(5));

    return pattern === pattern2;
  }

  /**
   * Submit an anti-cheat report
   */
  static async submitReport(report: Omit<AntiCheatReport, 'id' | 'created_at'>): Promise<string> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get anti-cheat reports for a user
   */
  static async getReportsForUser(userId: string): Promise<AntiCheatReport[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get anti-cheat reports for a match
   */
  static async getReportsForMatch(matchId: string): Promise<AntiCheatReport[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }
}

/**
 * Rate limiting system to prevent abuse
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private limits: Map<string, { perMinute: number; perHour: number }> = new Map();

  constructor() {
    // Default limits
    this.setLimit('default', { perMinute: 60, perHour: 1000 });
    this.setLimit('matchmaking', { perMinute: 10, perHour: 100 });
    this.setLimit('friend_request', { perMinute: 5, perHour: 30 });
    this.setLimit('chat', { perMinute: 20, perHour: 200 });
  }

  /**
   * Set rate limit for a specific action
   */
  setLimit(action: string, limit: { perMinute: number; perHour: number }): void {
    this.limits.set(action, limit);
  }

  /**
   * Check if action is allowed
   */
  checkLimit(userId: string, action: string): { allowed: boolean; info: RateLimitInfo } {
    const now = Date.now();
    const limit = this.limits.get(action) || this.limits.get('default')!;
    const key = `${userId}:${action}`;

    const userRequests = this.requests.get(key) || [];

    // Filter out old requests (older than 1 hour)
    const oneHourAgo = now - 3600000;
    const recentRequests = userRequests.filter((timestamp) => timestamp > oneHourAgo);

    // Count requests in last minute
    const oneMinuteAgo = now - 60000;
    const minuteCount = recentRequests.filter((timestamp) => timestamp > oneMinuteAgo).length;
    const hourCount = recentRequests.length;

    const allowed = minuteCount < limit.perMinute && hourCount < limit.perHour;

    if (allowed) {
      recentRequests.push(now);
      this.requests.set(key, recentRequests);
    }

    return {
      allowed,
      info: {
        requests_per_minute: limit.perMinute,
        requests_per_hour: limit.perHour,
        current_minute: minuteCount,
        current_hour: hourCount,
        reset_at: new Date(oneMinuteAgo + 60000).toISOString(),
      },
    };
  }

  /**
   * Reset rate limit for a user (admin only)
   */
  resetLimit(userId: string, action: string): void {
    const key = `${userId}:${action}`;
    this.requests.delete(key);
  }

  /**
   * Clear all rate limits (for testing)
   */
  clearAll(): void {
    this.requests.clear();
  }
}

/**
 * Abuse reporting system
 */
export class AbuseReporter {
  /**
   * Report a user for abuse
   */
  static async reportUser(report: {
    reporter_id: string;
    reported_user_id: string;
    match_id?: string;
    reason: string;
    details?: string;
    evidence?: string;
  }): Promise<string> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get abuse reports submitted by user
   */
  static async getSubmittedReports(userId: string): Promise<AntiCheatReport[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get abuse reports against user
   */
  static async getReportsAgainstUser(userId: string): Promise<AntiCheatReport[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get open abuse reports (admin only)
   */
  static async getOpenReports(): Promise<AntiCheatReport[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Resolve an abuse report (admin only)
   */
  static async resolveReport(
    reportId: string,
    resolvedBy: string,
    resolution: 'resolved' | 'dismissed',
    notes?: string
  ): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }
}

/**
 * Session validator for preventing session hijacking
 */
export class SessionValidator {
  private lastActivity: Map<string, number> = new Map();
  private sessionTimeoutMs: number = 1800000; // 30 minutes

  /**
   * Validate session
   */
  validateSession(userId: string): boolean {
    const lastActivity = this.lastActivity.get(userId) || 0;
    const now = Date.now();

    if (now - lastActivity > this.sessionTimeoutMs) {
      return false;
    }

    this.lastActivity.set(userId, now);
    return true;
  }

  /**
   * Update session activity
   */
  updateActivity(userId: string): void {
    this.lastActivity.set(userId, Date.now());
  }

  /**
   * Invalidate session
   */
  invalidateSession(userId: string): void {
    this.lastActivity.delete(userId);
  }

  /**
   * Check for concurrent sessions
   */
  checkConcurrentSessions(userId: string, sessionId: string): boolean {
    // TODO: Implement session tracking
    return true;
  }
}

/**
 * Move validator with server-side validation
 */
export class MoveValidator {
  /**
   * Validate move server-side
   */
  static async validateServerMove(
    matchId: string,
    userId: string,
    move: Record<string, unknown>,
    gameState: Record<string, unknown>
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if it's the user's turn
    // Check if move is legal
    // Check timing
    // Check for suspicious patterns
    return { valid: true };
  }

  /**
   * Validate game state integrity
   */
  static validateGameState(gameState: Record<string, unknown>): boolean {
    // Check if game state is valid
    // Check for impossible values
    // Check for corruption
    return true;
  }

  /**
   * Detect state tampering
   */
  static detectTampering(
    clientState: Record<string, unknown>,
    serverState: Record<string, unknown>
  ): boolean {
    // Compare client and server states
    return JSON.stringify(clientState) !== JSON.stringify(serverState);
  }
}
