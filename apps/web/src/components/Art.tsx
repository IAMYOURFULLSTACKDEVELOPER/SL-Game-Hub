// Flat vector art in one consistent style: solid fills, a few brand colours, no glows or gradients.
// Motion is CSS only (globals.css "art-*"), so it costs no JS and stops for reduced-motion players.
//
// The mascot is Dado, a friendly die. He shows up wherever the page has nothing else to say:
// loading, empty lists, 404, offline.

const INK = '#1e1f22';
const BRAND = '#5865f2';
const GREEN = '#23a55a';
const YELLOW = '#f0b232';
const PINK = '#eb459e';
const RED = '#f23f43';

/** App logo: a die on a brand-coloured squircle, with the green pip of the Sierra Leone flag. */
export function LogoMark({ size = 36, flat = false }: { size?: number; flat?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" className="logo-mark shrink-0">
      {!flat && <rect width="40" height="40" rx="12" fill={BRAND} />}
      <g className="logo-die">
        <rect x="9.5" y="9.5" width="21" height="21" rx="5.5" fill="#fff" />
        <circle cx="15" cy="15" r="2.1" fill={INK} />
        <circle cx="20" cy="20" r="2.1" fill={GREEN} />
        <circle cx="25" cy="25" r="2.1" fill={INK} />
      </g>
    </svg>
  );
}

/** Dado the die. `mood` changes his face; he bobs and blinks unless reduced motion is on. */
export function Mascot({ size = 120, mood = 'happy', className = '' }: { size?: number; mood?: 'happy' | 'lost' | 'sleepy' | 'cheer'; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size * 1.05} viewBox="0 0 120 126" className={`mascot ${className}`}>
      <ellipse cx="60" cy="118" rx="34" ry="6" fill={INK} opacity=".22" className="art-shadow" />
      <g className="art-bob">
        {mood === 'cheer' && <path d="M22 52 8 38M98 52l14-14" stroke="#fff" strokeWidth="9" strokeLinecap="round" />}
        {mood !== 'cheer' && <path d="M22 70c-8 2-12 8-12 14M98 70c8 2 12 8 12 14" stroke="#fff" strokeWidth="9" strokeLinecap="round" fill="none" />}
        <rect x="18" y="20" width="84" height="84" rx="24" fill="#fff" />
        <rect x="18" y="80" width="84" height="24" rx="12" fill="#e3e5e8" />
        <rect x="18" y="20" width="84" height="84" rx="24" fill="none" stroke={INK} strokeOpacity=".08" strokeWidth="2" />
        {/* pips on top become his "hair" */}
        <circle cx="44" cy="34" r="4.5" fill={BRAND} /><circle cx="60" cy="30" r="4.5" fill={GREEN} /><circle cx="76" cy="34" r="4.5" fill={BRAND} />
        {/* face */}
        {mood === 'sleepy'
          ? <><path d="M40 60c4 3 8 3 12 0M68 60c4 3 8 3 12 0" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" /></>
          : <g className="art-blink"><ellipse cx="46" cy="58" rx="5.5" ry="7" fill={INK} /><ellipse cx="74" cy="58" rx="5.5" ry="7" fill={INK} />
            <circle cx="48" cy="55.5" r="2" fill="#fff" /><circle cx="76" cy="55.5" r="2" fill="#fff" /></g>}
        <ellipse cx="36" cy="70" rx="5" ry="3" fill={PINK} opacity=".45" /><ellipse cx="84" cy="70" rx="5" ry="3" fill={PINK} opacity=".45" />
        {mood === 'lost'
          ? <path d="M50 78c6-4 14-4 20 0" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
          : <path d="M48 72c6 7 18 7 24 0" stroke={INK} strokeWidth="4" strokeLinecap="round" fill={mood === 'cheer' ? INK : 'none'} />}
      </g>
      {mood === 'lost' && <text x="104" y="22" fontSize="28" fontWeight="800" fill={YELLOW} className="art-float-b" fontFamily="system-ui, sans-serif">?</text>}
      {mood === 'sleepy' && <text x="98" y="26" fontSize="18" fontWeight="800" fill={BRAND} className="art-float-b" fontFamily="system-ui, sans-serif">z</text>}
    </svg>
  );
}

