'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import type { RoomApi } from './useRoom';

// Voice chat for an online room. Audio goes straight between browsers (WebRTC, one connection per
// pair of players: fine for rooms of up to 6). Convex only relays the set-up messages (convex/voice.ts)
// and hands out relay (TURN) credentials for networks that block direct calls (voice:iceServers).
//
// Each browser also measures how loud every voice is, so the page can show who is speaking.

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const STUCK_MS = 12_000;      // a call still "connecting" after this is redialled
const DROPPED_MS = 5_000;     // a call that lost its connection for this long is redialled
const SPEAK_LEVEL = 0.035;    // voice loudness (0..1) that counts as speaking
const SPEAK_HOLD_MS = 450;    // keep showing "speaking" briefly through pauses between words

export type PeerStatus = 'connecting' | 'connected' | 'failed';
interface Peer {
  pc: RTCPeerConnection; audio: HTMLAudioElement; pendingIce: RTCIceCandidateInit[];
  since: number; lostAt: number | null; analyser: AnalyserNode | null;
}

export function useVoice(room: RoomApi) {
  const { code, secret } = room;
  const me = room.view?.me?.id ?? null;
  const members = room.view?.members ?? [];
  const meInVoiceOnServer = members.some((m) => m.id === me && m.voice);
  // Who else is in voice, as a stable string so effects only re-run when it really changes
  const othersKey = members.filter((m) => m.voice && m.id !== me).map((m) => m.id).sort().join(',');

  const [on, setOn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerStatus>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [silenced, setSilenced] = useState<Record<string, boolean>>({}); // people you muted for yourself
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [relay, setRelay] = useState(false);
  const [retry, setRetry] = useState(0); // bumps to redial calls that failed or got stuck

  const stream = useRef<MediaStream | null>(null);
  const ice = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const pcs = useRef(new Map<string, Peer>());
  const handled = useRef(new Set<string>());
  const queue = useRef(Promise.resolve()); // handle set-up messages one at a time, in order
  const ctx = useRef<AudioContext | null>(null);
  const localAnalyser = useRef<AnalyserNode | null>(null);
  const lastLoud = useRef<Record<string, number>>({});
  const audioBox = useRef<HTMLDivElement | null>(null);

  const setVoiceM = useMutation(api.voice.setVoice);
  const signalM = useMutation(api.voice.signal);
  const ackM = useMutation(api.voice.ack);
  const iceServersA = useAction(api.voice.iceServers);
  const inbox = useQuery(api.voice.inbox, on && code && secret ? { code, secret } : 'skip');

  const send = useCallback((to: string, kind: 'offer' | 'answer' | 'ice', data: unknown) =>
    code && secret ? signalM({ code, secret, to, kind, data: JSON.stringify(data) }) : Promise.reject(new Error('not in a room')),
  [code, secret, signalM]);

  const analyse = (s: MediaStream): AnalyserNode | null => {
    if (!ctx.current) return null;
    try {
      const a = ctx.current.createAnalyser();
      a.fftSize = 512;
      ctx.current.createMediaStreamSource(s).connect(a); // measured only, never played twice
      return a;
    } catch { return null; }
  };

  const drop = useCallback((id: string) => {
    const p = pcs.current.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    p.audio.remove();
    pcs.current.delete(id);
    setPeers((s) => { const { [id]: _gone, ...rest } = s; return rest; });
  }, []);

  const peer = useCallback((id: string) => {
    const existing = pcs.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    // A real <audio> element in the page: phones are far more willing to play it than a detached one.
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.muted = !!silenced[id];
    audioBox.current?.appendChild(audio);
    stream.current?.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
    const p: Peer = { pc, audio, pendingIce: [], since: Date.now(), lostAt: null, analyser: null };
    pc.onicecandidate = (e) => { if (e.candidate) send(id, 'ice', e.candidate.toJSON()).catch(() => {}); };
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = remote;
      audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
      p.analyser = analyse(remote);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') p.lostAt = null;
      if (st === 'disconnected') p.lostAt = Date.now();
      setPeers((s) => ({ ...s, [id]: st === 'connected' ? 'connected' : st === 'failed' ? 'failed' : 'connecting' }));
    };
    pcs.current.set(id, p);
    setPeers((s) => ({ ...s, [id]: 'connecting' }));
    return p;
  }, [send, silenced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Call everyone in voice, once the server has us in voice too (else our first offer would be refused).
  // The member with the smaller id makes the offer, so two offers never cross.
  useEffect(() => {
    if (!on || !me || !meInVoiceOnServer) return;
    const others = new Set(othersKey ? othersKey.split(',') : []);
    for (const id of [...pcs.current.keys()]) if (!others.has(id)) drop(id);
    for (const id of others) {
      if (pcs.current.has(id) || me > id) continue;
      const { pc } = peer(id);
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => send(id, 'offer', pc.localDescription))
        .catch(() => { // the offer never left: try again shortly
          setPeers((s) => ({ ...s, [id]: 'failed' }));
          setTimeout(() => { if (pcs.current.get(id)?.pc === pc) { drop(id); setRetry((r) => r + 1); } }, 2000);
        });
    }
  }, [on, me, meInVoiceOnServer, othersKey, peer, drop, send, retry]);

  // Answer offers, finish our own offers, and add network candidates.
  useEffect(() => {
    if (!inbox?.length || !code || !secret) return;
    const fresh = inbox.filter((s) => !handled.current.has(s.id));
    if (!fresh.length) return;
    fresh.forEach((s) => handled.current.add(s.id));
    queue.current = queue.current.then(async () => {
      for (const s of fresh) {
        try {
          const data = JSON.parse(s.data);
          if (s.kind === 'offer') {
            drop(s.from); // a new offer always starts a fresh connection
            const p = peer(s.from);
            await p.pc.setRemoteDescription(data);
            for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            await send(s.from, 'answer', p.pc.localDescription);
          } else if (s.kind === 'answer') {
            const p = pcs.current.get(s.from);
            if (p && p.pc.signalingState === 'have-local-offer') {
              await p.pc.setRemoteDescription(data);
              for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
            }
          } else {
            const p = pcs.current.get(s.from);
            if (p?.pc.remoteDescription) await p.pc.addIceCandidate(data);
            else p?.pendingIce.push(data);
          }
        } catch { /* a stale or broken message: the watchdog redials if the call never connects */ }
      }
      await ackM({ code, secret, ids: fresh.map((s) => s.id as Id<'voice_signals'>) }).catch(() => {});
    });
  }, [inbox, code, secret, peer, drop, send, ackM]);

  // Watchdog: redial calls that are stuck connecting, failed, or lost their connection.
  // Whoever made the offer redials; the other side just clears its half so the new offer starts clean.
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const now = Date.now();
      let redial = false;
      for (const [id, p] of pcs.current) {
        const st = p.pc.connectionState;
        const stuck = st !== 'connected' && now - p.since > STUCK_MS;
        const lost = p.lostAt !== null && now - p.lostAt > DROPPED_MS;
        if (st === 'failed' || stuck || lost) {
          drop(id);
          if (me && me < id) redial = true;
        }
      }
      if (redial) setRetry((r) => r + 1);
    }, 2000);
    return () => clearInterval(t);
  }, [on, me, drop]);

  // Who is speaking: measure each voice about ten times a second.
  useEffect(() => {
    if (!on) return;
    const buf = new Uint8Array(512);
    const level = (a: AnalyserNode | null) => {
      if (!a) return 0;
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    };
    const t = setInterval(() => {
      const now = Date.now();
      const next: Record<string, number> = {};
      if (me) next[me] = muted ? 0 : level(localAnalyser.current);
      for (const [id, p] of pcs.current) next[id] = silenced[id] ? 0 : level(p.analyser);
      const talking: Record<string, boolean> = {};
      for (const [id, l] of Object.entries(next)) {
        if (l > SPEAK_LEVEL) lastLoud.current[id] = now;
        talking[id] = now - (lastLoud.current[id] ?? 0) < SPEAK_HOLD_MS;
      }
      setLevels((old) => (Object.keys(next).some((k) => Math.abs((old[k] ?? 0) - next[k]) > 0.02) || Object.keys(old).length !== Object.keys(next).length ? next : old));
      setSpeaking((old) => (Object.keys(talking).some((k) => old[k] !== talking[k]) || Object.keys(old).length !== Object.keys(talking).length ? talking : old));
    }, 100);
    return () => clearInterval(t);
  }, [on, me, muted, silenced]);

  const join = useCallback(async () => {
    if (!code || !secret || joining) return;
    setError(null);
    setJoining(true);
    try {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
        });
      } catch (e) {
        setError((e as DOMException).name === 'NotAllowedError'
          ? 'Microphone access was refused. Allow it in your browser settings to talk.'
          : 'Your microphone could not be started.');
        return;
      }
      // Created inside the tap, so phones allow it to run; it measures voices for the speaking lights.
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx.current = new AC();
        void ctx.current.resume();
        localAnalyser.current = analyse(stream.current);
      } catch { ctx.current = null; }
      if (!audioBox.current) {
        audioBox.current = document.createElement('div');
        audioBox.current.setAttribute('aria-hidden', 'true');
        audioBox.current.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;';
        document.body.appendChild(audioBox.current);
      }
      try {
        const r = await iceServersA({ code, secret });
        ice.current = r.iceServers as RTCIceServer[];
        setRelay(r.relay);
      } catch { ice.current = FALLBACK_ICE; setRelay(false); }
      try {
        await setVoiceM({ code, secret, on: true }); // the server must know before anyone calls us or we call them
      } catch {
        stream.current.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setError('Could not join voice chat. Check your connection.');
        return;
      }
      handled.current.clear();
      setMuted(false);
      setOn(true);
    } finally {
      setJoining(false);
    }
  }, [code, secret, joining, setVoiceM, iceServersA]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    for (const id of [...pcs.current.keys()]) drop(id);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    localAnalyser.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    audioBox.current?.remove();
    audioBox.current = null;
    setOn(false);
    setLevels({}); setSpeaking({}); setAudioBlocked(false);
    if (code && secret) setVoiceM({ code, secret, on: false }).catch(() => {});
  }, [code, secret, drop, setVoiceM]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      stream.current?.getAudioTracks().forEach((t) => { t.enabled = m; });
      return !m;
    });
  }, []);

  /** Mute (or unmute) one person, just for you. */
  const toggleSilence = useCallback((id: string) => {
    setSilenced((s) => {
      const next = { ...s, [id]: !s[id] };
      const p = pcs.current.get(id);
      if (p) p.audio.muted = next[id];
      return next;
    });
  }, []);

  /** Start sound that the browser blocked (must be called from a tap). */
  const unblockAudio = useCallback(() => {
    void ctx.current?.resume();
    const plays = [...pcs.current.values()].map((p) => p.audio.play());
    Promise.all(plays).then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }, []);

  // Left the room: hang up.
  useEffect(() => { if (on && !room.joined) leave(); }, [on, room.joined, leave]);
  // After a reload the server may still think we're in voice: tell it we're not, so nobody calls us.
  useEffect(() => {
    if (!on && !joining && meInVoiceOnServer && code && secret) setVoiceM({ code, secret, on: false }).catch(() => {});
  }, [on, joining, meInVoiceOnServer, code, secret, setVoiceM]);
  // Closing the page or the game screen: stop the microphone.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => () => leaveRef.current(), []);

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined';
  return {
    supported, on, joining, muted, error, peers, levels, speaking, silenced, audioBlocked, relay,
    join, leave, toggleMute, toggleSilence, unblockAudio,
  };
}
export type VoiceApi = ReturnType<typeof useVoice>;
