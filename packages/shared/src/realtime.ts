import type { GameEvent, TurnTimer } from './multiplayer';

/**
 * Real-time game manager using Supabase Realtime
 * Handles WebSocket connections for multiplayer games
 */
export class RealtimeGameManager {
  private channel: any = null;
  private matchId: string;
  private userId: string;
  private eventListeners: Map<GameEventType, Set<(event: GameEvent) => void>> = new Map();

  constructor(matchId: string, userId: string) {
    this.matchId = matchId;
    this.userId = userId;
  }

  /**
   * Connect to the game channel
   */
  async connect(): Promise<void> {
    // TODO: Implement with Supabase Realtime
    // This would typically look like:
    // const supabase = getSupabaseClient();
    // this.channel = supabase.channel(`game:${this.matchId}`);
    // this.channel.on('broadcast', { event: 'game_event' }, (payload) => {
    //   this.handleEvent(payload.payload);
    // });
    // this.channel.subscribe();
    throw new Error('Not implemented - requires Supabase Realtime');
  }

  /**
   * Disconnect from the game channel
   */
  async disconnect(): Promise<void> {
    if (this.channel) {
      // TODO: Unsubscribe from channel
      this.channel = null;
    }
  }

  /**
   * Send a game event
   */
  async sendEvent(event: Omit<GameEvent, 'match_id' | 'timestamp'>): Promise<void> {
    const fullEvent: GameEvent = {
      ...event,
      match_id: this.matchId,
      timestamp: new Date().toISOString(),
    };

    // TODO: Broadcast event via Supabase Realtime
    // this.channel.send({
    //   type: 'broadcast',
    //   event: 'game_event',
    //   payload: fullEvent,
    // });
    throw new Error('Not implemented - requires Supabase Realtime');
  }

  /**
   * Register event listener
   */
  on(eventType: GameEventType, callback: (event: GameEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off(eventType: GameEventType, callback: (event: GameEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Handle incoming event
   */
  private handleEvent(event: GameEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }
  }

  /**
   * Send a move
   */
  async sendMove(moveData: Record<string, unknown>): Promise<void> {
    await this.sendEvent({
      type: 'move_made',
      user_id: this.userId,
      data: moveData,
    });
  }

  /**
   * Send ready status
   */
  async sendReady(isReady: boolean): Promise<void> {
    await this.sendEvent({
      type: 'player_ready',
      user_id: this.userId,
      data: { is_ready: isReady },
    });
  }

  /**
   * Send forfeit
   */
  async sendForfeit(): Promise<void> {
    await this.sendEvent({
      type: 'player_forfeited',
      user_id: this.userId,
      data: {},
    });
  }

  /**
   * Send chat message
   */
  async sendChatMessage(message: string): Promise<void> {
    await this.sendEvent({
      type: 'chat_message',
      user_id: this.userId,
      data: { message },
    });
  }
}

/**
 * Turn timer manager
 */
export class TurnTimerManager {
  private timer: NodeJS.Timeout | null = null;
  private currentTimeMs: number = 0;
  private maxTimeMs: number;
  private onTick: (remainingMs: number) => void;
  private onTimeout: () => void;

  constructor(
    maxTimeMs: number,
    onTick: (remainingMs: number) => void,
    onTimeout: () => void
  ) {
    this.maxTimeMs = maxTimeMs;
    this.currentTimeMs = maxTimeMs;
    this.onTick = onTick;
    this.onTimeout = onTimeout;
  }

  /**
   * Start the timer
   */
  start(): void {
    this.currentTimeMs = this.maxTimeMs;
    this.tick();
  }

  /**
   * Stop the timer
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.stop();
    this.currentTimeMs = this.maxTimeMs;
  }

  /**
   * Pause the timer
   */
  pause(): void {
    this.stop();
  }

  /**
   * Resume the timer
   */
  resume(): void {
    this.tick();
  }

  /**
   * Get remaining time
   */
  getRemainingTime(): number {
    return this.currentTimeMs;
  }

  /**
   * Timer tick
   */
  private tick(): void {
    this.timer = setTimeout(() => {
      this.currentTimeMs -= 100; // Tick every 100ms
      this.onTick(this.currentTimeMs);

      if (this.currentTimeMs <= 0) {
        this.onTimeout();
      } else {
        this.tick();
      }
    }, 100);
  }
}

/**
 * Reconnection manager for handling network interruptions
 */
export class ReconnectionManager {
  private reconnectAttempts: number = 0;
  private maxAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  private isReconnecting: boolean = false;
  private onReconnect: () => Promise<void>;
  private onReconnectFailed: () => void;

  constructor(
    onReconnect: () => Promise<void>,
    onReconnectFailed: () => void
  ) {
    this.onReconnect = onReconnect;
    this.onReconnectFailed = onReconnectFailed;
  }

  /**
   * Attempt to reconnect
   */
  async reconnect(): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.reconnectAttempts = 0;

    while (this.reconnectAttempts < this.maxAttempts) {
      try {
        await this.onReconnect();
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        return;
      } catch (error) {
        this.reconnectAttempts++;
        const delay = Math.min(
          this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
          this.maxReconnectDelay
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.isReconnecting = false;
    this.onReconnectFailed();
  }

  /**
   * Cancel reconnection attempts
   */
  cancel(): void {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if currently reconnecting
   */
  isActive(): boolean {
    return this.isReconnecting;
  }
}

/**
 * Game state sync manager
 * Ensures all players have the same game state
 */
export class GameStateSync {
  private lastSyncedState: Record<string, unknown> | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private syncIntervalMs: number = 5000; // Sync every 5 seconds

  /**
   * Start syncing game state
   */
  startSync(getState: () => Record<string, unknown>, onStateUpdate: (state: Record<string, unknown>) => void): void {
    this.syncInterval = setInterval(() => {
      const currentState = getState();
      if (JSON.stringify(currentState) !== JSON.stringify(this.lastSyncedState)) {
        this.lastSyncedState = currentState;
        onStateUpdate(currentState);
      }
    }, this.syncIntervalMs);
  }

  /**
   * Stop syncing
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Force sync immediately
   */
  forceSync(getState: () => Record<string, unknown>, onStateUpdate: (state: Record<string, unknown>) => void): void {
    const currentState = getState();
    this.lastSyncedState = currentState;
    onStateUpdate(currentState);
  }
}
