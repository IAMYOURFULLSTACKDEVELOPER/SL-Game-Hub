import type { GameState, GameEngine, Player, Difficulty, GameManifest } from '../types';
import { shuffle, youGrammar } from '../games';

/** UNO card colours ('wild' only for the two wild cards) */
export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type PlayColor = Exclude<CardColor, 'wild'>;
export const UNO_COLORS: PlayColor[] = ['red', 'yellow', 'green', 'blue'];

export type CardType = 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four';

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for number cards
}

/**
 * play: a card from your hand (wilds need a colour). Set `uno` when this play leaves you with one card,
 *       or you draw 2 as a penalty.
 * draw: take one card. If it can be played you may play it straight away, otherwise your turn ends.
 * pass: keep the card you just drew and end your turn.
 */
export type UnoMove =
  | { type: 'play'; cardId: string; color?: PlayColor; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' };

export interface UnoEvent {
  kind: 'start' | 'play' | 'draw' | 'pass' | 'penalty' | 'win';
  player: number;
  cardId?: string;
  count?: number;
}

export interface UnoState extends GameState {
  deck: Card[];
  discardPile: Card[];
  playersHands: Card[][];
  currentColor: PlayColor;
  direction: 1 | -1;
  /** The card just drawn by the current player, when it can be played (play it or pass) */
  drawnCardId: string | null;
  /** Called UNO for their current one-card hand */
  saidUno: boolean[];
  /** Counts every action, so screens can animate each one */
  turn: number;
  lastEvent: UnoEvent | null;
  log: string[];
  /** Points scored by each player when the game ends (winner gets everyone else's card values) */
  scores: number[] | null;
}

export const UNO_MANIFEST: GameManifest = {
  id: 'uno',
  name: 'UNO',
  description: 'Match colours and numbers, use action cards to outsmart your opponents.',
  thumbnail: '🃏',
  minPlayers: 2,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '2.0.0',
};

export const HAND_SIZE = 7;

/** The 108-card deck: per colour one 0, two each of 1-9, Skip, Reverse and Draw Two; 4 Wild and 4 Wild Draw Four. */
export function createUnoDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const add = (color: CardColor, type: CardType, value?: number) =>
    deck.push(value === undefined ? { id: `c${n++}`, color, type } : { id: `c${n++}`, color, type, value });
  for (const color of UNO_COLORS) {
    add(color, 'number', 0);
    for (let v = 1; v <= 9; v++) { add(color, 'number', v); add(color, 'number', v); }
    for (let i = 0; i < 2; i++) { add(color, 'skip'); add(color, 'reverse'); add(color, 'draw_two'); }
  }
  for (let i = 0; i < 4; i++) { add('wild', 'wild'); add('wild', 'wild_draw_four'); }
  return deck;
}

/** Points a card is worth at the end of a game */
export const cardPoints = (c: Card) => (c.type === 'number' ? c.value! : c.color === 'wild' ? 50 : 20);

export function cardLabel(c: Card): string {
  const color = c.color === 'wild' ? '' : `${c.color[0].toUpperCase()}${c.color.slice(1)} `;
  switch (c.type) {
    case 'number': return `${color}${c.value}`;
    case 'skip': return `${color}Skip`;
    case 'reverse': return `${color}Reverse`;
    case 'draw_two': return `${color}Draw Two`;
    case 'wild': return 'Wild';
    case 'wild_draw_four': return 'Wild Draw Four';
  }
}

const top = (s: UnoState) => s.discardPile[s.discardPile.length - 1];

/** Colour/number/symbol match, ignoring the Wild Draw Four restriction */
function matches(card: Card, onTop: Card, color: PlayColor): boolean {
  if (card.color === 'wild') return true;
  if (card.color === color) return true;
  if (card.type === 'number') return onTop.type === 'number' && card.value === onTop.value;
  return card.type === onTop.type;
}

/** Can `card` be played from `hand` right now? Wild Draw Four only when you hold no card of the current colour. */
export function canPlay(card: Card, hand: Card[], onTop: Card, color: PlayColor): boolean {
  if (!matches(card, onTop, color)) return false;
  if (card.type === 'wild_draw_four') return !hand.some((c) => c.id !== card.id && c.color === color);
  return true;
}

