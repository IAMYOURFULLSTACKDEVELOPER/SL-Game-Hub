'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import type { RoomApi } from './useRoom';

// Voice chat for an online room. Audio goes straight between browsers (WebRTC, one connection per
// pair of players: fine for rooms of up to 6). Convex only relays the set-up messages (convex/voice.ts).
// STUN finds each phone's public address. Some mobile networks also need a TURN relay: set
// NEXT_PUBLIC_TURN_URL (comma-separated), NEXT_PUBLIC_TURN_USERNAME and NEXT_PUBLIC_TURN_CREDENTIAL.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL.split(','),
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }] : []),
];

export type PeerStatus = 'connecting' | 'connected' | 'failed';
interface Peer { pc: RTCPeerConnection; audio: HTMLAudioElement; pendingIce: RTCIceCandidateInit[] }

export function useVoice(room: RoomApi) {
  const { code, secret } = room;
  const me = room.view?.me?.id ?? null;
  const members = room.view?.members ?? [];
  const meInVoiceOnServer = members.some((m) => m.id === me && m.voice);
  // Who else is in voice, as a stable string so effects only re-run when it really changes
  const othersKey = members.filter((m) => m.voice && m.id !== me).map((m) => m.id).sort().join(',');

  const [on, setOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerStatus>>({});
  const [retry, setRetry] = useState(0); // bumps to redial connections that failed
  const stream = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, Peer>());
  const handled = useRef(new Set<string>());
  const queue = useRef(Promise.resolve()); // handle set-up messages one at a time, in order

  const setVoiceM = useMutation(api.voice.setVoice);
  const signalM = useMutation(api.voice.signal);
  const ackM = useMutation(api.voice.ack);
  const inbox = useQuery(api.voice.inbox, on && code && secret ? { code, secret } : 'skip');

  const send = useCallback((to: string, kind: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (code && secret) signalM({ code, secret, to, kind, data: JSON.stringify(data) }).catch(() => {});
  }, [code, secret, signalM]);

  const drop = useCallback((id: string) => {
    const p = pcs.current.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    pcs.current.delete(id);
    setPeers((s) => { const { [id]: _gone, ...rest } = s; return rest; });
  }, []);

  const peer = useCallback((id: string) => {
    const existing = pcs.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    audio.autoplay = true;
    stream.current?.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
    pc.onicecandidate = (e) => { if (e.candidate) send(id, 'ice', e.candidate.toJSON()); };
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      setPeers((s) => ({ ...s, [id]: st === 'connected' ? 'connected' : st === 'failed' ? 'failed' : 'connecting' }));
      // The caller redials a broken connection after a short pause (e.g. the network changed).
      if (st === 'failed') setTimeout(() => { if (pcs.current.get(id)?.pc === pc) { drop(id); setRetry((r) => r + 1); } }, 3000);
    };
    const p = { pc, audio, pendingIce: [] };
    pcs.current.set(id, p);
    setPeers((s) => ({ ...s, [id]: 'connecting' }));
    return p;
  }, [send, drop]);

  // Call everyone in voice. The member with the smaller id makes the offer, so two offers never cross.
  useEffect(() => {
    if (!on || !me) return;
    const others = new Set(othersKey ? othersKey.split(',') : []);
    for (const id of [...pcs.current.keys()]) if (!others.has(id)) drop(id);
    for (const id of others) {
      if (pcs.current.has(id) || me > id) continue;
      const { pc } = peer(id);
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => send(id, 'offer', pc.localDescription))
        .catch(() => setPeers((s) => ({ ...s, [id]: 'failed' })));
    }
  }, [on, me, othersKey, peer, drop, send, retry]);

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
            send(s.from, 'answer', p.pc.localDescription);
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
        } catch { /* a stale or broken message: the next offer starts over */ }
      }
      await ackM({ code, secret, ids: fresh.map((s) => s.id as Id<'voice_signals'>) }).catch(() => {});
    });
  }, [inbox, code, secret, peer, drop, send, ackM]);

  const join = useCallback(async () => {
    if (!code || !secret) return;
    setError(null);
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
    handled.current.clear();
    setMuted(false);
    setOn(true);
    await setVoiceM({ code, secret, on: true }).catch(() => setError('Could not join voice chat. Check your connection.'));
  }, [code, secret, setVoiceM]);

  const leave = useCallback(() => {
    for (const id of [...pcs.current.keys()]) drop(id);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOn(false);
    if (code && secret) setVoiceM({ code, secret, on: false }).catch(() => {});
  }, [code, secret, drop, setVoiceM]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      stream.current?.getAudioTracks().forEach((t) => { t.enabled = m; });
      return !m;
    });
  }, []);

  // Left the room: hang up.
  useEffect(() => { if (on && !room.joined) leave(); }, [on, room.joined, leave]);
  // After a reload the server may still think we're in voice: tell it we're not, so nobody calls us.
  useEffect(() => {
    if (!on && meInVoiceOnServer && code && secret) setVoiceM({ code, secret, on: false }).catch(() => {});
  }, [on, meInVoiceOnServer, code, secret, setVoiceM]);
  // Closing the page or the game screen: stop the microphone.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => () => leaveRef.current(), []);

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined';
  return { supported, on, muted, error, peers, join, leave, toggleMute };
}
