import { v, type Infer } from 'convex/values';
import { UnoEngine, unoViewFor, UNO_MANIFEST, type UnoState, type UnoMove } from '@slgh/shared/src/games/uno';
import {
  SalonePolyEngine, salonePolyViewFor, actor as polyActor, SALONE_POLY_MANIFEST,
  type SalonePolyState, type SalonePolyMove,
} from '@slgh/shared/src/games/salone-poly';
import { ChessEngine, CHESS_MANIFEST, type ChessState, type ChessMove } from '@slgh/shared/src/games/chess';
import { CheckersEngine, CHECKERS_MANIFEST, type CheckersState } from '@slgh/shared/src/games/checkers';
import { SnakeAndLadderEngine, SNAKE_AND_LADDER_MANIFEST, type SnakeAndLadderState } from '@slgh/shared/src/games/snake-and-ladder';
import { WordSearchEngine, WORD_SEARCH_BOARD_COUNT, selectionPath, type WordSearchState } from '@slgh/shared/src/games/word-search';
import { ScrabbleEngine, SCRABBLE_MANIFEST, type ScrabbleState, type ScrabbleMove } from '@slgh/shared/src/games/scrabble';
import type { Difficulty, GameState, Player } from '@slgh/shared/src/types';

// Every game that can be played in an online room (rooms.ts), and how the server referees it.
// The server always owns the game: it checks and applies every move, rolls every die,
// plays the bots, and sends each player only what they may see.

export const ROOM_GAMES = ['uno', 'salone-poly', 'chess', 'checkers', 'snake-and-ladder', 'scrabble', 'word-search', 'snake'] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];
export const roomGameV = v.union(
  v.literal('uno'), v.literal('salone-poly'), v.literal('chess'), v.literal('checkers'),
  v.literal('snake-and-ladder'), v.literal('scrabble'), v.literal('word-search'), v.literal('snake'),
);

const colorV = v.union(v.literal('red'), v.literal('yellow'), v.literal('green'), v.literal('blue'));
const squareV = v.object({ row: v.number(), col: v.number() });
const pieceV = v.union(v.literal('queen'), v.literal('rook'), v.literal('bishop'), v.literal('knight'));
const spaceMove = <T extends string>(type: T) => v.object({ type: v.literal(type), space: v.number() });
const placementV = v.object({ row: v.number(), col: v.number(), rackIndex: v.number(), letter: v.string() });

export const scrabbleMoveV = v.union(
  v.object({ type: v.literal('play'), placements: v.array(placementV) }),
  v.object({ type: v.literal('exchange'), indices: v.array(v.number()) }),
  v.object({ type: v.literal('pass') }),
);

export const moveV = v.union(
  // UNO
  v.object({ type: v.literal('play'), cardId: v.string(), color: v.optional(colorV), uno: v.optional(v.boolean()) }),
  v.object({ type: v.literal('draw') }),
  v.object({ type: v.literal('pass') }),
  // Salone-Poly and Snake & Ladder (no dice in `roll`: the server rolls). Trades go through offerTrade/respondTrade.
  v.object({ type: v.literal('roll') }),
  v.object({ type: v.literal('buy') }),
  v.object({ type: v.literal('decline') }),
  v.object({ type: v.literal('bid'), amount: v.number() }),
  v.object({ type: v.literal('auction_pass') }),
  v.object({ type: v.literal('pay_jail') }),
  v.object({ type: v.literal('use_jail_card') }),
  spaceMove('build'), spaceMove('sell_building'), spaceMove('mortgage'), spaceMove('unmortgage'),
  v.object({ type: v.literal('pay_debt') }),
  v.object({ type: v.literal('bankrupt') }),
  v.object({ type: v.literal('end_turn') }),
  v.object({ type: v.literal('time_up') }),
  // Chess and Checkers: just the squares; the server finds the matching legal move
  v.object({ type: v.literal('chess'), from: squareV, to: squareV, promotion: v.optional(pieceV) }),
  v.object({ type: v.literal('checkers'), from: v.number(), to: v.number() }),
  // Scrabble (plays are word-checked in scrabbleNode.ts; pass is shared with UNO above)
  v.object({ type: v.literal('play'), placements: v.array(placementV) }),
  v.object({ type: v.literal('exchange'), indices: v.array(v.number()) }),
  // Word Search race: a line from one cell to another
  v.object({ type: v.literal('select'), start: v.number(), end: v.number() }),
  // Snake race: each phone plays its own snake and reports its score
  v.object({ type: v.literal('snake_score'), score: v.number(), alive: v.boolean() }),
);
export type RoomMove = Infer<typeof moveV>;

