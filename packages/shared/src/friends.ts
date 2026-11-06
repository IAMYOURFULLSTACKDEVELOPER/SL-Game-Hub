import type { Friendship, FriendStatus } from './multiplayer';

/**
 * Friend system API
 * Note: This is a stub implementation. The actual implementation should use
 * the Supabase client from the app context (web/mobile).
 */
export class FriendSystem {
  /**
   * Send a friend request to another user
   */
  static async sendFriendRequest(targetUserId: string): Promise<Friendship> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Accept or decline a friend request
   */
  static async respondToFriendRequest(
    friendshipId: string,
    accept: boolean
  ): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Remove a friend (unfriend)
   */
  static async removeFriend(friendshipId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get incoming friend requests
   */
  static async getIncomingRequests(): Promise<Friendship[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get outgoing friend requests
   */
  static async getOutgoingRequests(): Promise<Friendship[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get all friends (accepted friendships)
   */
  static async getFriends(): Promise<Friendship[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Get blocked users
   */
  static async getBlockedUsers(): Promise<Friendship[]> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Block a user
   */
  static async blockUser(targetUserId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Unblock a user
   */
  static async unblockUser(friendshipId: string): Promise<void> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }

  /**
   * Check if two users are friends
   */
  static async areFriends(userId1: string, userId2: string): Promise<boolean> {
    // TODO: Implement with actual Supabase client
    throw new Error('Not implemented - requires Supabase client from app context');
  }
}
