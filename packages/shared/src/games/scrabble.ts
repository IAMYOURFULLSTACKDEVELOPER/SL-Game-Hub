import type { GameState, GameEngine, Player, Difficulty, GameManifest } from '../types';
import { shuffle } from '../games';

/** A tile in a rack or the bag. Blank tiles have letter '' and value 0. */
export interface Tile {
  letter: string;
  value: number;
  isBlank?: boolean;
}

/** A tile on the board: blanks carry the letter the player chose */
export interface BoardTile {
  letter: string;
  value: number;
  isBlank: boolean;
}

/** Put the rack tile at `rackIndex` on (row, col). For a blank, `letter` is the letter it represents. */
export interface Placement {
  row: number;
  col: number;
  rackIndex: number;
  letter: string;
}

export type ScrabbleMove =
  | { type: 'play'; placements: Placement[] }
  | { type: 'exchange'; indices: number[] }
  | { type: 'pass' };

export type SquareType = 'normal' | 'double_letter' | 'triple_letter' | 'double_word' | 'triple_word' | 'center';

export interface ScoredWord {
  word: string;
  score: number;
  cells: [number, number][];
}

export type PlayAnalysis =
  | { ok: false; error: string }
  | { ok: true; words: ScoredWord[]; score: number; bingo: boolean; invalid: string[]; horizontal: boolean };

export interface ScrabbleState extends GameState {
  board: (BoardTile | null)[][];
  racks: Tile[][];
  bag: Tile[];
  scores: number[];
  firstMove: boolean;
  /** Consecutive turns (passes, exchanges, zero-score plays) without points */
  scorelessTurns: number;
  lastPlay: { playerIndex: number; type: ScrabbleMove['type']; words: ScoredWord[]; score: number; bingo: boolean; cells: [number, number][]; count?: number } | null;
  /** Opening draw that decided who starts */
  startDraw: { playerIndex: number; letter: string }[];
  /** Points added/subtracted for remaining tiles at the end */
  endAdjustments: number[] | null;
  tiedPlayers: number[];
  log: string[];
}

export const SCRABBLE_MANIFEST: GameManifest = {
  id: 'scrabble',
  name: 'Scrabble',
  description: 'Build words on the 15 × 15 board, use premium squares and score big. 2-4 players or play against bots.',
  thumbnail: '🔠',
  minPlayers: 2,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '2.0.0',
};

export const SCRABBLE_SIZE = 15;
export const SCRABBLE_CENTER = 7;
export const SCRABBLE_ROWS = 'ABCDEFGHIJKLMNO';
export const SCRABBLE_BINGO = 50;

/** Letter, points, number of tiles (100 tiles, 2 blanks) */
export const TILE_DISTRIBUTION: { letter: string; value: number; count: number }[] = [
  { letter: 'A', value: 1, count: 9 }, { letter: 'B', value: 3, count: 2 }, { letter: 'C', value: 3, count: 2 },
  { letter: 'D', value: 2, count: 4 }, { letter: 'E', value: 1, count: 12 }, { letter: 'F', value: 4, count: 2 },
  { letter: 'G', value: 2, count: 3 }, { letter: 'H', value: 4, count: 2 }, { letter: 'I', value: 1, count: 9 },
  { letter: 'J', value: 8, count: 1 }, { letter: 'K', value: 5, count: 1 }, { letter: 'L', value: 1, count: 4 },
  { letter: 'M', value: 3, count: 2 }, { letter: 'N', value: 1, count: 6 }, { letter: 'O', value: 1, count: 8 },
  { letter: 'P', value: 3, count: 2 }, { letter: 'Q', value: 10, count: 1 }, { letter: 'R', value: 1, count: 6 },
  { letter: 'S', value: 1, count: 4 }, { letter: 'T', value: 1, count: 6 }, { letter: 'U', value: 1, count: 4 },
  { letter: 'V', value: 4, count: 2 }, { letter: 'W', value: 4, count: 2 }, { letter: 'X', value: 8, count: 1 },
  { letter: 'Y', value: 4, count: 2 }, { letter: 'Z', value: 10, count: 1 }, { letter: '', value: 0, count: 2 },
];
export const LETTER_VALUES: Record<string, number> = Object.fromEntries(TILE_DISTRIBUTION.map((t) => [t.letter, t.value]));

