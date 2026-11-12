'use client';
// Every sound is synthesised with the Web Audio API: zero audio files to download.
// Browsers only allow audio after a user gesture, so the context is created lazily on the first tap.

export type Sfx =
  | 'click' | 'hover' | 'toggleOn' | 'toggleOff' | 'nav' | 'success' | 'error'
  | 'move' | 'capture' | 'dice' | 'win' | 'lose' | 'pop'
  | 'card' | 'shuffle' | 'coin';

type Prefs = { sfx: boolean; music: boolean };
const KEY = { sfx: 'sfx', music: 'music' } as const;
const listeners = new Set<(p: Prefs) => void>();

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
const prefs: Prefs = { sfx: true, music: false };

function read(k: string, fallback: boolean) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : v === 'on'; } catch { return fallback; }
}
if (typeof window !== 'undefined') { prefs.sfx = read(KEY.sfx, true); prefs.music = read(KEY.music, false); }

export const getPrefs = (): Prefs => ({ ...prefs });
export function subscribe(fn: (p: Prefs) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach((fn) => fn(getPrefs())); }
function save(k: keyof Prefs) { try { localStorage.setItem(KEY[k], prefs[k] ? 'on' : 'off'); } catch { /* private mode */ } }

function audio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from any user gesture: unlocks audio and starts music if the player turned it on. */
export function unlock() {
  if (!audio()) return;
  if (prefs.music) startMusic();
}

// ---------- building blocks ----------
function tone(freq: number, at: number, dur: number, { type = 'sine' as OscillatorType, vol = 0.2, to = 0, attack = 0.004, bus = sfxBus } = {}) {
  const c = ctx!;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at); o.stop(at + dur + 0.02);
}
function hiss(at: number, dur: number, { vol = 0.15, freq = 3000, q = 1, type = 'bandpass' as BiquadFilterType, sweep = 0, bus = sfxBus } = {}) {
  const c = ctx!;
  const s = c.createBufferSource(); s.buffer = noise;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.02);
}
const N = (semis: number) => 440 * 2 ** ((semis - 9) / 12); // semitones from C4

// ---------- sound effects ----------
let lastHover = 0;
export function sfx(name: Sfx) {
  if (!prefs.sfx || typeof window === 'undefined') return;
  const c = audio(); if (!c) return;
  const t = c.currentTime + 0.005;
  switch (name) {
    case 'click': tone(740, t, 0.07, { type: 'triangle', vol: 0.12, to: 1100 }); tone(1480, t, 0.03, { vol: 0.04 }); break;
    case 'hover': {
      if (t - lastHover < 0.06) return; lastHover = t;
      tone(2100, t, 0.03, { vol: 0.018 }); break;
    }
    case 'pop': tone(420, t, 0.09, { vol: 0.16, to: 980 }); break;
    case 'toggleOn': tone(N(7), t, 0.09, { type: 'triangle', vol: 0.12 }); tone(N(12), t + 0.07, 0.14, { type: 'triangle', vol: 0.12 }); break;
    case 'toggleOff': tone(N(12), t, 0.09, { type: 'triangle', vol: 0.1 }); tone(N(5), t + 0.07, 0.14, { type: 'triangle', vol: 0.1 }); break;
    case 'nav': hiss(t, 0.22, { vol: 0.07, freq: 600, sweep: 5000, q: 0.8 }); break;
    case 'success': [0, 4, 7, 12].forEach((s, i) => tone(N(12 + s), t + i * 0.07, 0.3, { type: 'triangle', vol: 0.11 })); break;
    case 'error': tone(N(3), t, 0.16, { type: 'square', vol: 0.05 }); tone(N(-2), t + 0.13, 0.22, { type: 'square', vol: 0.05 }); break;
    case 'move': tone(190, t, 0.12, { vol: 0.3, to: 110 }); hiss(t, 0.04, { vol: 0.08, freq: 2500 }); break;
    case 'capture': tone(260, t, 0.1, { vol: 0.3, to: 90 }); hiss(t, 0.09, { vol: 0.14, freq: 1600, q: 2 }); tone(N(19), t + 0.06, 0.18, { type: 'triangle', vol: 0.06 }); break;
    case 'dice': for (let i = 0; i < 7; i++) hiss(t + i * 0.055 + Math.random() * 0.02, 0.05, { vol: 0.14, freq: 1800 + Math.random() * 2400, q: 3 }); break;
    case 'win': {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(12 + s), t + i * 0.08, 0.5, { type: 'triangle', vol: 0.1 }));
      [0, 4, 7].forEach((s) => tone(N(12 + s), t + 0.62, 0.9, { type: 'sine', vol: 0.08 }));
      for (let i = 0; i < 8; i++) tone(2400 + Math.random() * 2400, t + 0.6 + i * 0.06, 0.12, { vol: 0.02 });
      break;
    }
    case 'card': hiss(t, 0.07, { vol: 0.16, freq: 2600, q: 1.4, sweep: 900 }); tone(320, t, 0.05, { vol: 0.05, to: 180 }); break;
    case 'shuffle': for (let i = 0; i < 9; i++) hiss(t + i * 0.045, 0.05, { vol: 0.09, freq: 2000 + (i % 3) * 700, q: 1.2, sweep: 800 }); break;
    case 'coin': tone(N(28), t, 0.12, { type: 'triangle', vol: 0.09 }); tone(N(35), t + 0.06, 0.3, { type: 'triangle', vol: 0.08 }); break;
    case 'lose': [7, 3, 0, -5].forEach((s, i) => tone(N(s), t + i * 0.16, 0.34, { type: 'triangle', vol: 0.1 })); break;
  }
}

