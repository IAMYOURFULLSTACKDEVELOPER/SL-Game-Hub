'use client';
import type { RoomApi } from '@/lib/useRoom';
import { useVoice } from '@/lib/useVoice';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';

const MicIcon = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

/** Talk to the other players in an online room. Shown above the lobby and the game. */
export function VoiceChat({ room }: { room: RoomApi }) {
  const voice = useVoice(room);
  if (!room.joined || !voice.supported) return null;
  const me = room.view?.me?.id;
  const inVoice = (room.view?.members ?? []).filter((m) => m.voice);

  if (!voice.on) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg/50 p-3">
        <button type="button" className="btn btn-sm btn-outline" onClick={() => { sfx('click'); void voice.join(); }}>
          <MicIcon />Join voice chat
        </button>
        <span className="min-w-0 flex-1 text-sm text-muted">
          {inVoice.length ? `${inVoice.map((m) => m.name).join(', ')} ${inVoice.length === 1 ? 'is' : 'are'} talking.` : 'Talk with the other players while you play.'}
        </span>
        {voice.error && <p role="alert" className="w-full text-sm font-semibold text-danger">{voice.error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={voice.muted} onClick={() => { voice.toggleMute(); sfx(voice.muted ? 'toggleOn' : 'toggleOff'); }}
          className={`btn btn-sm ${voice.muted ? 'btn-outline text-danger' : 'btn-primary'}`}>
          <MicIcon off={voice.muted} />{voice.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={voice.leave}><Icon name="logout" size={16} />Leave voice</button>
        <span className="text-xs font-semibold text-muted">{voice.muted ? 'You are muted' : 'Your microphone is on'}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {inVoice.map((m) => {
          const status = m.id === me ? 'connected' : voice.peers[m.id] ?? 'connecting';
          return (
            <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-sm">
              <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-primary' : status === 'failed' ? 'bg-danger' : 'animate-pulse bg-accent'}`} />
              {m.name}{m.id === me ? ' (you)' : ''}
              {status === 'failed' && <span className="text-xs text-danger">retrying</span>}
            </li>
          );
        })}
      </ul>
      {voice.error && <p role="alert" className="text-sm font-semibold text-danger">{voice.error}</p>}
    </div>
  );
}