export class UnoEngine implements GameEngine<UnoState, UnoMove> {
  initialize(players: Player[]): UnoState {
    const deck = shuffle(createUnoDeck());
    const playersHands = players.map(() => deck.splice(deck.length - HAND_SIZE, HAND_SIZE));
    // Turn over a starting card; wild cards go back into the deck.
    let first = deck.pop()!;
    while (first.color === 'wild') { deck.unshift(first); first = deck.pop()!; }

    const now = Date.now();
    const s: UnoState = {
      gameId: UNO_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      deck,
      discardPile: [first],
      playersHands,
      currentColor: first.color as PlayColor,
      direction: 1,
      drawnCardId: null,
      saidUno: players.map(() => false),
      turn: 0,
      lastEvent: { kind: 'start', player: 0, cardId: first.id },
      log: [`Starting card: ${cardLabel(first)}.`],
      scores: null,
      createdAt: now,
      updatedAt: now,
    };
    // The starting card acts on the first player like any other card.
    if (first.type === 'skip') { this.say(s, `${players[0].name} is skipped.`); s.currentPlayerIndex = this.next(s); }
    if (first.type === 'reverse') {
      s.direction = -1;
      if (players.length === 2) s.currentPlayerIndex = this.next(s);
    }
    if (first.type === 'draw_two') {
      this.give(s, 0, 2);
      this.say(s, `${players[0].name} draws 2 and is skipped.`);
      s.currentPlayerIndex = this.next(s);
    }
    return s;
  }

  /** Why a move is not allowed, or null when it is */
  check(state: UnoState, move: UnoMove, playerIndex: number): string | null {
    if (state.status !== 'playing') return 'The game is over.';
    if (playerIndex !== state.currentPlayerIndex) return 'It is not your turn.';
    const hand = state.playersHands[playerIndex];
    switch (move.type) {
      case 'draw': return state.drawnCardId ? 'You already drew. Play that card or pass.' : null;
      case 'pass': return state.drawnCardId ? null : 'Draw a card first.';
      case 'play': {
        const card = hand.find((c) => c.id === move.cardId);
        if (!card) return 'That card is not in your hand.';
        if (state.drawnCardId && card.id !== state.drawnCardId) return 'After drawing you may only play the card you drew.';
        if (!matches(card, top(state), state.currentColor)) return 'That card does not match the colour, number or symbol.';
        if (!canPlay(card, hand, top(state), state.currentColor)) return `Wild Draw Four can only be played when you have no ${state.currentColor} card.`;
        if (card.color === 'wild' && !UNO_COLORS.includes(move.color as PlayColor)) return 'Choose a colour for your wild card.';
        return null;
      }
      default: return 'Unknown move.';
    }
  }

  isValidMove(state: UnoState, move: UnoMove, playerIndex: number): boolean {
    return this.check(state, move, playerIndex) === null;
  }