export interface GameSpec<S = any> {
  max: number;
  /** Empty seats can be filled with bots, and a bot takes over from someone who leaves */
  bots: boolean;
  botDelayMs: number;
  /** Bots think in the Node runtime (scrabbleNode.ts) because they need the dictionary */
  nodeBot?: boolean;
  /** Everyone plays at once (races) instead of taking turns */
  simultaneous?: boolean;
  /** The host can set a time limit */
  timer?: boolean;
  moveTypes: ReadonlySet<string>;
  start(players: Player[], minutes: number): S;
  /** What `seat` (-1 for a spectator) may see */
  view(s: S, seat: number): unknown;
  /** Seat that must act now (turn-based games) */
  actor(s: S): number;
  /** Why the move is not allowed, or null */
  check(s: S, m: RoomMove, seat: number): string | null;
  apply(s: S, m: RoomMove, seat: number): S;
  /** A bot's next state, or null if it has nothing to do */
  botStep?(s: S, level: Difficulty): S | null;
  /** Time limit reached */
  timeUp?(s: S): S;
  /** Games without bots: what happens to a player's seat when they leave mid-game */
  onLeave?(s: S, seat: number): S;
}

const notYourTurn = (s: GameState, seat: number) =>
  s.status !== 'playing' ? 'The game is over.' : seat !== s.currentPlayerIndex ? 'It is not your turn.' : null;
const rollDie = () => 1 + Math.floor(Math.random() * 6);

// ---------- UNO ----------
const uno = new UnoEngine();
const unoSpec: GameSpec<UnoState> = {
  max: UNO_MANIFEST.maxPlayers, bots: true, botDelayMs: 1100,
  moveTypes: new Set(['play', 'draw', 'pass']),
  start: (players) => uno.initialize(players),
  view: (s, seat) => unoViewFor(s, seat),
  actor: (s) => s.currentPlayerIndex,
  check: (s, m, seat) => ('placements' in m ? 'That move belongs to a different game.' : uno.check(s, m as UnoMove, seat)),
  apply: (s, m) => uno.applyMove(s, m as UnoMove),
  botStep: (s, level) => {
    const m = uno.getAIMove(s, level);
    // A move the engine refuses would leave the bot stuck: fall back to drawing or passing.
    return uno.applyMove(s, uno.isValidMove(s, m, s.currentPlayerIndex) ? m : s.drawnCardId ? { type: 'pass' } : { type: 'draw' });
  },
};

// ---------- Salone-Poly ----------
const poly = new SalonePolyEngine();
const polySpec: GameSpec<SalonePolyState> = {
  max: SALONE_POLY_MANIFEST.maxPlayers, bots: true, botDelayMs: 800, timer: true,
  moveTypes: new Set(['roll', 'buy', 'decline', 'bid', 'auction_pass', 'pay_jail', 'use_jail_card', 'build', 'sell_building',
    'mortgage', 'unmortgage', 'pay_debt', 'bankrupt', 'end_turn', 'time_up']),
  start: (players, minutes) => poly.initialize(players, { minutes }),
  view: (s) => salonePolyViewFor(s),
  actor: (s) => polyActor(s),
  check: (s, m, seat) => {
    if (m.type === 'time_up') return !s.endsAt || Date.now() < s.endsAt ? 'There is still time left.' : null;
    return poly.check(s, m as SalonePolyMove, seat);
  },
  apply: (s, m) => poly.applyMove(s, m as SalonePolyMove),
  botStep: (s, level) => { const next = poly.applyMove(s, poly.getAIMove(s, level)); return next === s ? null : next; },
  timeUp: (s) => poly.applyMove(s, { type: 'time_up' }),
};

