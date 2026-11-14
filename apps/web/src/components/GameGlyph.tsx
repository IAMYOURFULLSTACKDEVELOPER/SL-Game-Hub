// Flat vector icon for each game: a coloured tile with a white glyph, used like a Discord server icon
// in the left rail, on game cards and in page headers. Inline SVG, so nothing extra to download.

const GAMES: Record<string, { bg: string; glyph: JSX.Element }> = {
  chess: {
    bg: '#4e5058',
    glyph: <path fill="#fff" d="M7 20.5h10l-1.2-3H8.2zM8.6 16.5h7c-.4-2.1.2-4 1.1-5.8.7-1.4.3-3.2-.9-4.3-1.1-1-2.6-1.5-4-1.3L11.2 3.5l-1 1.7C8.8 6 7.8 7.2 7.2 8.6c-.4.9-.5 1.9-.2 2.6l1 .6c.7-.5 1.4-.7 2.2-.8-.4.9-1 1.5-1.8 2.3-.7.7-.9 1.4-.7 2.1.1.4.4.8.9 1.1z" />,
  },
  checkers: {
    bg: '#c0392b',
    glyph: <g fill="none" stroke="#fff" strokeWidth="2"><ellipse cx="12" cy="14.5" rx="7" ry="3" /><path d="M5 11.5v3M19 11.5v3" /><ellipse cx="12" cy="11.5" rx="7" ry="3" fill="#c0392b" /><ellipse cx="12" cy="11.5" rx="3.5" ry="1.4" /></g>,
  },
  dice: {
    bg: '#f23f43',
    glyph: <g><rect x="5" y="5" width="14" height="14" rx="3.5" fill="#fff" /><g fill="#f23f43"><circle cx="9" cy="9" r="1.4" /><circle cx="15" cy="9" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="9" cy="15" r="1.4" /><circle cx="15" cy="15" r="1.4" /></g></g>,
  },
  snake: {
    bg: '#23a55a',
    glyph: <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 18.5h7.5a3 3 0 0 0 0-6h-3a3 3 0 0 1 0-6H17" /><circle cx="17.6" cy="6.5" r=".6" fill="#fff" /></g>,
  },
  'snake-and-ladder': {
    bg: '#e0a10b',
    glyph: <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M8.5 3.5v17M15.5 3.5v17M8.5 7.5h7M8.5 12h7M8.5 16.5h7" /></g>,
  },
  'word-search': {
    bg: '#0e9f9f',
    glyph: <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M4 5h3M9.5 5h3M4 9h3M4 13h3" /><circle cx="14" cy="13" r="4" /><path d="m17 16 3.5 3.5" /></g>,
  },
  scrabble: {
    bg: '#b9853b',
    glyph: <g><rect x="5" y="5" width="14" height="14" rx="2.5" fill="#fff" /><text x="11.6" y="16" textAnchor="middle" fontSize="10" fontWeight="800" fill="#7a5420" fontFamily="system-ui, sans-serif">S</text><text x="16.2" y="17.4" textAnchor="middle" fontSize="3.6" fontWeight="700" fill="#7a5420" fontFamily="system-ui, sans-serif">1</text></g>,
  },
  uno: {
    bg: '#eb459e',
    glyph: <g><rect x="4.5" y="6" width="9" height="13" rx="2" fill="#fff" opacity=".55" transform="rotate(-14 9 12.5)" /><rect x="10" y="5" width="9" height="13" rx="2" fill="#fff" transform="rotate(10 14.5 11.5)" /><circle cx="14.5" cy="11.5" r="2.4" fill="#eb459e" transform="rotate(10 14.5 11.5)" /></g>,
  },
  'salone-poly': {
    bg: '#1d7bd6',
    glyph: <g fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"><path d="M4.5 11 12 4.5l7.5 6.5v8.5h-15z" /><path d="M10 19.5V15h4v4.5" /></g>,
  },
};

const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Game icon. `rounded` = the squircle shape; the rail animates its own shape. */
export function GameGlyph({ slug, name, size = 48, className = '' }: { slug: string; name: string; size?: number; className?: string }) {
  const g = GAMES[slug];
  return (
    <span className={`game-glyph ${className}`} style={{ width: size, height: size, background: g?.bg ?? 'rgb(var(--c-primary))' }} aria-hidden="true">
      {g ? <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>{g.glyph}</svg>
        : <span style={{ fontSize: size * 0.34 }} className="font-bold text-white">{initials(name)}</span>}
    </span>
  );
}
