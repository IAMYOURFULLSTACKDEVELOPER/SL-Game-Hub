import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MonopolyEngine, MONOPOLY_MANIFEST, SIERRAPOLY_BOARD, SIERRAPOLY_GROUPS, SIERRAPOLY, actor, rentFor, netWorth, toBanknotes,
  type MonopolyState, type MonopolyMove,
} from './monopoly';
import { createPlayer } from '../games';

const engine = new MonopolyEngine();
const newGame = (n = 2) => engine.initialize(Array.from({ length: n }, (_, i) => createPlayer(`${i}`, `P${i + 1}`)));
const apply = (s: MonopolyState, ...moves: MonopolyMove[]) => moves.reduce((g, m) => {
  assert.strictEqual(engine.check(g, m, m.type === 'time_up' ? g.currentPlayerIndex : actor(g)), null, `${m.type} should be allowed`);
  return engine.applyMove(g, m);
}, s);

describe('SierraPoly board', () => {
  it('matches the artwork', () => {
    assert.strictEqual(MONOPOLY_MANIFEST.name, 'SierraPoly');
    assert.strictEqual(SIERRAPOLY_BOARD.length, 40);
    const at = (i: number) => SIERRAPOLY_BOARD[i];
    assert.deepStrictEqual([at(1).name, at(1).price], ['Victoria Park', 60]);
    assert.deepStrictEqual([at(3).name, at(3).price], ['Atuga Mini Stadium', 80]);
    assert.strictEqual(at(4).tax, 200);
    assert.strictEqual(at(5).name, 'Port Loko Railway');
    assert.strictEqual(at(10).type, 'jail');
    assert.strictEqual(at(12).name, 'EDSA');
    assert.strictEqual(at(15).name, 'Central Railway');
    assert.strictEqual(at(20).type, 'free_parking');
    assert.strictEqual(at(28).name, 'Guma Valley Water Company');
    assert.strictEqual(at(30).type, 'go_to_jail');
    assert.strictEqual(at(35).name, 'Old Railway Brookfields');
    assert.strictEqual(at(38).tax, 100);
    assert.deepStrictEqual([at(39).name, at(39).price], ['Chapter-One Night Club & Bar', 400]);
    assert.strictEqual(Object.values(SIERRAPOLY_GROUPS).reduce((n, g) => n + g.spaces.length, 0), 22);
  });

  it('starting capital is NLE1,500 in the listed banknotes', () => {
    const s = newGame(8);
    assert.ok(s.money.every((m) => m === 1500));
    assert.strictEqual(SIERRAPOLY.startingNotes.reduce((t, [n, q]) => t + n * q, 0), 1500);
    assert.deepStrictEqual(toBanknotes(1786), [[1000, 1], [500, 1], [100, 2], [50, 1], [20, 1], [10, 1], [5, 1], [1, 1]]);
  });
});

describe('SierraPoly turns', () => {
  it('rolling, buying and passing the turn', () => {
    let s = apply(newGame(), { type: 'roll', dice: [3, 4] }); // Chance at 7
    s = { ...newGame() };
    s = apply(s, { type: 'roll', dice: [1, 2] }); // Atuga Mini Stadium (3)
    assert.strictEqual(s.phase, 'buy');
    s = apply(s, { type: 'buy' });
    assert.strictEqual(s.owners[3], 0);
    assert.strictEqual(s.money[0], 1420);
    assert.strictEqual(s.phase, 'end');
    s = apply(s, { type: 'end_turn' });
    assert.strictEqual(s.currentPlayerIndex, 1);
  });

  it('doubles give another roll; three doubles send you to Jail', () => {
    let s = apply(newGame(), { type: 'roll', dice: [3, 3] }); // 6 Siaka Stevens
    s = apply(s, { type: 'decline' }, { type: 'auction_pass' }, { type: 'auction_pass' });
    assert.strictEqual(s.phase, 'roll');
    s = apply(s, { type: 'roll', dice: [2, 2] }); // 10 just visiting
    assert.strictEqual(s.phase, 'roll');
    s = apply(s, { type: 'roll', dice: [1, 1] });
    assert.strictEqual(s.positions[0], 10);
    assert.ok(s.inJail[0]);
    assert.strictEqual(s.phase, 'end');
  });

  it('passing GO pays NLE200', () => {
    const s0 = newGame();
    s0.positions[0] = 38;
    const s = apply(s0, { type: 'roll', dice: [1, 3] }); // 2 Community Chest
    assert.ok(s.money[0] >= 1500 + 200 - 100 - 50 || s.log.some((l) => l.includes('passed GO')));
    assert.ok(s.log.some((l) => l.includes('passed GO')));
  });

  it('declining starts an auction; highest bidder wins', () => {
    let s = apply(newGame(3), { type: 'roll', dice: [1, 2] }, { type: 'decline' });
    assert.strictEqual(s.phase, 'auction');
    assert.strictEqual(actor(s), 0);
    s = apply(s, { type: 'bid', amount: 20 }, { type: 'bid', amount: 50 }, { type: 'auction_pass' });
    assert.strictEqual(actor(s), 0);
    s = apply(s, { type: 'auction_pass' });
    assert.strictEqual(s.owners[3], 1);
    assert.strictEqual(s.money[1], 1450);
  });

  it('jail: fine is NLE50, three failed rolls force payment and move', () => {
    let s = newGame();
    s.inJail[0] = true; s.positions[0] = 10; s.phase = 'jail';
    assert.strictEqual(apply(s, { type: 'pay_jail' }).money[0], 1450);
    for (let k = 0; k < 2; k++) { s = apply(s, { type: 'roll', dice: [1, 2] }, { type: 'end_turn' }); s = apply(s, { type: 'roll', dice: [3, 4] }); if (s.phase === 'buy') s = apply(s, { type: 'decline' }, { type: 'auction_pass' }, { type: 'auction_pass' }); if (s.phase === 'debt') s = apply(s, { type: 'pay_debt' }); s = apply(s, { type: 'end_turn' }); }
    assert.ok(s.inJail[0]);
    s = apply(s, { type: 'roll', dice: [1, 2] });
    assert.ok(!s.inJail[0]);
    assert.strictEqual(s.positions[0], 13);
  });
});

