import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UnoEngine, UNO_MANIFEST, createUnoDeck, unoViewFor, cardPoints, type UnoState, type Card } from './uno';
import { createPlayer } from '../games';

const engine = new UnoEngine();
const players = (n: number) => Array.from({ length: n }, (_, i) => createPlayer(`p${i}`, `P${i + 1}`, false));

/** A game with hands and the top card set by hand, so each rule can be tested exactly. */
function rig(hands: Card[][], top: Card, deck: Card[] = createUnoDeck().filter((c) => c.type === 'number').slice(0, 30)): UnoState {
  const s = engine.initialize(players(hands.length));
  return {
    ...s, playersHands: hands, discardPile: [top], deck, currentColor: top.color as UnoState['currentColor'],
    currentPlayerIndex: 0, direction: 1, drawnCardId: null, saidUno: hands.map(() => false),
  };
}
let id = 1000;
const c = (color: Card['color'], type: Card['type'], value?: number): Card => ({ id: `t${id++}`, color, type, ...(value === undefined ? {} : { value }) });

describe('UnoEngine', () => {
  it('builds the 108-card deck', () => {
    const deck = createUnoDeck();
    assert.strictEqual(deck.length, 108);
    assert.strictEqual(deck.filter((x) => x.color === 'wild').length, 8);
    assert.strictEqual(deck.filter((x) => x.type === 'number' && x.value === 0).length, 4);
    assert.strictEqual(new Set(deck.map((x) => x.id)).size, 108);
  });

  it('deals 7 cards each and never starts on a wild', () => {
    for (let i = 0; i < 30; i++) {
      const s = engine.initialize(players(3));
      assert.strictEqual(s.gameId, UNO_MANIFEST.id);
      assert.ok(s.playersHands.every((h) => h.length >= 7));
      assert.notStrictEqual(s.discardPile[0].color, 'wild');
      assert.strictEqual(s.deck.length + s.discardPile.length + s.playersHands.flat().length, 108);
    }
  });

  it('matches by colour, number or symbol', () => {
    const red5 = c('red', 'number', 5), blue5 = c('blue', 'number', 5), green7 = c('green', 'number', 7), redSkip = c('red', 'skip');
    const s = rig([[blue5, green7, redSkip], [c('red', 'number', 1)]], red5);
    assert.ok(engine.isValidMove(s, { type: 'play', cardId: blue5.id }, 0));
    assert.ok(engine.isValidMove(s, { type: 'play', cardId: redSkip.id }, 0));
    assert.ok(!engine.isValidMove(s, { type: 'play', cardId: green7.id }, 0));
    assert.ok(!engine.isValidMove(s, { type: 'play', cardId: blue5.id }, 1), 'not your turn');
  });

  it('wild cards need a colour; Wild Draw Four only without the current colour', () => {
    const wd4 = c('wild', 'wild_draw_four'), wild = c('wild', 'wild'), red2 = c('red', 'number', 2);
    const s = rig([[wd4, wild, red2], [c('blue', 'number', 1)]], c('red', 'number', 9));
    assert.ok(!engine.isValidMove(s, { type: 'play', cardId: wild.id }, 0), 'colour required');
    assert.ok(engine.isValidMove(s, { type: 'play', cardId: wild.id, color: 'blue' }, 0));
    assert.ok(!engine.isValidMove(s, { type: 'play', cardId: wd4.id, color: 'blue' }, 0), 'holds a red card');
    const t = rig([[wd4, c('green', 'number', 2), c('blue', 'number', 3)], [c('blue', 'number', 1)]], c('red', 'number', 9));
    assert.ok(engine.isValidMove(t, { type: 'play', cardId: wd4.id, color: 'green' }, 0));
  });

  it('Draw Two makes the next player draw 2 and lose their turn', () => {
    const d2 = c('red', 'draw_two');
    const s = rig([[d2, c('red', 'number', 1)], [c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5));
    const n = engine.applyMove(s, { type: 'play', cardId: d2.id });
    assert.strictEqual(n.playersHands[1].length, 3);
    assert.strictEqual(n.currentPlayerIndex, 2);
  });

  it('Wild Draw Four: next player draws 4 and is skipped, colour changes', () => {
    const wd4 = c('wild', 'wild_draw_four');
    const s = rig([[wd4, c('blue', 'number', 1)], [c('blue', 'number', 2)], [c('green', 'number', 1)]], c('red', 'number', 5));
    const n = engine.applyMove(s, { type: 'play', cardId: wd4.id, color: 'blue' });
    assert.strictEqual(n.playersHands[1].length, 5);
    assert.strictEqual(n.currentPlayerIndex, 2);
    assert.strictEqual(n.currentColor, 'blue');
  });

  it('Skip skips; Reverse reverses (and acts as Skip with two players)', () => {
    const skip = c('red', 'skip');
    const s = rig([[skip, c('red', 'number', 1)], [c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5));
    assert.strictEqual(engine.applyMove(s, { type: 'play', cardId: skip.id }).currentPlayerIndex, 2);

    const rev = c('red', 'reverse');
    const three = rig([[rev, c('red', 'number', 1)], [c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5));
    const r = engine.applyMove(three, { type: 'play', cardId: rev.id });
    assert.strictEqual(r.direction, -1);
    assert.strictEqual(r.currentPlayerIndex, 2);

    const rev2 = c('red', 'reverse');
    const two = rig([[rev2, c('red', 'number', 1)], [c('blue', 'number', 1)]], c('red', 'number', 5));
    assert.strictEqual(engine.applyMove(two, { type: 'play', cardId: rev2.id }).currentPlayerIndex, 0);
  });

  it('a drawn card that fits can be played at once, or kept with pass', () => {
    const fits = c('red', 'number', 8);
    const s = rig([[c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5), [fits]);
    const drawn = engine.applyMove(s, { type: 'draw' });
    assert.strictEqual(drawn.currentPlayerIndex, 0, 'still my turn');
    assert.strictEqual(drawn.drawnCardId, fits.id);
    assert.ok(!engine.isValidMove(drawn, { type: 'draw' }, 0), 'only one draw');
    assert.strictEqual(engine.applyMove(drawn, { type: 'play', cardId: fits.id }).currentPlayerIndex, 1);
    assert.strictEqual(engine.applyMove(drawn, { type: 'pass' }).currentPlayerIndex, 1);
  });

  it('a drawn card that does not fit ends the turn', () => {
    const s = rig([[c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5), [c('green', 'number', 3)]);
    const n = engine.applyMove(s, { type: 'draw' });
    assert.strictEqual(n.currentPlayerIndex, 1);
    assert.strictEqual(n.playersHands[0].length, 2);
  });

  it('reshuffles the discard pile when the deck runs out', () => {
    const s = rig([[c('blue', 'number', 1)], [c('green', 'number', 1)]], c('red', 'number', 5), []);
    s.discardPile = [c('yellow', 'number', 1), c('yellow', 'number', 2), c('red', 'number', 5)];
    const n = engine.applyMove(s, { type: 'draw' });
    assert.strictEqual(n.playersHands[0].length, 2);
    assert.strictEqual(n.discardPile.length, 1);
    assert.strictEqual(n.discardPile[0].value, 5, 'top card stays');
  });

  it('forgetting to call UNO costs 2 cards', () => {
    const a = c('red', 'number', 1), b = c('blue', 'number', 9);
    const s = rig([[a, b], [c('green', 'number', 1)]], c('red', 'number', 5));
    assert.strictEqual(engine.applyMove(s, { type: 'play', cardId: a.id, uno: true }).playersHands[0].length, 1);
    const forgot = engine.applyMove(s, { type: 'play', cardId: a.id });
    assert.strictEqual(forgot.playersHands[0].length, 3);
    assert.strictEqual(forgot.lastEvent?.kind, 'penalty');
  });

  it('playing the last card wins and scores everyone else\'s cards', () => {
    const last = c('red', 'number', 3);
    const left = [c('blue', 'number', 7), c('green', 'skip'), c('wild', 'wild')];
    const s = rig([[last], left], c('red', 'number', 5));
    const n = engine.applyMove(s, { type: 'play', cardId: last.id });
    assert.strictEqual(n.status, 'finished');
    assert.strictEqual(n.winner, 0);
    assert.strictEqual(n.scores![0], 7 + 20 + 50);
    assert.deepStrictEqual(left.map(cardPoints), [7, 20, 50]);
  });

  it('a player view hides other hands and the deck', () => {
    const s = engine.initialize(players(3));
    const v = unoViewFor(s, 1);
    assert.deepStrictEqual(v.hand, s.playersHands[1]);
    assert.deepStrictEqual(v.handCounts, s.playersHands.map((h) => h.length));
    const json = JSON.stringify(v);
    for (const card of [...s.playersHands[0], ...s.playersHands[2], ...s.deck]) assert.ok(!json.includes(`"${card.id}"`), `leaked ${card.id}`);
    assert.strictEqual(v.revealed, null);
  });

  it('bots play whole games at every level without getting stuck', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let g = 0; g < 15; g++) {
        let s = engine.initialize(players(4));
        let guard = 0;
        while (s.status === 'playing' && guard++ < 3000) {
          const m = engine.getAIMove(s, level);
          assert.ok(engine.isValidMove(s, m, s.currentPlayerIndex), `illegal bot move ${JSON.stringify(m)}`);
          s = engine.applyMove(s, m);
          assert.strictEqual(s.deck.length + s.discardPile.length + s.playersHands.flat().length, 108, 'cards conserved');
        }
        assert.strictEqual(s.status, 'finished', `${level} game ${g} did not finish`);
      }
    }
  });

  it('serializes and deserializes', () => {
    const s = engine.initialize(players(2));
    assert.deepStrictEqual(engine.deserialize(engine.serialize(s)), JSON.parse(JSON.stringify(s)));
  });
});
