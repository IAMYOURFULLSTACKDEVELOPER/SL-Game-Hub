'use client';
import type { RoomApi } from '@/lib/useRoom';
import { useVoice, type VoiceApi } from '@/lib/useVoice';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';
import { Portal } from './Portal';

const MicIcon = ({ off = false, size = 18 }: { off?: boolean; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);
const SpeakerOff = () => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m17 9 5 6M22 9l-5 6" />
  </svg>
);

/** Live sound bars that follow how loud someone is */
function Bars({ level, on }: { level: number; on: boolean }) {
  return (
    <span className={`vc-bars ${on ? 'is-on' : ''}`} aria-hidden>
      {[0.6, 1, 0.75].map((k, i) => <i key={i} style={{ height: `${4 + Math.min(1, level * 2.4 * k) * 12}px` }} />)}
    </span>
  );
}

/** Talk to the other players in an online room. Shown above the lobby and the game. */
export function VoiceChat({ room }: { room: RoomApi }) {
  const voice = useVoice(room);
  if (!room.joined || !voice.supported) return null;
  const me = room.view?.me?.id;
  const inVoice = (room.view?.members ?? []).filter((m) => m.voice);

  if (!voice.on) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg/50 p-3">
        <button type="button" className="btn btn-sm btn-outline" disabled={voice.joining} onClick={() => { sfx('click'); void voice.join(); }}>
          <MicIcon />{voice.joining ? 'Joining…' : 'Join voice chat'}
        </button>
        <span className="min-w-0 flex-1 text-sm text-muted">
          {inVoice.length ? `${inVoice.map((m) => m.name).join(', ')} ${inVoice.length === 1 ? 'is' : 'are'} in voice chat.` : 'Talk with the other players while you play.'}
        </span>
        {voice.error && <p role="alert" className="w-full text-sm font-semibold text-danger">{voice.error}</p>}
      </div>
    );
  }

  const failed = inVoice.filter((m) => m.id !== me && voice.peers[m.id] === 'failed');
  const alone = inVoice.length <= 1;
  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={voice.muted} onClick={() => { voice.toggleMute(); sfx(voice.muted ? 'toggleOn' : 'toggleOff'); }}
          className={`btn btn-sm ${voice.muted ? 'btn-outline text-danger' : 'btn-primary'}`}>
          <MicIcon off={voice.muted} />{voice.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={voice.leave}><Icon name="logout" size={16} />Leave voice</button>
        <span className="text-xs font-semibold text-muted">{voice.muted ? 'You are muted' : alone ? 'Waiting for others to join voice' : 'Your microphone is on'}</span>
      </div>

      {voice.audioBlocked && (
        <button type="button" className="btn btn-primary w-full" onClick={() => { voice.unblockAudio(); sfx('click'); }}>
          <Icon name="volume" size={18} />Tap to hear the others
        </button>
      )}

      <ul className="flex flex-wrap gap-2" aria-label="People in voice chat">
        {inVoice.map((m) => {
          const mine = m.id === me;
          const status = mine ? 'connected' : voice.peers[m.id] ?? 'connecting';
          const talking = !!voice.speaking[m.id] && status === 'connected';
          const level = voice.levels[m.id] ?? 0;
          const silenced = !!voice.silenced[m.id];
          const label = `${m.name}${mine ? ' (you)' : ''}: ${talking ? 'speaking' : status === 'connected' ? 'connected' : status === 'failed' ? 'cannot connect' : 'connecting'}${silenced ? ', muted by you' : ''}`;
          const body = (
            <>
              <span className={`vc-avatar ${talking ? 'is-talking' : ''}`}>
                {m.name[0]?.toUpperCase()}
                <span className={`vc-dot ${status === 'connected' ? 'bg-primary' : status === 'failed' ? 'bg-danger' : 'animate-pulse bg-accent'}`} />
              </span>
              <span className="min-w-0">
                <span className="block max-w-[7rem] truncate text-sm font-semibold">{m.name}{mine ? ' (you)' : ''}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {mine && voice.muted ? <><MicIcon off size={12} />muted</>
                    : silenced ? <><SpeakerOff />muted by you</>
                      : status === 'connected' ? <><Bars level={level} on={talking} />{talking ? 'speaking' : 'quiet'}</>
                        : status === 'failed' ? 'can’t connect' : 'connecting…'}
                </span>
              </span>
            </>
          );
          return (
            <li key={m.id}>
              {mine ? <div className="vc-person" aria-label={label}>{body}</div> : (
                <button type="button" className="vc-person" aria-label={`${label}. Tap to ${silenced ? 'unmute' : 'mute'} them for you.`} aria-pressed={silenced}
                  onClick={() => { voice.toggleSilence(m.id); sfx(silenced ? 'toggleOn' : 'toggleOff'); }}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!alone && <p className="text-xs text-muted">Tap someone to mute them just for you.</p>}

      {failed.length > 0 && (
        <p className="rounded-xl bg-danger/10 p-2.5 text-sm text-danger">
          Can’t reach {failed.map((m) => m.name).join(', ')}.{' '}
          {voice.relay ? 'Retrying… a weak signal can cause this.' : 'Their network (or yours) blocks direct calls, and this site has no voice relay set up yet.'}
        </p>
      )}
      {voice.error && <p role="alert" className="text-sm font-semibold text-danger">{voice.error}</p>}
      <SpeakingNow voice={voice} names={Object.fromEntries(inVoice.map((m) => [m.id, m.id === me ? 'You' : m.name]))} />
    </div>
  );
}

/** A small pill over the game showing who is talking right now, so you can see it while you play. */
function SpeakingNow({ voice, names }: { voice: VoiceApi; names: Record<string, string> }) {
  const talking = Object.keys(voice.speaking).filter((id) => voice.speaking[id] && names[id] && !voice.silenced[id]);
  if (!talking.length) return null;
  return (
    <Portal>
      <div className="vc-floating" role="status" aria-live="polite">
        {talking.slice(0, 3).map((id) => (
          <span key={id} className="flex items-center gap-1.5">
            <span className="vc-avatar is-talking h-7 w-7 text-xs">{names[id][0]?.toUpperCase()}</span>
            <span className="max-w-[6rem] truncate text-sm font-semibold">{names[id]}</span>
            <Bars level={voice.levels[id] ?? 0} on />
          </span>
        ))}
        {talking.length > 3 && <span className="text-sm font-semibold">+{talking.length - 3}</span>}
        <span className="sr-only">{talking.map((id) => names[id]).join(', ')} speaking</span>
      </div>
    </Portal>
  );
}
