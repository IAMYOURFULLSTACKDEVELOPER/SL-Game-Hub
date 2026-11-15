'use client';
import { useMemo } from 'react';
import { MuxVideo } from '@videojs/react/media/mux-video';
import { LiveVideoPlayer, LiveVideoSkin } from '@videojs/react/live-video';
import { VideoPlayer, VideoSkin } from '@videojs/react/video';

// Plays a broadcast (live, a few seconds behind) or a recording of one. Loaded only on /live and the
// admin broadcasts page, so the player never weighs on the rest of the site.
// The skin styles are served from /vendor (see scripts/copy-player-css.mjs for why they aren't imported).

export function BroadcastPlayer({ playbackId, live }: { playbackId: string; live: boolean }) {
  // A new source object reloads the stream, so keep the same one while the playback id is unchanged
  const source = useMemo(() => ({ playbackId }), [playbackId]);
  const media = <MuxVideo key={playbackId} source={source} autoPlay={live} muted={live} playsInline />;
  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <link rel="stylesheet" href={`/vendor/videojs/${live ? 'live-video' : 'video'}-skin.css`} />
      {live
        ? <LiveVideoPlayer><LiveVideoSkin>{media}</LiveVideoSkin></LiveVideoPlayer>
        : <VideoPlayer><VideoSkin>{media}</VideoSkin></VideoPlayer>}
    </div>
  );
}
