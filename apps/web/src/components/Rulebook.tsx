import type { ReactNode } from 'react';
import type { RuleSection } from '@slgh/shared';
import { gameIcon } from '@/lib/games';
import { Icon, type IconName } from './Icon';

// Collapsible rulebook used on every game's detail and play screens: a header with the game's icon and
// reading time, "jump to" chips, then numbered sections. The objective and "Playing on Dodo" sections
// are drawn as highlighted callouts. Works without JavaScript (<details> and in-page links).

const GAMES = ['snake-and-ladder', 'salone-poly', 'word-search', 'checkers', 'scrabble', 'chess', 'snake', 'dice', 'uno'];
/** "Checkers Rulebook" -> "checkers" (the longest game name that appears in the title) */
const gameOf = (title: string) => {
  const t = title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '-');
  return GAMES.find((g) => t.includes(g)) ?? null;
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const words = (s: RuleSection) =>
  [s.intro, s.note, ...(s.rules ?? []), ...(s.steps ?? []), ...(s.tables ?? []).flatMap((t) => t.rows.flat())].join(' ').split(/\s+/).length;

/** Callout style for special sections */
function kindOf(title: string): { tone: string; icon: IconName; label: string } | null {
  if (/^(objective|goal)/i.test(title)) return { tone: 'rb-callout-goal', icon: 'trophy', label: 'How to win' };
  if (/^playing on|^ways to play|^on dodo/i.test(title)) return { tone: 'rb-callout-here', icon: 'gamepad', label: 'On Dodo' };
  return null;
}

export default function Rulebook({ title, sections, open = false, children }: {
  title: string; sections: RuleSection[]; open?: boolean;
  /** Extra blocks after the sections (e.g. Snake & Ladder's board map) */
  children?: ReactNode;
}) {
  const game = gameOf(title);
  const icon = game && gameIcon(game);
  const id = `rb-${slugify(title)}`;
  const minutes = Math.max(1, Math.round(sections.reduce((n, s) => n + words(s), 0) / 200));

  return (
    <details open={open} className="rulebook card">
      <summary className="rb-head">
        <span className="rb-badge" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {icon ? <img src={icon} alt="" width={44} height={44} /> : <Icon name="book" size={22} />}
          <span className="rb-badge-book"><Icon name="book" size={12} strokeWidth={2.5} /></span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-heading sm:text-lg">{title}</span>
          <span className="block text-xs text-muted">{sections.length} sections · about {minutes} min read</span>
        </span>
        <span className="rb-chevron" aria-hidden="true"><Icon name="chevronDown" size={18} /></span>
      </summary>

      <div className="rb-body">
        {sections.length > 3 && (
          <nav aria-label={`${title}: jump to a section`} className="rb-toc">
            {sections.map((s, i) => (
              <a key={s.title} href={`#${id}-${i + 1}`} className="rb-toc-chip"><span className="rb-toc-n">{i + 1}</span>{s.title}</a>
            ))}
          </nav>
        )}

        <ol className="space-y-3">
          {sections.map((s, i) => {
            const kind = kindOf(s.title);
            return (
              <li key={s.title} id={`${id}-${i + 1}`} className={`rb-section ${kind ? `rb-callout ${kind.tone}` : ''}`}>
                <h3 className="rb-title">
                  <span className="rb-num" aria-hidden="true">{kind ? <Icon name={kind.icon} size={15} strokeWidth={2.5} /> : i + 1}</span>
                  <span className="sr-only">{i + 1}. </span>{s.title}
                  {kind && <span className="chip ml-auto">{kind.label}</span>}
                </h3>
                <div className="rb-content">
                  {s.intro && <p>{s.intro}</p>}
                  {s.steps && (
                    <ol className="rb-steps">
                      {s.steps.map((r, si) => <li key={r}><span className="rb-step-n" aria-hidden="true">{si + 1}</span><span>{r}</span></li>)}
                    </ol>
                  )}
                  {s.rules && (
                    <ul className="rb-rules">
                      {s.rules.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                  {s.tables?.map((t, ti) => (
                    <div key={ti} className="rb-table-wrap">
                      <table className="rb-table">
                        {t.caption && <caption>{t.caption}</caption>}
                        <thead><tr>{t.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                        <tbody>
                          {t.rows.map((row, ri) => (
                            <tr key={ri}>{row.map((c, ci) => (ci === 0 ? <th key={ci} scope="row">{c}</th> : <td key={ci}>{c}</td>))}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {s.note && <p className="rb-note"><Icon name="info" size={16} className="mt-0.5 shrink-0" />{s.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        {children}
      </div>
    </details>
  );
}
