'use client';
import { useEffect, useState } from 'react';
import { getPrefs, setMusic, setSfx, subscribe, sfx } from '@/lib/sound';
import { Icon } from './Icon';

export function SoundControls() {
  // Start with defaults so server and client HTML match, then read the saved choice.
  const [p, setP] = useState({ sfx: true, music: false });
  useEffect(() => { setP(getPrefs()); return subscribe(setP); }, []);

  return (
    <div className="flex items-center gap-1" data-silent>
      <button type="button" className="btn btn-ghost btn-icon" aria-pressed={p.sfx}
        aria-label={p.sfx ? 'Turn sound effects off' : 'Turn sound effects on'} title={p.sfx ? 'Sound effects on' : 'Sound effects off'}
        onClick={() => { if (p.sfx) sfx('toggleOff'); setSfx(!p.sfx); }}>
        <Icon name={p.sfx ? 'volume' : 'mute'} />
      </button>
      <button type="button" className={`btn btn-ghost btn-icon ${p.music ? 'text-primary' : ''}`} aria-pressed={p.music}
        aria-label={p.music ? 'Stop background music' : 'Play background music'} title={p.music ? 'Music on' : 'Music off'}
        onClick={() => { sfx(p.music ? 'toggleOff' : 'toggleOn'); setMusic(!p.music); }}>
        {p.music
          ? <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
          : <Icon name="music" />}
      </button>
    </div>
  );
}
