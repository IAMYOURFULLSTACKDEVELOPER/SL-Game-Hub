import { SNAKE_AND_LADDER_LADDERS, SNAKE_AND_LADDER_RULES, SNAKE_AND_LADDER_SNAKES } from '@slgh/shared';
import Rulebook from './Rulebook';
import { Icon } from './Icon';

const pairs = (m: Record<number, number>) => Object.entries(m).map(([a, b]) => [Number(a), b] as const).sort((x, y) => x[0] - y[0]);

/** The shared rulebook plus a map of every ladder and snake on the board */
export default function SnakeAndLadderRulebook({ open = false }: { open?: boolean }) {
  return (
    <Rulebook title="Snake & Ladder Rulebook" sections={SNAKE_AND_LADDER_RULES} open={open}>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rb-section">
          <h3 className="rb-title"><span className="rb-num rb-num-blue" aria-hidden="true"><Icon name="ladder" size={15} strokeWidth={2.5} /></span>Ladders: climb up</h3>
          <ul className="rb-pairs">
            {pairs(SNAKE_AND_LADDER_LADDERS).map(([a, b]) => (
              <li key={a} className="rb-pair rb-pair-up"><b>{a}</b><Icon name="arrowRight" size={12} strokeWidth={2.5} /><b>{b}</b></li>
            ))}
          </ul>
        </section>
        <section className="rb-section">
          <h3 className="rb-title"><span className="rb-num rb-num-green" aria-hidden="true"><Icon name="snake" size={15} strokeWidth={2.5} /></span>Snakes: slide down</h3>
          <ul className="rb-pairs">
            {pairs(SNAKE_AND_LADDER_SNAKES).map(([a, b]) => (
              <li key={a} className="rb-pair rb-pair-down"><b>{a}</b><Icon name="arrowRight" size={12} strokeWidth={2.5} /><b>{b}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </Rulebook>
  );
}