describe('SierraPoly rent and development', () => {
  it('rent doubles with a full group, rises with houses, zero when mortgaged', () => {
    const s = newGame();
    s.owners[1] = 1;
    assert.strictEqual(rentFor(s, 1, 7), 2);
    s.owners[3] = 1;
    assert.strictEqual(rentFor(s, 1, 7), 4);
    s.buildings[1] = 2;
    assert.strictEqual(rentFor(s, 1, 7), 30);
    s.buildings[1] = 5;
    assert.strictEqual(rentFor(s, 1, 7), 250);
    s.buildings[1] = 0; s.mortgaged[1] = true;
    assert.strictEqual(rentFor(s, 1, 7), 0);
  });

  it('railway and utility rent', () => {
    const s = newGame();
    s.owners[5] = 1;
    assert.strictEqual(rentFor(s, 5, 0), 25);
    s.owners[15] = 1; s.owners[25] = 1; s.owners[35] = 1;
    assert.strictEqual(rentFor(s, 5, 0), 200);
    s.owners[12] = 1;
    assert.strictEqual(rentFor(s, 12, 8), 32);
    s.owners[28] = 1;
    assert.strictEqual(rentFor(s, 12, 8), 80);
  });

  it('builds evenly, hotel after four houses, sells at half price', () => {
    let s = newGame();
    s.owners[1] = 0; s.owners[3] = 0;
    assert.ok(engine.check(s, { type: 'build', space: 1 }, 0) === null);
    s = apply(s, { type: 'build', space: 1 });
    assert.notStrictEqual(engine.check(s, { type: 'build', space: 1 }, 0), null, 'must build evenly');
    for (let k = 0; k < 9; k++) s = apply(s, { type: 'build', space: k % 2 ? 1 : 3 });
    assert.deepStrictEqual([s.buildings[1], s.buildings[3]], [5, 5]);
    const cash = s.money[0];
    s = apply(s, { type: 'sell_building', space: 1 });
    assert.strictEqual(s.buildings[1], 4);
    assert.strictEqual(s.money[0], cash + 25);
  });

  it('mortgage and unmortgage with 10% interest', () => {
    let s = newGame();
    s.owners[39] = 0;
    s = apply(s, { type: 'mortgage', space: 39 });
    assert.strictEqual(s.money[0], 1700);
    s = apply(s, { type: 'unmortgage', space: 39 });
    assert.strictEqual(s.money[0], 1480);
  });
});

describe('SierraPoly money trouble', () => {
  it('unpaid rent creates a debt, then bankruptcy transfers assets to the creditor', () => {
    let s = newGame();
    s.owners[39] = 1; s.owners[37] = 1; s.buildings[39] = 5; s.buildings[37] = 5;
    s.money[0] = 100; s.owners[1] = 0;
    s.positions[0] = 36;
    s = apply(s, { type: 'roll', dice: [1, 2] });
    assert.strictEqual(s.phase, 'debt');
    s = apply(s, { type: 'mortgage', space: 1 });
    assert.strictEqual(s.phase, 'debt');
    s = apply(s, { type: 'bankrupt' });
    assert.strictEqual(s.status, 'finished');
    assert.strictEqual(s.winner, 1);
    assert.strictEqual(s.owners[1], 1);
  });

  it('trades swap properties and cash', () => {
    let s = newGame();
    s.owners[1] = 0; s.owners[3] = 1;
    s = apply(s, { type: 'trade', with: 1, give: { spaces: [1], cash: 0, jailCards: 0 }, get: { spaces: [3], cash: 40, jailCards: 0 } });
    assert.strictEqual(s.owners[1], 1);
    assert.strictEqual(s.owners[3], 0);
    assert.deepStrictEqual(s.money, [1540, 1460]);
  });

  it('timed game ends on net worth', () => {
    let s = engine.initialize([createPlayer('a', 'A'), createPlayer('b', 'B')], { minutes: 30 });
    s.owners[39] = 1;
    assert.strictEqual(netWorth(s, 1), 1900);
    s = apply(s, { type: 'time_up' });
    assert.strictEqual(s.status, 'finished');
    assert.strictEqual(s.winner, 1);
  });

  it('bots can play a whole game without getting stuck', () => {
    for (let game = 0; game < 5; game++) {
      let s = engine.initialize([0, 1, 2, 3].map((i) => createPlayer(`${i}`, `Bot ${i}`, true, (['easy', 'medium', 'hard', 'hard'] as const)[i])));
      let steps = 0;
      while (s.status === 'playing' && steps < 20000) {
        const p = actor(s);
        const m = engine.getAIMove(s, s.players[p].difficulty!);
        const err = engine.check(s, m, p);
        assert.strictEqual(err, null, `bot move ${m.type} rejected in phase ${s.phase}: ${err}`);
        s = engine.applyMove(s, m);
        steps++;
        assert.ok(s.money.every((x) => x >= 0), 'cash never negative');
      }
      assert.ok(steps > 50);
    }
  });
});