  applyMove(state: UnoState, move: UnoMove): UnoState {
    const p = state.currentPlayerIndex;
    if (this.check(state, move, p)) return state;
    const s: UnoState = JSON.parse(JSON.stringify(state));
    s.turn++;
    s.updatedAt = Date.now();
    const name = s.players[p].name;

    if (move.type === 'draw') {
      const [card] = this.give(s, p, 1);
      s.lastEvent = { kind: 'draw', player: p, count: card ? 1 : 0 };
      if (card && canPlay(card, s.playersHands[p], top(s), s.currentColor)) {
        s.drawnCardId = card.id; // they may play it or keep it
        this.say(s, `${name} draws a card.`);
      } else {
        this.say(s, `${name} draws a card and passes.`);
        s.currentPlayerIndex = this.next(s);
      }
      return s;
    }

    if (move.type === 'pass') {
      s.drawnCardId = null;
      s.lastEvent = { kind: 'pass', player: p };
      this.say(s, `${name} keeps the card and passes.`);
      s.currentPlayerIndex = this.next(s);
      return s;
    }

    // play
    const hand = s.playersHands[p];
    const card = hand.splice(hand.findIndex((c) => c.id === move.cardId), 1)[0];
    s.discardPile.push(card);
    s.currentColor = card.color === 'wild' ? move.color! : card.color;
    s.drawnCardId = null;
    s.lastEvent = { kind: 'play', player: p, cardId: card.id };
    this.say(s, `${name} plays ${cardLabel(card)}${card.color === 'wild' ? ` and picks ${s.currentColor}` : ''}.`);

    if (hand.length === 0) {
      s.status = 'finished';
      s.winner = p;
      const points = s.playersHands.reduce((sum, h) => sum + h.reduce((t, c) => t + cardPoints(c), 0), 0);
      s.scores = s.players.map((_, i) => (i === p ? points : 0));
      s.lastEvent = { kind: 'win', player: p, cardId: card.id };
      this.say(s, `${name} wins with ${points} points!`);
      return s;
    }

    if (hand.length === 1) {
      if (move.uno) { s.saidUno[p] = true; this.say(s, `${name}: "UNO!"`); }
      else {
        this.give(s, p, 2);
        s.lastEvent = { kind: 'penalty', player: p, cardId: card.id, count: 2 };
        this.say(s, `${name} forgot to call UNO and draws 2.`);
      }
    }

    const nextP = this.next(s);
    switch (card.type) {
      case 'skip':
        this.say(s, `${s.players[nextP].name} is skipped.`);
        s.currentPlayerIndex = this.next(s, nextP);
        break;
      case 'reverse':
        s.direction = s.direction === 1 ? -1 : 1;
        // With two players Reverse works like Skip.
        s.currentPlayerIndex = s.players.length === 2 ? p : this.next(s);
        break;
      case 'draw_two':
      case 'wild_draw_four': {
        const n = card.type === 'draw_two' ? 2 : 4;
        this.give(s, nextP, n);
        this.say(s, `${s.players[nextP].name} draws ${n} and is skipped.`);
        s.currentPlayerIndex = this.next(s, nextP);
        break;
      }
      default:
        s.currentPlayerIndex = nextP;
    }
    return s;
  }

  /** The seat after `from` in the current direction */
  private next(s: UnoState, from = s.currentPlayerIndex): number {
    const n = s.players.length;
    return (from + s.direction + n) % n;
  }

