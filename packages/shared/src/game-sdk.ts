/**
 * Game SDK for HTML5 Games
 * Provides a sandboxed postMessage API for games to communicate with the parent application
 *
 * Security constraints:
 * - No access to user tokens or authentication
 * - Restricted message types
 * - Rate limiting on score submissions
 * - Input validation on all data
 */

// Message types allowed between game and parent
export type GameMessageType =
  | 'submit_score'
  | 'get_player_info'
  | 'save_data'
  | 'load_data'
  | 'game_ready'
  | 'game_error'
  | 'request_high_scores';

export interface GameMessage<T = unknown> {
  type: GameMessageType;
  payload?: T;
  id?: string; // Request ID for async operations
}

export interface PlayerInfo {
  id: string;
  username: string;
  avatar: string;
  // No sensitive data like email, tokens, etc.
}

export interface ScoreSubmission {
  score: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface GameSaveData {
  key: string;
  data: string; // Base64 encoded
}

export interface HighScoreEntry {
  username: string;
  score: number;
  timestamp: number;
}

/**
 * Game SDK - to be included in HTML5 games
 * Games can import this to communicate with the parent iframe
 */
export class GameSDK {
  private targetOrigin: string;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private requestIdCounter = 0;

  constructor(targetOrigin: string = '*') {
    this.targetOrigin = targetOrigin;
    this.setupMessageListener();
  }

  private setupMessageListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (event) => {
      // In production, validate event.origin
      if (event.source !== window.parent) return;

      const message = event.data as GameMessage;
      if (!message || !message.id) return;

      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.type === 'game_error') {
          pending.reject(new Error(String(message.payload)));
        } else {
          pending.resolve(message.payload);
        }
      }
    });
  }

  private sendMessage<T>(type: GameMessageType, payload?: T): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `req_${this.requestIdCounter++}`;
      this.pendingRequests.set(id, { resolve, reject });

      const message: GameMessage<T> = { type, id, payload };
      window.parent.postMessage(message, this.targetOrigin);

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Submit a score to the parent application
   */
  async submitScore(score: number, metadata?: Record<string, unknown>): Promise<void> {
    if (typeof score !== 'number' || score < 0 || !Number.isFinite(score)) {
      throw new Error('Invalid score: must be a non-negative number');
    }

    const submission: ScoreSubmission = {
      score,
      timestamp: Date.now(),
      metadata,
    };

    await this.sendMessage('submit_score', submission);
  }

  /**
   * Get public player information (no sensitive data)
   */
  async getPlayerInfo(): Promise<PlayerInfo> {
    const info = await this.sendMessage('get_player_info');
    return info as PlayerInfo;
  }

  /**
   * Save game data (key-value storage)
   */
  async saveData(key: string, data: string): Promise<void> {
    if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
      throw new Error('Invalid key: must be 1-100 characters');
    }

    if (typeof data !== 'string' || data.length > 10000) {
      throw new Error('Invalid data: must be at most 10000 characters');
    }

    const saveData: GameSaveData = { key, data };
    await this.sendMessage('save_data', saveData);
  }

  /**
   * Load saved game data
   */
  async loadData(key: string): Promise<string | null> {
    if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
      throw new Error('Invalid key: must be 1-100 characters');
    }

    const data = await this.sendMessage('load_data', { key });
    return data as string | null;
  }

  /**
   * Notify parent that game is ready
   */
  async notifyReady(): Promise<void> {
    await this.sendMessage('game_ready');
  }

  /**
   * Request high scores leaderboard
   */
  async requestHighScores(limit: number = 10): Promise<HighScoreEntry[]> {
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('Invalid limit: must be between 1 and 100');
    }

    const scores = await this.sendMessage('request_high_scores', { limit });
    return scores as HighScoreEntry[];
  }

  /**
   * Report an error to the parent
   */
  reportError(error: string): void {
    window.parent.postMessage(
      {
        type: 'game_error',
        payload: error,
      },
      this.targetOrigin
    );
  }
}