/** Standard premium layout (matches the SL Game Hub board: rows A-O, columns 1-15, star at H8) */
export const SCRABBLE_SQUARES: SquareType[][] = (() => {
  const s: SquareType[][] = Array.from({ length: 15 }, () => Array<SquareType>(15).fill('normal'));
  const mirror = (cells: [number, number][], t: SquareType) => {
    for (const [r, c] of cells) for (const [rr, cc] of [[r, c], [r, 14 - c], [14 - r, c], [14 - r, 14 - c], [c, r], [c, 14 - r], [14 - c, r], [14 - c, 14 - r]]) s[rr][cc] = t;
  };
  mirror([[0, 0], [0, 7]], 'triple_word');
  mirror([[1, 1], [2, 2], [3, 3], [4, 4]], 'double_word');
  mirror([[1, 5], [5, 5]], 'triple_letter');
  mirror([[0, 3], [2, 6], [3, 7], [6, 6]], 'double_letter');
  s[7][7] = 'center';
  return s;
})();

export const squareName = (r: number, c: number) => `${SCRABBLE_ROWS[r]}${c + 1}`;
const rackValue = (rack: Tile[]) => rack.reduce((s, t) => s + t.value, 0);
const inBounds = (r: number, c: number) => r >= 0 && r < 15 && c >= 0 && c < 15;

function newBag(): Tile[] {
  const bag: Tile[] = [];
  for (const t of TILE_DISTRIBUTION) for (let i = 0; i < t.count; i++) bag.push({ letter: t.letter, value: t.value, isBlank: t.letter === '' || undefined });
  return shuffle(bag);
}

/** Check a play and score it. `isWord` (optional) is used to list invalid words. */
export function analyzePlay(state: ScrabbleState, placements: Placement[], isWord?: (w: string) => boolean): PlayAnalysis {
  const rack = state.racks[state.currentPlayerIndex];
  if (placements.length === 0) return { ok: false, error: 'Place at least one tile.' };
  const seenIdx = new Set<number>();
  const seenCell = new Set<number>();
  for (const p of placements) {
    const tile = rack[p.rackIndex];
    if (!tile || seenIdx.has(p.rackIndex)) return { ok: false, error: 'That tile is not on your rack.' };
    seenIdx.add(p.rackIndex);
    if (!inBounds(p.row, p.col)) return { ok: false, error: 'Tiles must be on the board.' };
    if (state.board[p.row][p.col] || seenCell.has(p.row * 15 + p.col)) return { ok: false, error: 'That square is already taken.' };
    seenCell.add(p.row * 15 + p.col);
    if (!/^[A-Z]$/.test(p.letter)) return { ok: false, error: 'Choose a letter for the blank tile.' };
    if (!tile.isBlank && tile.letter !== p.letter) return { ok: false, error: 'Tile letter mismatch.' };
  }
  const rows = new Set(placements.map((p) => p.row));
  const cols = new Set(placements.map((p) => p.col));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'All tiles must be in one row or one column — no diagonals.' };

  const at = (r: number, c: number): BoardTile | null => {
    if (!inBounds(r, c)) return null;
    const placed = placements.find((p) => p.row === r && p.col === c);
    if (placed) return { letter: placed.letter, value: rack[placed.rackIndex].isBlank ? 0 : rack[placed.rackIndex].value, isBlank: !!rack[placed.rackIndex].isBlank };
    return state.board[r][c];
  };
  const isNew = (r: number, c: number) => placements.some((p) => p.row === r && p.col === c);

  let horizontal = rows.size === 1 && (placements.length > 1 || !!at(placements[0].row, placements[0].col - 1) || !!at(placements[0].row, placements[0].col + 1));
  if (placements.length === 1 && !horizontal && !at(placements[0].row - 1, placements[0].col) && !at(placements[0].row + 1, placements[0].col)) horizontal = true;
  const [dr, dc] = horizontal ? [0, 1] : [1, 0];

  // One continuous line: every square between the first and last new tile must be filled
  const sorted = [...placements].sort((a, b) => (horizontal ? a.col - b.col : a.row - b.row));
  const first = sorted[0], last = sorted[sorted.length - 1];
  for (let r = first.row, c = first.col; r <= last.row && c <= last.col; r += dr, c += dc) {
    if (!at(r, c)) return { ok: false, error: 'Tiles must form one continuous line (no gaps).' };
  }

  if (state.firstMove) {
    if (!placements.some((p) => p.row === SCRABBLE_CENTER && p.col === SCRABBLE_CENTER)) return { ok: false, error: 'The first word must cover the centre star (H8).' };
    if (placements.length < 2) return { ok: false, error: 'The first word needs at least two letters.' };
  } else {
    const touches = placements.some((p) => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => inBounds(p.row + a, p.col + b) && state.board[p.row + a][p.col + b]));
    if (!touches) return { ok: false, error: 'Your word must connect to tiles already on the board.' };
  }

  const wordAt = (r0: number, c0: number, sr: number, sc: number): ScoredWord | null => {
    let r = r0, c = c0;
    while (at(r - sr, c - sc)) { r -= sr; c -= sc; }
    const cells: [number, number][] = [];
    let word = '', sum = 0, mult = 1;
    for (; at(r, c); r += sr, c += sc) {
      const t = at(r, c)!;
      cells.push([r, c]);
      word += t.letter;
      let v = t.value;
      if (isNew(r, c)) {
        const sq = SCRABBLE_SQUARES[r][c];
        if (sq === 'double_letter') v *= 2;
        if (sq === 'triple_letter') v *= 3;
        if (sq === 'double_word' || sq === 'center') mult *= 2;
        if (sq === 'triple_word') mult *= 3;
      }
      sum += v;
    }
    return word.length > 1 ? { word, score: sum * mult, cells } : null;
  };

  const words: ScoredWord[] = [];
  const main = wordAt(first.row, first.col, dr, dc);
  if (main) words.push(main);
  for (const p of placements) {
    const cross = wordAt(p.row, p.col, dc, dr);
    if (cross) words.push(cross);
  }
  if (words.length === 0) return { ok: false, error: 'You must form a word of at least two letters.' };
  const bingo = placements.length === 7;
  const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? SCRABBLE_BINGO : 0);
  const invalid = isWord ? words.map((w) => w.word).filter((w) => !isWord(w)) : [];
  return { ok: true, words, score, bingo, invalid, horizontal };
}

