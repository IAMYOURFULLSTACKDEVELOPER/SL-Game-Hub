import type { GameRoom, RoomParticipant, RoomCreationResponse } from './multiplayer';

/**
 * Game room system for private multiplayer games
 * Note: This is a stub implementation. The actual implementation should use
 * a Convex function in packages/backend/convex.
 */
export class RoomSystem {
  /**
   * Create a new game room
   */
  static async createRoom(
    gameId: string,
    maxPlayers: number = 2
  ): Promise<RoomCreationResponse> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Join a room by code
   */
  static async joinRoom(roomCode: string): Promise<string> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Leave a room
   */
  static async leaveRoom(roomId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get room details
   */
  static async getRoom(roomId: string): Promise<GameRoom> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get room by code
   */
  static async getRoomByCode(roomCode: string): Promise<GameRoom> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get room participants
   */
  static async getParticipants(roomId: string): Promise<RoomParticipant[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Set ready status
   */
  static async setReady(roomId: string, isReady: boolean): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Start the game (host only)
   */
  static async startGame(roomId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * End the game
   */
  static async endGame(roomId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Check if room is full
   */
  static async isRoomFull(roomId: string): Promise<boolean> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get available rooms (for testing/admin)
   */
  static async getAvailableRooms(gameId?: string): Promise<GameRoom[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }
}
