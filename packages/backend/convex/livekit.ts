'use node';
import { ConvexError, v } from 'convex/values';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { action } from './_generated/server';
import { internal } from './_generated/api';

// Call tokens for video and voice chat in online rooms (LiveKit). A token lets one room member into that room's
// call for a few hours. Everyone may send their microphone; only Pro players may also send their camera.
// The API secret never leaves the server.
//
// Deployment environment (`npx convex env set NAME value` in packages/backend):
//   LIVEKIT_URL         wss://<project>.livekit.cloud (or your own server)
//   LIVEKIT_API_KEY     API key from the LiveKit project settings
//   LIVEKIT_API_SECRET  its secret

const TOKEN_TTL = '4h';

export const token = action({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, args): Promise<{ url: string; token: string; video: boolean }> => {
    const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !apiSecret) throw new ConvexError('Video chat is not set up yet.');
    const pass = await ctx.runQuery(internal.voice.callPass, args);
    if (!pass) throw new ConvexError('Join the room first.');
    const at = new AccessToken(key, apiSecret, { identity: pass.memberId, name: pass.name, ttl: TOKEN_TTL });
    at.addGrant({
      room: `dodo-${pass.roomId}`,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: pass.video ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE],
      canUpdateOwnMetadata: false,
    });
    return { url, token: await at.toJwt(), video: pass.video };
  },
});