export class ScrabbleEngine implements GameEngine<ScrabbleState, ScrabbleMove> {
  private dict: Set<string> | null;
  private botWords: string[] = [];

  constructor(dictionary?: Iterable<string>) {
    this.dict = null;
    if (dictionary) this.setDictionary(dictionary);
  }

  /** Load the word list used to validate plays and to drive the bots */
  setDictionary(words: Iterable<string>) {
    this.dict = new Set(Array.from(words, (w) => w.toUpperCase()));
    this.botWords = Array.from(this.dict).filter((w) => w.length <= 8);
  }

  hasDictionary() { return !!this.dict; }
  isWord = (w: string) => !this.dict || this.dict.has(w.toUpperCase());

  initialize(players: Player[]): ScrabbleState {
    let bag = newBag();
    // Each player draws one tile: closest to A starts, a blank beats every letter
    const draw = players.map((_, i) => ({ playerIndex: i, letter: bag[i].letter }));
    const rank = (l: string) => (l === '' ? -1 : l.charCodeAt(0));
    const starter = [...draw].sort((a, b) => rank(a.letter) - rank(b.letter) || a.playerIndex - b.playerIndex)[0].playerIndex;
    bag = shuffle(bag);
    const racks = players.map(() => bag.splice(0, 7));
    const now = Date.now();
    return {
      gameId: SCRABBLE_MANIFEST.id,
      players,
      currentPlayerIndex: starter,
      status: 'playing',
      winner: null,
      board: Array.from({ length: 15 }, () => Array<BoardTile | null>(15).fill(null)),
      racks,
      bag,
      scores: players.map(() => 0),
      firstMove: true,
      scorelessTurns: 0,
      lastPlay: null,
      startDraw: draw,
      endAdjustments: null,
      tiedPlayers: [],
      log: [`${players[starter].name} drew ${draw[starter].letter || 'a blank'} and goes first.`],
      createdAt: now,
      updatedAt: now,
    };
  }

