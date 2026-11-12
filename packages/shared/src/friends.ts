import type { Friendship, FriendStatus } from './multiplayer';

/**
 * Friend system API
 * Note: This is a stub implementation. The actual implementation should use
 * a Convex function in packages/backend/convex.
 */
export class FriendSystem {
  /**
   * Send a friend request to another user
   */
  static async sendFriendRequest(targetUserId: string): Promise<Friendship> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Accept or decline a friend request
   */
  static async respondToFriendRequest(
    friendshipId: string,
    accept: boolean
  ): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Remove a friend (unfriend)
   */
  static async removeFriend(friendshipId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get incoming friend requests
   */
  static async getIncomingRequests(): Promise<Friendship[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get outgoing friend requests
   */
  static async getOutgoingRequests(): Promise<Friendship[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get all friends (accepted friendships)
   */
  static async getFriends(): Promise<Friendship[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Get blocked users
   */
  static async getBlockedUsers(): Promise<Friendship[]> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Block a user
   */
  static async blockUser(targetUserId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Unblock a user
   */
  static async unblockUser(friendshipId: string): Promise<void> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }

  /**
   * Check if two users are friends
   */
  static async areFriends(userId1: string, userId2: string): Promise<boolean> {
    // TODO: Implement with a Convex function
    throw new Error('Not implemented - requires a Convex function (packages/backend/convex)');
  }
}