// ---------- Chess ----------
const chess = new ChessEngine();
function chessMoveFor(s: ChessState, m: RoomMove): ChessMove | null {
  if (m.type !== 'chess') return null;
  const matches = chess.getLegalMoves(s).filter((x) =>
    x.from.row === m.from.row && x.from.col === m.from.col && x.to.row === m.to.row && x.to.col === m.to.col);
  return matches.find((x) => (x.promotion ?? 'queen') === (m.promotion ?? 'queen') || !x.promotion) ?? null;
}
const chessSpec: GameSpec<ChessState> = {
  max: CHESS_MANIFEST.maxPlayers, bots: true, botDelayMs: 700,
  moveTypes: new Set(['chess']),
  start: (players) => chess.initialize(players),
  view: (s) => s,
  actor: (s) => s.currentPlayerIndex,
  check: (s, m, seat) => notYourTurn(s, seat) ?? (chessMoveFor(s, m) ? null : 'That move is not allowed.'),
  apply: (s, m) => chess.applyMove(s, chessMoveFor(s, m)!),
  botStep: (s, level) => {
    const m = chess.getAIMove(s, level);
    return chess.isValidMove(s, m, s.currentPlayerIndex) ? chess.applyMove(s, m) : null;
  },
};

// ---------- Checkers ----------
const checkers = new CheckersEngine();
const checkersMoveFor = (s: CheckersState, m: RoomMove) =>
  m.type === 'checkers' ? checkers.getLegalMoves(s).find((x) => x.from === m.from && x.to === m.to) ?? null : null;
const checkersSpec: GameSpec<CheckersState> = {
  max: CHECKERS_MANIFEST.maxPlayers, bots: true, botDelayMs: 700,
  moveTypes: new Set(['checkers']),
  start: (players) => checkers.initialize(players),
  view: (s) => s,
  actor: (s) => s.currentPlayerIndex,
  check: (s, m, seat) => notYourTurn(s, seat) ?? (checkersMoveFor(s, m) ? null : 'That move is not allowed.'),
  apply: (s, m) => checkers.applyMove(s, checkersMoveFor(s, m)!),
  botStep: (s, level) => {
    const m = checkers.getAIMove(s, level);
    return checkers.isValidMove(s, m, s.currentPlayerIndex) ? checkers.applyMove(s, m) : null;
  },
};

// ---------- Snake & Ladder (the server rolls) ----------
const ladder = new SnakeAndLadderEngine();
const ladderSpec: GameSpec<SnakeAndLadderState> = {
  max: SNAKE_AND_LADDER_MANIFEST.maxPlayers, bots: true, botDelayMs: 1200,
  moveTypes: new Set(['roll']),
  start: (players) => ladder.initialize(players),
  view: (s) => s,
  actor: (s) => s.currentPlayerIndex,
  check: (s, _m, seat) => notYourTurn(s, seat),
  apply: (s) => ladder.applyMove(s, rollDie()),
  botStep: (s) => ladder.applyMove(s, rollDie()),
};

// ---------- Scrabble (racks and the bag stay secret; words are checked in scrabbleNode.ts) ----------
export const scrabbleRules = new ScrabbleEngine(); // no dictionary: structure only
const scrabbleSpec: GameSpec<ScrabbleState> = {
  max: SCRABBLE_MANIFEST.maxPlayers, bots: true, botDelayMs: 900, nodeBot: true,
  moveTypes: new Set(['play', 'exchange', 'pass']),
  start: (players) => scrabbleRules.initialize(players),
  view: (s, seat) => ({
    ...s,
    racks: s.racks.map((r, i) => (i === seat || s.status === 'finished' ? r : [])),
    rackCounts: s.racks.map((r) => r.length),
    bag: [],
    bagCount: s.bag.length,
  }),
  actor: (s) => s.currentPlayerIndex,
  check: (s, m, seat) => {
    const why = notYourTurn(s, seat);
    if (why) return why;
    if (m.type === 'play' && 'cardId' in m) return 'That move belongs to a different game.';
    return scrabbleRules.isValidMove(s, m as ScrabbleMove, seat) ? null : 'That move is not allowed.';
  },
  apply: (s, m) => scrabbleRules.applyMove(s, m as ScrabbleMove),
};