  isValidMove(state: ScrabbleState, move: ScrabbleMove, playerIndex: number): boolean {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayerIndex) return false;
    if (move.type === 'pass') return true;
    if (move.type === 'exchange') {
      const rack = state.racks[playerIndex];
      return state.bag.length >= 7 && move.indices.length > 0 && new Set(move.indices).size === move.indices.length && move.indices.every((i) => i >= 0 && i < rack.length);
    }
    const a = analyzePlay(state, move.placements, this.isWord);
    return a.ok && a.invalid.length === 0;
  }

  applyMove(state: ScrabbleState, move: ScrabbleMove): ScrabbleState {
    const p = state.currentPlayerIndex;
    const name = state.players[p].name;
    const next: ScrabbleState = {
      ...state,
      racks: state.racks.map((r) => [...r]),
      bag: [...state.bag],
      scores: [...state.scores],
      log: [...state.log],
      updatedAt: Date.now(),
    };
    if (move.type === 'pass') {
      next.scorelessTurns++;
      next.lastPlay = { playerIndex: p, type: 'pass', words: [], score: 0, bingo: false, cells: [] };
      next.log.push(`${name} passed.`);
    } else if (move.type === 'exchange') {
      const out = move.indices.map((i) => next.racks[p][i]);
      next.racks[p] = next.racks[p].filter((_, i) => !move.indices.includes(i));
      next.racks[p].push(...next.bag.splice(0, out.length));
      next.bag = shuffle([...next.bag, ...out]);
      next.scorelessTurns++;
      next.lastPlay = { playerIndex: p, type: 'exchange', words: [], score: 0, bingo: false, cells: [], count: out.length };
      next.log.push(`${name} exchanged ${out.length} tile${out.length > 1 ? 's' : ''}.`);
    } else {
      const a = analyzePlay(state, move.placements, this.isWord);
      if (!a.ok) throw new Error(a.error);
      next.board = state.board.map((row) => [...row]);
      for (const pl of move.placements) {
        const t = state.racks[p][pl.rackIndex];
        next.board[pl.row][pl.col] = { letter: pl.letter, value: t.isBlank ? 0 : t.value, isBlank: !!t.isBlank };
      }
      const used = new Set(move.placements.map((pl) => pl.rackIndex));
      next.racks[p] = next.racks[p].filter((_, i) => !used.has(i));
      next.racks[p].push(...next.bag.splice(0, 7 - next.racks[p].length));
      next.scores[p] += a.score;
      next.firstMove = false;
      next.scorelessTurns = a.score > 0 ? 0 : state.scorelessTurns + 1;
      next.lastPlay = { playerIndex: p, type: 'play', words: a.words, score: a.score, bingo: a.bingo, cells: move.placements.map((pl) => [pl.row, pl.col]) };
      next.log.push(`${name} played ${a.words.map((w) => `${w.word} (${w.score})`).join(', ')}${a.bingo ? ' + 50 bingo!' : ''} = ${a.score}.`);
      if (next.racks[p].length === 0 && next.bag.length === 0) return this.finish(next, p);
    }
    if (next.scorelessTurns >= state.players.length * 2) return this.finish(next, null);
    next.currentPlayerIndex = (p + 1) % state.players.length;
    return next;
  }

  /** End of game: subtract remaining tiles; a player who went out gains everyone else's remaining tiles */
  private finish(state: ScrabbleState, wentOut: number | null): ScrabbleState {
    const adj = state.racks.map((r) => -rackValue(r));
    if (wentOut !== null) adj[wentOut] = state.racks.reduce((s, r, i) => (i === wentOut ? s : s + rackValue(r)), 0);
    const scores = state.scores.map((s, i) => s + adj[i]);
    const max = Math.max(...scores);
    const top = scores.flatMap((s, i) => (s === max ? [i] : []));
    return {
      ...state,
      scores,
      endAdjustments: adj,
      status: 'finished',
      winner: top.length === 1 ? top[0] : null,
      tiedPlayers: top.length > 1 ? top : [],
      log: [...state.log, wentOut !== null ? `${state.players[wentOut].name} went out! Game over.` : 'No more plays — game over.'],
    };
  }

  /** Candidate plays for the current player, best first (needs a dictionary) */
  getLegalMoves(state: ScrabbleState, limit = 40): ScrabbleMove[] {
    return this.findPlays(state, limit).map((c) => ({ type: 'play' as const, placements: c.placements }));
  }

  findPlays(state: ScrabbleState, limit = 40): { placements: Placement[]; score: number; words: string[] }[] {
    if (!this.dict || state.status !== 'playing') return [];
    const rack = state.racks[state.currentPlayerIndex];
    const rackCount = new Array(26).fill(0);
    let blanks = 0;
    for (const t of rack) if (t.isBlank) blanks++; else rackCount[t.letter.charCodeAt(0) - 65]++;
    const found = new Map<string, { placements: Placement[]; score: number; words: string[] }>();
    const b = state.board;
    const hasNeighbour = (r: number, c: number) => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([x, y]) => inBounds(r + x, c + y) && !!b[r + x][c + y]);

    for (const horizontal of [true, false]) {
      for (let line = 0; line < 15; line++) {
        if (state.firstMove && (line !== SCRABBLE_CENTER || !horizontal)) continue;
        const cell = (i: number) => (horizontal ? b[line][i] : b[i][line]);
        const pos = (i: number): [number, number] => (horizontal ? [line, i] : [i, line]);
        const lineCount = new Array(26).fill(0);
        let anchors = false;
        for (let i = 0; i < 15; i++) {
          const t = cell(i);
          if (t) lineCount[t.letter.charCodeAt(0) - 65]++;
          else if (hasNeighbour(...pos(i))) anchors = true;
        }
        if (!state.firstMove && !anchors) continue;

        const have = lineCount.map((n, k) => n + rackCount[k]);
        const need = new Array(26).fill(0);
        for (const w of this.botWords) {
          let deficit = 0;
          for (let k = 0; k < w.length; k++) {
            const li = w.charCodeAt(k) - 65;
            if (++need[li] > have[li]) deficit++;
          }
          for (let k = 0; k < w.length; k++) need[w.charCodeAt(k) - 65] = 0;
          if (deficit > blanks) continue;

          for (let s = 0; s + w.length <= 15; s++) {
            if ((s > 0 && cell(s - 1)) || (s + w.length < 15 && cell(s + w.length))) continue;
            const avail = [...rackCount];
            let blanksLeft = blanks, ok = true, linked = false;
            const placements: Placement[] = [];
            const usedIdx = new Set<number>();
            for (let k = 0; k < w.length && ok; k++) {
              const t = cell(s + k);
              const [r, c] = pos(s + k);
              if (t) { if (t.letter !== w[k]) ok = false; else linked = true; continue; }
              const li = w.charCodeAt(k) - 65;
              let idx = -1;
              if (avail[li] > 0) { avail[li]--; idx = rack.findIndex((rt, ri) => !usedIdx.has(ri) && !rt.isBlank && rt.letter === w[k]); }
              else if (blanksLeft > 0) { blanksLeft--; idx = rack.findIndex((rt, ri) => !usedIdx.has(ri) && rt.isBlank); }
              if (idx < 0) { ok = false; break; }
              usedIdx.add(idx);
              if (hasNeighbour(r, c)) linked = true;
              placements.push({ row: r, col: c, rackIndex: idx, letter: w[k] });
            }
            if (!ok || placements.length === 0 || (!state.firstMove && !linked)) continue;
            const a = analyzePlay(state, placements, this.isWord);
            if (!a.ok || a.invalid.length) continue;
            const key = placements.map((p) => `${p.row},${p.col},${p.letter}`).join('|');
            if (!found.has(key)) found.set(key, { placements, score: a.score, words: a.words.map((x) => x.word) });
          }
        }
      }
    }
    return Array.from(found.values()).sort((x, y) => y.score - x.score).slice(0, limit);
  }

  checkGameOver(state: ScrabbleState): { isOver: boolean; winner: number | null } {
    return { isOver: state.status === 'finished', winner: state.winner };
  }

  getAIMove(state: ScrabbleState, difficulty: Difficulty): ScrabbleMove {
    const plays = this.findPlays(state, 60);
    if (plays.length) {
      const pick = difficulty === 'hard' ? plays[0]
        : difficulty === 'medium' ? plays[Math.floor(Math.random() * Math.min(5, plays.length))]
          : plays[Math.floor(plays.length / 2 + Math.random() * (plays.length / 2))];
      return { type: 'play', placements: pick.placements };
    }
    const rack = state.racks[state.currentPlayerIndex];
    if (state.bag.length >= 7) {
      const indices = rack.map((t, i) => [t, i] as const).filter(([t]) => !t.isBlank && !'AEIRST'.includes(t.letter)).map(([, i]) => i);
      if (indices.length) return { type: 'exchange', indices };
    }
    return { type: 'pass' };
  }

  serialize(state: ScrabbleState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): ScrabbleState {
    const parsed = JSON.parse(data) as ScrabbleState;
    parsed.players = parsed.players.map((p: Player) => ({ id: p.id, name: p.name, isAI: p.isAI, difficulty: p.difficulty }));
    return parsed;
  }
}
