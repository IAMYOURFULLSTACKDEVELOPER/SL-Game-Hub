import type { GameRoom, RoomParticipant, RoomCreationResponse } from './multiplayer';

/**
 * Game room system for private multiplayer games
 * Note: This is a stub implementation. The actual implementation should use
 * the Supabase client from the app context (web/mobile).
 */
export class RoomSystem {
  /**
   * Create a new game room
   */
  static async createRoom(
    gameId: string,
    maxPlayers: number = 2
  ): Promise<RoomCreationResponse> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Join a room by code
   */
  static async joinRoom(roomCode: string): Promise<string> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Leave a room
   */
  static async leaveRoom(roomId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get room details
   */
  static async getRoom(roomId: string): Promise<GameRoom> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get room by code
   */
  static async getRoomByCode(roomCode: string): Promise<GameRoom> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get room participants
   */
  static async getParticipants(roomId: string): Promise<RoomParticipant[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Set ready status
   */
  static async setReady(roomId: string, isReady: boolean): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Start the game (host only)
   */
  static async startGame(roomId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * End the game
   */
  static async endGame(roomId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Check if room is full
   */
  static async isRoomFull(roomId: string): Promise<boolean> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get available rooms (for testing/admin)
   */
  static async getAvailableRooms(gameId?: string): Promise<GameRoom[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }
}