export function setSfx(on: boolean) {
  prefs.sfx = on; save('sfx'); emit();
  if (on) sfx('toggleOn');
}

// ---------- generative background music: kalimba, soft pad, shaker ----------
// A pentatonic loop (I–vi–IV–V) with light randomness so it never repeats exactly.
const BPM = 92;
const STEP = 60 / BPM / 2; // eighth notes
const CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // C, Am, F, G (semitones from C4)
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // C major pentatonic, two octaves
const RHYTHM = [1, 0, 0.55, 0.7, 0, 0.6, 0.35, 0.5]; // per eighth-note probability of a kalimba note
let timer: number | null = null;
let nextAt = 0;
let step = 0;
let lastNote = 4;

function kalimba(freq: number, at: number, vol: number) {
  tone(freq, at, 1.6, { vol, bus: musicBus, attack: 0.003 });
  tone(freq * 4.02, at, 0.25, { vol: vol * 0.25, bus: musicBus, attack: 0.002 });
  tone(freq * 2, at, 0.6, { type: 'triangle', vol: vol * 0.18, bus: musicBus });
}
function pad(semis: number[], at: number, dur: number) {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.05, at + 0.8); g.gain.linearRampToValueAtTime(0.0001, at + dur);
  f.connect(g).connect(musicBus);
  for (const s of semis) {
    for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(s - 12); o.detune.value = det;
      o.connect(f); o.start(at); o.stop(at + dur + 0.05);
    }
  }
}
function schedule() {
  const c = ctx!;
  while (nextAt < c.currentTime + 0.25) {
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const pos = step % 8;
    if (step % 16 === 0) pad(chord, nextAt, STEP * 16);
    if (pos === 0 || pos === 4) tone(N(chord[0] - 24), nextAt, 0.5, { vol: 0.16, bus: musicBus, attack: 0.01 });
    if (pos % 2 === 1) hiss(nextAt, 0.06, { vol: 0.035, freq: 7000, type: 'highpass', bus: musicBus });
    if (Math.random() < RHYTHM[pos]) {
      // Walk the scale, preferring chord tones on strong beats
      const target = pos % 4 === 0 ? SCALE.findIndex((s) => chord.includes(s % 12) || chord.includes((s % 12) - 12)) + (Math.random() < 0.5 ? 0 : 5) : lastNote + Math.round((Math.random() - 0.5) * 4);
      lastNote = Math.max(0, Math.min(SCALE.length - 1, target));
      kalimba(N(SCALE[lastNote]), nextAt + (Math.random() - 0.5) * 0.012, 0.09);
    }
    nextAt += STEP; step++;
  }
}
function startMusic() {
  const c = audio(); if (!c || timer !== null) return;
  nextAt = c.currentTime + 0.1; step = 0;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(0.55, c.currentTime + 2.5);
  timer = window.setInterval(schedule, 100);
  schedule();
}
function stopMusic() {
  if (!ctx || timer === null) return;
  const c = ctx;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
  window.clearInterval(timer); timer = null; // notes already queued fade out with the bus
}
export function setMusic(on: boolean) {
  prefs.music = on; save('music'); emit();
  if (on) { audio(); startMusic(); } else stopMusic();
}

// Pause the music while the tab is hidden: saves battery on phones.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend(); else if (prefs.music || prefs.sfx) void ctx.resume();
  });
}
