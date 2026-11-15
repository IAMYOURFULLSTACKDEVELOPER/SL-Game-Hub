import { SNAKE_AND_LADDER_LADDERS, SNAKE_AND_LADDER_RULES, SNAKE_AND_LADDER_SNAKES } from '@slgh/shared';
import { Icon } from './Icon';

const pairs = (m: Record<number, number>) => Object.entries(m).map(([a, b]) => [Number(a), b] as const).sort((x, y) => x[0] - y[0]);

export default function SnakeAndLadderRulebook({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border-2 border-border p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-lg font-bold"><Icon name="book" size={20} className="text-muted" />Snake &amp; Ladder Rulebook</summary>
      <div className="mt-3 space-y-4">
        {SNAKE_AND_LADDER_RULES.map((section, i) => (
          <section key={section.title}>
            <h3 className="font-bold">{i + 1}. {section.title}</h3>
            <ul className="ml-5 list-disc space-y-1 text-sm">
              {section.rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>
        ))}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <section>
            <h3 className="flex items-center gap-1.5 font-bold"><Icon name="ladder" size={18} className="text-primary" />Ladders (climb up)</h3>
            <ul className="mt-1 flex flex-wrap gap-1">
              {pairs(SNAKE_AND_LADDER_LADDERS).map(([a, b]) => (
                <li key={a} className="rounded border-2 border-blue-500 px-2 py-0.5 font-semibold">{a} → {b}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="flex items-center gap-1.5 font-bold"><Icon name="snake" size={18} className="text-success" />Snakes (slide down)</h3>
            <ul className="mt-1 flex flex-wrap gap-1">
              {pairs(SNAKE_AND_LADDER_SNAKES).map(([a, b]) => (
                <li key={a} className="rounded border-2 border-green-600 px-2 py-0.5 font-semibold">{a} → {b}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </details>
  );
}