  /** Deal `count` cards to a player, reshuffling the discard pile into the deck when it runs out */
  private give(s: UnoState, p: number, count: number): Card[] {
    const got: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (!s.deck.length) {
        const keep = s.discardPile.pop()!;
        s.deck = shuffle(s.discardPile);
        s.discardPile = [keep];
        if (s.deck.length) this.say(s, 'The discard pile is shuffled into a new deck.');
      }
      const c = s.deck.pop();
      if (!c) break; // every card is in someone's hand
      s.playersHands[p].push(c);
      got.push(c);
    }
    if (s.playersHands[p].length > 1) s.saidUno[p] = false;
    return got;
  }

  private say(s: UnoState, text: string) {
    s.log.push(youGrammar(text));
    if (s.log.length > 30) s.log.splice(0, s.log.length - 30);
  }

  getLegalMoves(state: UnoState): UnoMove[] {
    if (state.status !== 'playing') return [];
    const p = state.currentPlayerIndex;
    const hand = state.playersHands[p];
    const moves: UnoMove[] = [state.drawnCardId ? { type: 'pass' } : { type: 'draw' }];
    for (const c of hand) {
      if (state.drawnCardId && c.id !== state.drawnCardId) continue;
      if (!canPlay(c, hand, top(state), state.currentColor)) continue;
      const uno = hand.length === 2;
      if (c.color === 'wild') UNO_COLORS.forEach((color) => moves.push({ type: 'play', cardId: c.id, color, uno }));
      else moves.push({ type: 'play', cardId: c.id, uno });
    }
    return moves;
  }

  checkGameOver(state: UnoState): { isOver: boolean; winner: number | null } {
    return { isOver: state.status === 'finished', winner: state.winner };
  }

  getAIMove(state: UnoState, difficulty: Difficulty): UnoMove {
    const p = state.currentPlayerIndex;
    const hand = state.playersHands[p];
    const plays = this.getLegalMoves(state).filter((m): m is Extract<UnoMove, { type: 'play' }> => m.type === 'play');
    const giveUp: UnoMove = state.drawnCardId ? { type: 'pass' } : { type: 'draw' };
    if (!plays.length) return giveUp;

    // Easy bots sometimes forget to shout UNO.
    const callUno = hand.length === 2 && (difficulty !== 'easy' || Math.random() < 0.7);
    const best = (m: Extract<UnoMove, { type: 'play' }>) => ({ ...m, uno: callUno });
    if (difficulty === 'easy') return best(plays[Math.floor(Math.random() * plays.length)]);

    // Favourite colour = the one we hold most of (wilds excluded) — pick it for wilds, play into it otherwise.
    const count = (color: CardColor) => hand.filter((c) => c.color === color).length;
    const favourite = [...UNO_COLORS].sort((a, b) => count(b) - count(a))[0];
    const nextP = (p + state.direction + state.players.length) % state.players.length;
    const threat = state.playersHands[nextP].length <= 2;
    const byId = new Map(hand.map((c) => [c.id, c]));

    const scored = plays
      .filter((m) => byId.get(m.cardId)!.color !== 'wild' || m.color === favourite)
      .map((m) => {
        const c = byId.get(m.cardId)!;
        let score = c.color === 'wild' ? -10 : count(c.color) * 2; // keep wilds for when we're stuck
        if (c.type === 'number') score += c.value! / 3; // shed high cards first
        if (c.type === 'skip' || c.type === 'reverse' || c.type === 'draw_two') score += difficulty === 'hard' && threat ? 12 : 3;
        if (c.type === 'wild_draw_four' && difficulty === 'hard' && threat) score += 25;
        return { m, score };
      })
      .sort((a, b) => b.score - a.score);
    return best(scored[0].m);
  }

  serialize(state: UnoState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): UnoState {
    return JSON.parse(data);
  }
}

/** What one player is allowed to see. Online, the server only ever sends this, so hands stay secret. */
export interface UnoView {
  seat: number; // -1 for a spectator
  players: Player[];
  currentPlayerIndex: number;
  status: UnoState['status'];
  winner: number | null;
  direction: 1 | -1;
  currentColor: PlayColor;
  top: Card;
  deckCount: number;
  handCounts: number[];
  saidUno: boolean[];
  hand: Card[];
  /** Ids of cards in `hand` that can be played right now */
  playable: string[];
  canDraw: boolean;
  canPass: boolean;
  drawnCardId: string | null;
  turn: number;
  lastEvent: UnoEvent | null;
  /** The last few cards played, oldest first (for the pile animation) */
  recent: Card[];
  log: string[];
  scores: number[] | null;
  /** Everyone's remaining cards, once the game is over */
  revealed: Card[][] | null;
}

export function unoViewFor(s: UnoState, seat: number): UnoView {
  const mine = seat === s.currentPlayerIndex && s.status === 'playing';
  const hand = s.playersHands[seat] ?? [];
  const onTop = top(s);
  return {
    seat,
    players: s.players,
    currentPlayerIndex: s.currentPlayerIndex,
    status: s.status,
    winner: s.winner,
    direction: s.direction,
    currentColor: s.currentColor,
    top: onTop,
    deckCount: s.deck.length,
    handCounts: s.playersHands.map((h) => h.length),
    saidUno: s.saidUno,
    hand,
    playable: mine ? hand.filter((c) => (!s.drawnCardId || c.id === s.drawnCardId) && canPlay(c, hand, onTop, s.currentColor)).map((c) => c.id) : [],
    canDraw: mine && !s.drawnCardId,
    canPass: mine && !!s.drawnCardId,
    drawnCardId: mine ? s.drawnCardId : null,
    turn: s.turn,
    lastEvent: s.lastEvent,
    recent: s.discardPile.slice(-4),
    log: s.log.slice(-8),
    scores: s.scores,
    revealed: s.status === 'finished' ? s.playersHands : null,
  };
}