const Star = ({ x, y, s = 1, c = '#fff', d = 0 }: { x: number; y: number; s?: number; c?: string; d?: number }) => (
  <path className="art-twinkle" style={{ animationDelay: `${d}s` }} fill={c} transform={`translate(${x} ${y}) scale(${s})`}
    d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z" />
);

/** The home banner scene: Dado with a card, surrounded by floating game pieces. Sits on a brand-coloured banner. */
export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={`hero-art ${className}`} role="img" aria-label="Dado the dice mascot with chess, checkers and card pieces">
      {/* soft hills behind */}
      <path d="M0 250c60-40 120-50 190-30s150 10 230-30v110H0z" fill="#fff" opacity=".1" />
      <path d="M0 270c80-30 160-20 230 0s130 0 190-20v50H0z" fill="#fff" opacity=".12" />
      {/* checkers disc */}
      <g className="art-float-a" style={{ animationDelay: '-1s' }}>
        <ellipse cx="70" cy="200" rx="34" ry="12" fill="#8f1d1d" /><rect x="36" y="186" width="68" height="14" fill="#8f1d1d" />
        <ellipse cx="70" cy="186" rx="34" ry="12" fill={RED} /><ellipse cx="70" cy="186" rx="20" ry="7" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3" />
      </g>
      {/* chess knight */}
      <g className="art-float-b" style={{ animationDelay: '-2s' }} transform="translate(300 70)">
        <path d="M6 84h52l-4-10H10zM12 74h40c-2-12 1-22 6-32 3-7 2-17-5-24-6-6-14-9-22-8L27 4l-5 8C15 16 10 21 7 28c-2 5-3 10-1 13l5 3c4-3 7-4 11-4-2 4-5 8-9 12-4 3-4 7-4 10 1 4 3 8 7 12z" fill={YELLOW} />
        <circle cx="26" cy="25" r="3" fill={INK} />
      </g>
      {/* card */}
      <g className="art-float-a" style={{ animationDelay: '-2.6s' }} transform="translate(330 180) rotate(14)">
        <rect width="54" height="76" rx="9" fill="#fff" /><rect x="6" y="6" width="42" height="64" rx="6" fill={PINK} />
        <circle cx="27" cy="38" r="13" fill="#fff" /><text x="27" y="44" textAnchor="middle" fontSize="16" fontWeight="800" fill={PINK} fontFamily="system-ui, sans-serif">7</text>
      </g>
      {/* Dado in the middle */}
      <g transform="translate(140 60) scale(1.15)"><Mascot size={120} mood="cheer" /></g>
      <Star x={110} y={60} s={1.1} d={0} /><Star x={260} y={40} s={0.7} c={YELLOW} d={0.9} /><Star x={390} y={140} s={0.8} d={1.6} /><Star x={36} y={120} s={0.6} c={YELLOW} d={2.1} />
      <circle cx="240" cy="250" r="5" fill="#fff" opacity=".5" className="art-float-b" /><circle cx="30" cy="40" r="4" fill="#fff" opacity=".4" />
    </svg>
  );
}

/** Loading: Dado bouncing, with a short line of text. */
export function DiceLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16">
      <Mascot size={92} mood="happy" className="mascot-hop" />
      <p className="text-sm font-semibold text-muted">{label}<span className="loading-dots" /></p>
    </div>
  );
}

/** Nothing here (404, empty search, offline): a puzzled Dado. */
export function LostArt() {
  return <div className="mx-auto w-fit"><Mascot size={140} mood="lost" /></div>;
}
