// Animated vector art. Pure SVG + CSS keyframes (see globals.css "art-*"), so it costs no JS and
// stops automatically for players who ask for reduced motion.

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" className="logo-mark shrink-0">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1EB53A" /><stop offset=".55" stopColor="#0aa37a" /><stop offset="1" stopColor="#0072C6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#lm-g)" />
      <rect x="1" y="1" width="38" height="19" rx="11" fill="#fff" opacity=".12" />
      <g className="logo-die">
        <rect x="10" y="10" width="20" height="20" rx="5" fill="#fff" />
        <circle cx="15.5" cy="15.5" r="2" fill="#0c1b33" />
        <circle cx="20" cy="20" r="2" fill="#1EB53A" />
        <circle cx="24.5" cy="24.5" r="2" fill="#0c1b33" />
      </g>
      <path className="art-twinkle" d="M33 4l1 2.6 2.6 1-2.6 1L33 11.2l-1-2.6-2.6-1 2.6-1z" fill="#FCC440" />
    </svg>
  );
}

function Sparkle({ x, y, s = 1, delay = 0, color = '#FCC440' }: { x: number; y: number; s?: number; delay?: number; color?: string }) {
  return (
    <path className="art-twinkle" style={{ animationDelay: `${delay}s`, fill: color }}
      transform={`translate(${x} ${y}) scale(${s})`} d="M0-12 3-3 12 0 3 3 0 12-3 3-12 0-3-3z" />
  );
}

export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 420" className={`hero-art ${className}`} role="img" aria-label="Floating dice, chess, checkers, cards and a snake">
      <defs>
        <radialGradient id="ha-glow" cx=".5" cy=".5" r=".5">
          <stop style={{ stopColor: "rgb(var(--c-primary))" }} offset="0" stopOpacity=".35" />
          <stop style={{ stopColor: "rgb(var(--c-secondary))" }} offset=".6" stopOpacity=".12" />
          <stop style={{ stopColor: "rgb(var(--c-secondary))" }} offset="1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ha-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset=".5" stopColor="#f2b52a" /><stop offset="1" stopColor="#b97a0b" /></linearGradient>
        <linearGradient id="ha-card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3d9bff" /><stop offset="1" stopColor="#0052a3" /></linearGradient>
        <linearGradient id="ha-snake" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0f8a3c" /><stop offset=".5" stopColor="#34d385" /><stop offset="1" stopColor="#1EB53A" /></linearGradient>
        <radialGradient id="ha-red" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#ff7b7b" /><stop offset=".6" stopColor="#d11a1a" /><stop offset="1" stopColor="#7d0909" /></radialGradient>
      </defs>

      <circle cx="240" cy="210" r="200" fill="url(#ha-glow)" />
      <g className="art-spin" style={{ transformOrigin: '240px 210px' }}>
        <circle style={{ stroke: "rgb(var(--c-border))" }} cx="240" cy="210" r="168" fill="none" strokeWidth="2" strokeDasharray="4 12" />
        <circle style={{ fill: "rgb(var(--c-accent))" }} cx="408" cy="210" r="6" />
        <circle style={{ fill: "rgb(var(--c-secondary))" }} cx="72" cy="210" r="4" />
        <circle style={{ fill: "rgb(var(--c-primary))" }} cx="240" cy="42" r="5" />
      </g>

      {/* Playing card */}
      <g className="art-float-b" style={{ animationDelay: '-1.2s' }}>
        <g transform="translate(352 64) rotate(14)">
          <rect width="74" height="104" rx="12" fill="url(#ha-card)" />
          <rect x="6" y="6" width="62" height="92" rx="8" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
          <ellipse cx="37" cy="52" rx="22" ry="34" transform="rotate(28 37 52)" fill="#fff" />
          <path d="m37 36 4.5 10 10.5 1.2-7.8 7 2.2 10.4L37 59.4l-9.4 5.2 2.2-10.4-7.8-7 10.5-1.2z" fill="#0066cc" />
        </g>
      </g>

      {/* Chess knight */}
      <g className="art-float-a" style={{ animationDelay: '-.6s' }}>
        <g transform="translate(56 54)">
          <ellipse cx="38" cy="104" rx="34" ry="7" fill="#000" opacity=".12" />
          <path fill="url(#ha-gold)" stroke="#8a5a00" strokeWidth="2.5" strokeLinejoin="round"
            d="M8 98h60l-4-12H12zM16 86h44c-2-14 2-26 8-38 4-8 2-20-6-28C54 12 44 8 34 9l-4-7-6 10c-8 4-14 10-18 18-3 6-4 12-2 16l6 4c4-3 8-4 13-5-2 5-6 9-11 14-4 4-5 8-4 12 1 5 4 9 8 15z" />
          <circle cx="30" cy="27" r="3" fill="#5a3a00" />
          <path d="M44 20c6 4 10 11 10 19" fill="none" stroke="#fff6cf" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        </g>
      </g>

      {/* Isometric die */}
      <g className="art-float-a">
        <ellipse cx="240" cy="306" rx="70" ry="14" fill="#000" opacity=".14" className="art-shadow" />
        <g className="art-wobble" style={{ transformOrigin: '240px 200px' }}>
          <path d="M240 112 314 154 240 196 166 154z" fill="#ffffff" />
          <path d="M166 154 240 196v86l-74-42z" fill="#dfe9f1" />
          <path d="M240 196 314 154v86l-74 42z" fill="#c4d4e2" />
          <path d="M240 112 314 154 240 196 166 154z M166 154 240 196v86l-74-42z M240 196 314 154v86l-74 42z" fill="none" stroke="#0c1b33" strokeOpacity=".12" strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="240" cy="154" rx="12" ry="7" fill="#d62828" />
          <ellipse cx="187" cy="188" rx="7" ry="8.5" fill="#0c1b33" />
          <ellipse cx="219" cy="248" rx="7" ry="8.5" fill="#0c1b33" />
          <ellipse cx="258" cy="203" rx="7" ry="8.5" fill="#0c1b33" />
          <ellipse cx="277" cy="218" rx="7" ry="8.5" fill="#0c1b33" />
          <ellipse cx="296" cy="233" rx="7" ry="8.5" fill="#0c1b33" />
        </g>
      </g>

      {/* Checkers disc */}
      <g className="art-float-b" style={{ animationDelay: '-2.4s' }}>
        <g transform="translate(96 296)">
          <ellipse cx="0" cy="10" rx="40" ry="15" fill="#5c0606" />
          <ellipse cx="0" cy="0" rx="40" ry="15" fill="url(#ha-red)" />
          <ellipse cx="0" cy="0" rx="28" ry="10" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="2.5" />
          <ellipse cx="0" cy="0" rx="16" ry="5.5" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="2" />
        </g>
      </g>

      {/* Scrabble tile */}
      <g className="art-float-a" style={{ animationDelay: '-3s' }}>
        <g transform="translate(360 262) rotate(-10)">
          <rect y="6" width="60" height="60" rx="10" fill="#b8894b" />
          <rect width="60" height="60" rx="10" fill="#f4dcae" />
          <text x="30" y="42" textAnchor="middle" fontSize="34" fontWeight="800" fill="#3b2a12" fontFamily="var(--font-display), system-ui, sans-serif">S</text>
          <text x="50" y="53" textAnchor="middle" fontSize="11" fontWeight="700" fill="#3b2a12">1</text>
        </g>
      </g>

      {/* Snake */}
      <g transform="translate(0 6)">
        <path d="M150 382c30-28 60 18 96-6s52-36 86-12c22 16 36 8 50-6" fill="none" stroke="url(#ha-snake)" strokeWidth="16" strokeLinecap="round" />
        <path className="art-dash" d="M150 382c30-28 60 18 96-6s52-36 86-12c22 16 36 8 50-6" fill="none" stroke="#c9ffe0" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 16" />
        <g transform="translate(386 356)">
          <path className="art-tongue" d="M10 0h10l4-4M20 0l4 4" stroke="#e11d48" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="0" rx="14" ry="11" fill="#1EB53A" />
          <circle cx="3" cy="-4" r="3" fill="#fff" /><circle cx="4" cy="-4" r="1.5" fill="#0c1b33" />
        </g>
      </g>

      <Sparkle x={330} y={46} s={1.1} />
      <Sparkle x={176} y={78} s={0.7} delay={0.8} color="rgb(var(--c-primary))" />
      <Sparkle x={440} y={232} s={0.8} delay={1.6} />
      <Sparkle x={44} y={210} s={0.6} delay={2.2} color="rgb(var(--c-secondary))" />
      <Sparkle x={300} y={330} s={0.55} delay={1.1} color="rgb(var(--c-primary))" />
    </svg>
  );
}