// ---------- Word Search race: one grid, everyone hunts at once ----------
const words = new WordSearchEngine();
const wordSearchSpec: GameSpec<WordSearchState> = {
  max: 6, bots: false, botDelayMs: 0, simultaneous: true,
  moveTypes: new Set(['select']),
  start: (players) => words.initialize(players, { board: 1 + Math.floor(Math.random() * WORD_SEARCH_BOARD_COUNT), timed: false }),
  // Where the unfound words are is the whole game, so only found words carry their cells.
  view: (s) => ({ ...s, words: s.words.map((w) => (w.found || s.status === 'finished' ? w : { ...w, positions: [] })), hint: null }),
  actor: () => -1,
  check: (s, m, seat) => {
    if (s.status !== 'playing') return 'The game is over.';
    if (seat < 0) return 'You are watching this game, not playing in it.';
    return m.type === 'select' && selectionPath(m.start, m.end, s.gridSize) ? null : 'Pick a straight line of letters.';
  },
  // The engine credits whoever's "turn" it is, so the finder takes the turn for this one selection.
  apply: (s, m, seat) => ({ ...words.applyMove({ ...s, currentPlayerIndex: seat }, m as { start: number; end: number }), currentPlayerIndex: 0 }),
};

// ---------- Snake race: everyone plays their own snake; highest score when all have crashed ----------
export interface SnakeRaceState extends GameState {
  scores: number[];
  alive: boolean[];
  endsAt: number | null;
}
const finishSnake = (s: SnakeRaceState): SnakeRaceState => {
  const best = Math.max(...s.scores);
  const top = s.scores.flatMap((x, i) => (x === best ? [i] : []));
  return { ...s, status: 'finished', winner: top.length === 1 ? top[0] : null, alive: s.alive.map(() => false), updatedAt: Date.now() };
};
const snakeSpec: GameSpec<SnakeRaceState> = {
  max: 6, bots: false, botDelayMs: 0, simultaneous: true, timer: true,
  moveTypes: new Set(['snake_score']),
  start: (players, minutes) => {
    const now = Date.now();
    return {
      gameId: 'snake', players, currentPlayerIndex: 0, status: 'playing', winner: null,
      scores: players.map(() => 0), alive: players.map(() => true),
      endsAt: minutes ? now + minutes * 60_000 : null, createdAt: now, updatedAt: now,
    };
  },
  view: (s) => s,
  actor: () => -1,
  check: (s, m, seat) => {
    if (s.status !== 'playing') return 'The game is over.';
    if (seat < 0) return 'You are watching this game, not playing in it.';
    if (m.type !== 'snake_score') return 'That move belongs to a different game.';
    if (!s.alive[seat]) return 'Your snake has already crashed.';
    if (!Number.isInteger(m.score) || m.score < s.scores[seat] || m.score > 100_000) return 'That score does not add up.';
    return null;
  },
  apply: (s, m, seat) => {
    if (m.type !== 'snake_score') return s;
    const next = { ...s, scores: [...s.scores], alive: [...s.alive], updatedAt: Date.now() };
    next.scores[seat] = m.score;
    next.alive[seat] = m.alive;
    return next.alive.some(Boolean) ? next : finishSnake(next);
  },
  timeUp: (s) => (s.status === 'playing' ? finishSnake(s) : s),
  onLeave: (s, seat) => {
    const next = { ...s, alive: s.alive.map((a, i) => (i === seat ? false : a)) };
    return next.alive.some(Boolean) ? next : finishSnake(next);
  },
};

export const SPECS: Record<RoomGame, GameSpec> = {
  uno: unoSpec, 'salone-poly': polySpec, chess: chessSpec, checkers: checkersSpec,
  'snake-and-ladder': ladderSpec, scrabble: scrabbleSpec, 'word-search': wordSearchSpec, snake: snakeSpec,
};

