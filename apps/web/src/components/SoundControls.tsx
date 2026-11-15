'use client';
import { useEffect, useRef, useState } from 'react';
import { getPrefs, setMusic, setSfx, subscribe, sfx } from '@/lib/sound';
import { getMusic, subscribeMusic, playLink, stopMyMusic, useCanChooseMusic } from '@/lib/music';
import { SourceLogo } from './MusicDock';
import { Icon } from './Icon';

export function SoundControls() {
  // Start with defaults so server and client HTML match, then read the saved choice.
  const [p, setP] = useState({ sfx: true, music: false });
  const [mine, setMine] = useState<ReturnType<typeof getMusic>['track']>(null);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [bad, setBad] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canChoose = useCanChooseMusic();
  useEffect(() => { setP(getPrefs()); return subscribe(setP); }, []);
  useEffect(() => { setMine(getMusic().track); return subscribeMusic(() => setMine(getMusic().track)); }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const playing = p.music || !!mine;
  const beats = (on: boolean) => { sfx(on ? 'toggleOn' : 'toggleOff'); if (on) stopMyMusic(); setMusic(on); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = playLink(link);
    if (!t) { setBad(true); sfx('error'); return; }
    setMusic(false); // one soundtrack at a time
    setBad(false); setLink(''); setOpen(false); sfx('success');
  };

  return (
    <div ref={box} className="flex items-center" data-silent>
      <button type="button" className={`btn btn-ghost btn-icon ${p.sfx ? '' : 'text-danger hover:text-danger'}`} aria-pressed={p.sfx}
        aria-label={p.sfx ? 'Turn sound effects off' : 'Turn sound effects on'} title={p.sfx ? 'Sound effects on' : 'Sound effects off'}
        onClick={() => { if (p.sfx) sfx('toggleOff'); setSfx(!p.sfx); }}>
        <Icon name={p.sfx ? 'volume' : 'mute'} size={20} />
      </button>
      <button type="button" className={`btn btn-ghost btn-icon ${playing ? 'text-success' : ''}`} aria-expanded={open} aria-haspopup="dialog"
        aria-label="Music" title="Music" onClick={() => { sfx('pop'); setOpen((o) => !o); }}>
        {playing ? <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span> : <Icon name="music" size={20} />}
      </button>

      <div className={`menu-pop music-pop ${open ? 'is-open' : ''}`} role="dialog" aria-label="Music" {...(!open ? { inert: "" } : {}) as object}>
        <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-muted">Music</p>
        <button type="button" className="menu-item" role="switch" aria-checked={p.music} onClick={() => beats(!p.music)}>
          <Icon name="music" size={18} />
          <span className="flex-1">Dodo beats</span>
          <span className={`switch ${p.music ? 'is-on' : ''}`} aria-hidden />
        </button>
        <div className="menu-sep" />
        {mine && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
            <SourceLogo source={mine.source} />
            <span className="min-w-0 flex-1 truncate">Playing your {mine.kind} from {mine.source === 'spotify' ? 'Spotify' : 'Apple Music'}</span>
            <button type="button" className="btn btn-sm btn-secondary min-h-[28px] px-2" onClick={() => { stopMyMusic(); sfx('toggleOff'); }}>Stop</button>
          </div>
        )}
        {canChoose && <form onSubmit={submit} className="space-y-2 p-2">
          <label htmlFor="music-link" className="flex items-center gap-1.5 text-[13px] font-semibold text-heading">
            <SourceLogo source="spotify" size={14} /><SourceLogo source="apple" size={14} />Play your own music
          </label>
          <div className="flex gap-1.5">
            <input id="music-link" className="input min-h-[34px] min-w-0 flex-1 text-sm" value={link} inputMode="url" autoComplete="off"
              placeholder="Paste a link…" aria-invalid={bad} aria-describedby="music-help"
              onChange={(e) => { setLink(e.target.value); setBad(false); }} />
            <button className="btn btn-success btn-sm" disabled={!link.trim()} aria-label="Play"><Icon name="play" size={16} /></button>
          </div>
          <p id="music-help" className={`text-xs leading-snug ${bad ? 'text-danger' : 'text-muted'}`}>
            {bad
              ? 'That isn’t a Spotify or Apple Music link. In the app, tap Share › Copy link on a song, album or playlist.'
              : 'Any song, album or playlist. Spotify Premium or Apple Music members signed in on this browser hear full songs; others hear previews.'}
          </p>
        </form>}
      </div>
    </div>
  );
}
