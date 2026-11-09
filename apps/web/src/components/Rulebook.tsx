import type { RuleSection } from '@slgh/shared';

/** Collapsible rulebook used on every game's detail and play screens */
export default function Rulebook({ title, sections, open = false }: { title: string; sections: RuleSection[]; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border-2 border-border p-4">
      <summary className="cursor-pointer text-lg font-bold">📖 {title}</summary>
      <div className="mt-3 space-y-4">
        {sections.map((s, i) => (
          <section key={s.title} className="space-y-2">
            <h3 className="font-bold">{i + 1}. {s.title}</h3>
            {s.intro && <p className="text-sm">{s.intro}</p>}
            {s.steps && (
              <ol className="ml-5 list-decimal space-y-1 text-sm">
                {s.steps.map((r) => <li key={r}>{r}</li>)}
              </ol>
            )}
            {s.rules && (
              <ul className="ml-5 list-disc space-y-1 text-sm">
                {s.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            {s.tables?.map((t, ti) => (
              <div key={ti} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  {t.caption && <caption className="mb-1 text-left font-semibold">{t.caption}</caption>}
                  <thead>
                    <tr>{t.head.map((h) => <th key={h} className="border-2 border-border px-2 py-1">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, ri) => (
                      <tr key={ri}>{row.map((c, ci) => <td key={ci} className="border border-border px-2 py-1">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {s.note && <p className="text-sm italic text-muted">{s.note}</p>}
          </section>
        ))}
      </div>
    </details>
  );
}