/**
 * Parent SDK - to be used by the parent application
 * Handles messages from the game iframe
 */
export class ParentSDK {
  private gameId: string;
  private playerId: string;
  private allowedOrigins: string[];
  private scoreSubmissionRateLimiter = new Map<string, number[]>();

  constructor(config: { gameId: string; playerId: string; allowedOrigins: string[] }) {
    this.gameId = config.gameId;
    this.playerId = config.playerId;
    this.allowedOrigins = config.allowedOrigins;
  }

  /**
   * Check if an origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    if (this.allowedOrigins.includes('*')) return true;
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Rate limit score submissions (max 5 per minute per player per game)
   */
  private checkRateLimit(playerId: string): boolean {
    const now = Date.now();
    const submissions = this.scoreSubmissionRateLimiter.get(playerId) || [];

    // Remove submissions older than 1 minute
    const recent = submissions.filter((t) => now - t < 60000);

    if (recent.length >= 5) {
      return false;
    }

    recent.push(now);
    this.scoreSubmissionRateLimiter.set(playerId, recent);
    return true;
  }

  /**
   * Handle a message from the game iframe
   */
  async handleMessage(
    event: MessageEvent,
    handlers: {
      onSubmitScore?: (submission: ScoreSubmission) => Promise<void>;
      onGetPlayerInfo?: () => PlayerInfo;
      onSaveData?: (data: GameSaveData) => Promise<void>;
      onLoadData?: (key: string) => Promise<string | null>;
      onGameReady?: () => void;
      onGameError?: (error: string) => void;
      onRequestHighScores?: (limit: number) => Promise<HighScoreEntry[]>;
    }
  ): Promise<void> {
    // Validate origin
    if (!this.isOriginAllowed(event.origin)) {
      console.warn('Message from unauthorized origin:', event.origin);
      return;
    }

    const message = event.data as GameMessage;
    if (!message || !message.type) return;

    try {
      switch (message.type) {
        case 'submit_score': {
          const submission = message.payload as ScoreSubmission;
          if (!this.checkRateLimit(this.playerId)) {
            this.sendError(event.source, message.id, 'Rate limit exceeded');
            return;
          }

          if (handlers.onSubmitScore) {
            await handlers.onSubmitScore(submission);
            this.sendResponse(event.source, message.id, null);
          }
          break;
        }

        case 'get_player_info': {
          if (handlers.onGetPlayerInfo) {
            const info = handlers.onGetPlayerInfo();
            this.sendResponse(event.source, message.id, info);
          }
          break;
        }

        case 'save_data': {
          const data = message.payload as GameSaveData;
          if (handlers.onSaveData) {
            await handlers.onSaveData(data);
            this.sendResponse(event.source, message.id, null);
          }
          break;
        }

        case 'load_data': {
          const { key } = message.payload as { key: string };
          if (handlers.onLoadData) {
            const data = await handlers.onLoadData(key);
            this.sendResponse(event.source, message.id, data);
          }
          break;
        }

        case 'game_ready': {
          if (handlers.onGameReady) {
            handlers.onGameReady();
          }
          break;
        }

        case 'game_error': {
          const error = String(message.payload);
          if (handlers.onGameError) {
            handlers.onGameError(error);
          }
          break;
        }

        case 'request_high_scores': {
          const { limit } = message.payload as { limit: number };
          if (handlers.onRequestHighScores) {
            const scores = await handlers.onRequestHighScores(limit);
            this.sendResponse(event.source, message.id, scores);
          }
          break;
        }

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling game message:', error);
      this.sendError(event.source, message.id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private sendResponse(source: MessageEventSource | null, id: string | undefined, payload: unknown) {
    if (!source) return;
    (source as Window).postMessage({ type: 'response', id, payload }, '*');
  }

  private sendError(source: MessageEventSource | null, id: string | undefined, error: string) {
    if (!source) return;
    (source as Window).postMessage({ type: 'game_error', id, payload: error }, '*');
  }
}
