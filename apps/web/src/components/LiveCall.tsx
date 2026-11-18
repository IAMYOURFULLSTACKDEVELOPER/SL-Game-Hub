'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useAction, useMutation } from 'convex/react';
import {
  ConnectionState, Room, RoomEvent, Track, VideoPresets,
  type Participant, type RemoteParticipant, type RemoteTrack,
} from 'livekit-client';
import { api } from '@slgh/backend/convex/_generated/api';
import { playerMessage } from '@slgh/shared/src/errors';
import type { RoomApi } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';
import { Bars, MicIcon, SpeakingNow } from './VoiceChat';

// Voice and video chat through the call server (convex/livekit.ts hands out the tokens). Everyone can talk;
// Pro players can also turn on their camera. Cameras start off and send small video
// (360p, lower on weak connections), so a call stays light on mobile data.

const CameraIcon = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/** Plays one remote audio track (kept outside the visible layout). */
function AudioOut({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

function VideoTile({ p, mine }: { p: Participant; mine: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = p.getTrackPublication(Track.Source.Camera)?.track;
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return (
    <figure className={`relative overflow-hidden rounded-xl bg-black ${p.isSpeaking ? 'ring-2 ring-primary' : ''}`}>
      <video ref={ref} autoPlay playsInline muted className={`aspect-video w-full object-cover ${mine ? '-scale-x-100' : ''}`} />
      <figcaption className="absolute bottom-1 left-1 max-w-[90%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">
        {p.name || 'Player'}{mine ? ' (you)' : ''}
      </figcaption>
    </figure>
  );
}

/** What the call needs from a room: who is in it, and how to get a call token and mark yourself in voice. */
export type CallRoom = {
  joined: boolean;
  members: { id: string; name: string; voice: boolean }[];
  /** Pro players may turn on their camera */
  pro: boolean;
  getToken: () => Promise<{ url: string; token: string; video: boolean }>;
  setVoice: (on: boolean) => Promise<unknown>;
};

/** The call for an online room (every game except Dice, which uses DiceCall). */
export function LiveCall({ room }: { room: RoomApi }) {
  const token = useAction(api.livekit.token);
  const setVoiceM = useMutation(api.voice.setVoice);
  const { code, secret } = room;
  const getToken = useCallback(() => token({ code: code!, secret: secret! }), [token, code, secret]);
  const setVoice = useCallback((on: boolean) => (code && secret ? setVoiceM({ code, secret, on }) : Promise.resolve()), [setVoiceM, code, secret]);
  return (
    <CallPanel room={{
      joined: room.joined && !!code && !!secret, members: room.view?.members ?? [], pro: !!room.view?.me?.pro, getToken, setVoice,
    }} />
  );
}

/** The call for an online Dice room: the signed-in account proves which seat is yours. */
export function DiceCall({ code, members, pro }: { code: string; members: CallRoom['members']; pro: boolean }) {
  const token = useAction(api.livekit.diceToken);
  const setVoiceM = useMutation(api.dice.setVoice);
  const getToken = useCallback(() => token({ code }), [token, code]);
  const setVoice = useCallback((on: boolean) => setVoiceM({ code, on }), [setVoiceM, code]);
  return <CallPanel room={{ joined: true, members, pro, getToken, setVoice }} />;
}

export function CallPanel({ room }: { room: CallRoom }) {
  const { getToken, setVoice } = room;
  const [call, setCall] = useState<Room | null>(null);
  const [video, setVideo] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [silenced, setSilenced] = useState<Record<string, boolean>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const callRef = useRef<Room | null>(null);

  const inVoice = room.members.filter((m) => m.voice);
  const proHere = room.pro;

  const leave = useCallback(async (quiet = false) => {
    const c = callRef.current;
    callRef.current = null;
    setCall(null);
    if (c) await c.disconnect();
    if (!quiet) await setVoice(false).catch(() => {});
  }, [setVoice]);

  // Leave the call when the page closes or the player leaves the room
  useEffect(() => () => { void callRef.current?.disconnect(); }, []);
  useEffect(() => { if (!room.joined && callRef.current) void leave(true); }, [room.joined, leave]);
  // Sound bars follow how loud each voice is, so refresh a few times a second while in the call
  useEffect(() => {
    if (!call) return;
    const t = setInterval(() => { if (call.activeSpeakers.length) rerender(); }, 250);
    return () => clearInterval(t);
  }, [call]);

  const join = async () => {
    if (!room.joined) return;
    setJoining(true); setError(null);
    try {
      const { url, token, video: mayShowVideo } = await getToken();
      const c = new Room({
        adaptiveStream: true, // only download video at the size it is shown
        dynacast: true, // stop sending video layers nobody is watching
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
      });
      for (const e of [
        RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged, RoomEvent.AudioPlaybackStatusChanged, RoomEvent.ConnectionStateChanged,
      ] as const) c.on(e, rerender);
      c.on(RoomEvent.Disconnected, () => { if (callRef.current === c) { callRef.current = null; setCall(null); } });
      await c.connect(url, token);
      callRef.current = c;
      setCall(c);
      setVideo(mayShowVideo);
      await setVoice(true);
      try { await c.localParticipant.setMicrophoneEnabled(true); } catch { setError('Allow the microphone in your browser to talk.'); }
      sfx('toggleOn');
    } catch (e) {
      setError(playerMessage(e));
      await leave(true);
    } finally {
      setJoining(false);
    }
  };

  const toggle = async (what: 'mic' | 'camera') => {
    const c = callRef.current;
    if (!c) return;
    setError(null);
    const lp = c.localParticipant;
    try {
      if (what === 'mic') await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
      else await lp.setCameraEnabled(!lp.isCameraEnabled);
      sfx((what === 'mic' ? lp.isMicrophoneEnabled : lp.isCameraEnabled) ? 'toggleOn' : 'toggleOff');
    } catch {
      setError(what === 'mic' ? 'Allow the microphone in your browser to talk.' : 'Allow the camera in your browser to show your video.');
    }
    rerender();
  };

  const silence = (p: RemoteParticipant) => {
    const off = !silenced[p.identity];
    p.setVolume(off ? 0 : 1);
    setSilenced((s) => ({ ...s, [p.identity]: off }));
    sfx(off ? 'toggleOff' : 'toggleOn');
  };

  if (!call) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg/50 p-3">
        <button type="button" className="btn btn-sm btn-outline" disabled={joining} onClick={() => { sfx('click'); void join(); }}>
          <MicIcon />{joining ? 'Joining…' : 'Join voice chat'}
        </button>
        <span className="min-w-0 flex-1 text-sm text-muted">
          {inVoice.length ? `${inVoice.map((m) => m.name).join(', ')} ${inVoice.length === 1 ? 'is' : 'are'} in the call.` : 'Talk with the other players while you play.'}
          {proHere ? ' You can also turn on your camera.' : <> <Link href="/pro" className="font-semibold text-secondary">Pro</Link> players can also use their camera.</>}
        </span>
        {error && <p role="alert" className="w-full text-sm font-semibold text-danger">{error}</p>}
      </div>
    );
  }

  const lp = call.localParticipant;
  const remotes = [...call.remoteParticipants.values()];
  const everyone: Participant[] = [lp, ...remotes];
  const withVideo = everyone.filter((p) => { const pub = p.getTrackPublication(Track.Source.Camera); return pub?.track && !pub.isMuted; });
  const reconnecting = call.state === ConnectionState.Reconnecting;
  const micOn = lp.isMicrophoneEnabled;

  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={!micOn} onClick={() => void toggle('mic')} className={`btn btn-sm ${micOn ? 'btn-primary' : 'btn-outline text-danger'}`}>
          <MicIcon off={!micOn} />{micOn ? 'Mute' : 'Unmute'}
        </button>
        {video && (
          <>
            <button type="button" aria-pressed={lp.isCameraEnabled} onClick={() => void toggle('camera')} className={`btn btn-sm ${lp.isCameraEnabled ? 'btn-primary' : 'btn-outline'}`}>
              <CameraIcon off={!lp.isCameraEnabled} />{lp.isCameraEnabled ? 'Camera off' : 'Camera on'}
            </button>
          </>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx('toggleOff'); void leave(); }}><Icon name="logout" size={16} />Leave call</button>
        <span className="text-xs font-semibold text-muted">
          {reconnecting ? 'Reconnecting…'
            : !micOn ? 'You are muted' : remotes.length ? 'Your microphone is on' : 'Waiting for others to join the call'}
        </span>
      </div>

      {!call.canPlaybackAudio && (
        <button type="button" className="btn btn-primary w-full" onClick={() => { void call.startAudio().then(rerender); sfx('click'); }}>
          <Icon name="volume" size={18} />Tap to hear the others
        </button>
      )}

      {withVideo.length > 0 && (
        <div className={`grid gap-2 ${withVideo.length === 1 ? 'grid-cols-1 sm:max-w-sm' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {withVideo.map((p) => <VideoTile key={p.identity} p={p} mine={p === lp} />)}
        </div>
      )}

      <ul className="flex flex-wrap gap-2" aria-label="People in the call">
        {everyone.map((p) => {
          const mine = p === lp;
          const mic = p.getTrackPublication(Track.Source.Microphone);
          const muted = !mic || mic.isMuted;
          const off = !!silenced[p.identity];
          const name = `${p.name || 'Player'}${mine ? ' (you)' : ''}`;
          const body = (
            <>
              <span className={`vc-avatar ${p.isSpeaking ? 'is-talking' : ''}`}>
                {(p.name || '?')[0]?.toUpperCase()}
                <span className="vc-dot bg-primary" />
              </span>
              <span className="min-w-0">
                <span className="block max-w-[7rem] truncate text-sm font-semibold">{name}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {off ? 'muted by you'
                    : muted ? <><MicIcon off size={12} />muted</>
                        : <><Bars level={p.audioLevel} on={p.isSpeaking} />{p.isSpeaking ? 'speaking' : 'quiet'}</>}
                </span>
              </span>
            </>
          );
          return (
            <li key={p.identity}>
              {mine ? <div className="vc-person" aria-label={name}>{body}</div> : (
                <button type="button" className="vc-person" aria-pressed={off} aria-label={`${name}. Tap to ${off ? 'unmute' : 'mute'} them for you.`}
                  onClick={() => silence(p as RemoteParticipant)}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {remotes.length > 0 && <p className="text-xs text-muted">Tap someone to mute them just for you.</p>}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}

      <div hidden>
        {remotes.map((p) => {
          const t = p.getTrackPublication(Track.Source.Microphone)?.track;
          return t ? <AudioOut key={p.identity} track={t} /> : null;
        })}
      </div>
      <SpeakingNow people={call.activeSpeakers.filter((p) => !silenced[p.identity])
        .map((p) => ({ id: p.identity, name: p === lp ? 'You' : p.name || 'Player', level: p.audioLevel }))} />
    </div>
  );
}