/** A tumbling die used for loading states. */
export function DiceLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-16">
      <svg aria-hidden="true" width="72" height="88" viewBox="0 0 72 88">
        <ellipse cx="36" cy="82" rx="22" ry="4" fill="currentColor" className="art-loader-shadow text-text/20" />
        <g className="art-loader-die">
          <rect style={{ fill: "rgb(var(--c-surface))", stroke: "rgb(var(--c-primary))" }} x="8" y="8" width="56" height="56" rx="14" strokeWidth="4" />
          <circle style={{ fill: "rgb(var(--c-primary))" }} cx="24" cy="24" r="5" />
          <circle style={{ fill: "rgb(var(--c-accent))" }} cx="36" cy="36" r="5" />
          <circle style={{ fill: "rgb(var(--c-secondary))" }} cx="48" cy="48" r="5" />
        </g>
      </svg>
      <p className="font-display text-lg font-semibold text-muted">{label}<span className="loading-dots" /></p>
    </div>
  );
}

/** A lost, swaying die for the 404 page. */
export function LostArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 180" className="mx-auto w-48">
      <ellipse cx="100" cy="166" rx="54" ry="8" fill="currentColor" className="text-text/10 art-shadow" />
      <g className="art-sway" style={{ transformOrigin: '100px 150px' }}>
        <rect style={{ fill: "rgb(var(--c-surface))", stroke: "rgb(var(--c-primary))" }} x="46" y="40" width="108" height="108" rx="26" strokeWidth="6" />
        <circle style={{ fill: "rgb(var(--c-text))" }} cx="78" cy="82" r="8" className="art-blink" />
        <circle style={{ fill: "rgb(var(--c-text))" }} cx="122" cy="82" r="8" className="art-blink" />
        <path style={{ stroke: "rgb(var(--c-text))" }} d="M80 122c12-8 28-8 40 0" fill="none" strokeWidth="6" strokeLinecap="round" />
      </g>
      <text style={{ fill: "rgb(var(--c-accent))" }} x="164" y="40" fontSize="34" fontWeight="800" className="art-float-b font-display">?</text>
    </svg>
  );
}
