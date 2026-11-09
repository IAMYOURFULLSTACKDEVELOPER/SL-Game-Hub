import type { GameState, GameEngine, Player, Difficulty, GameManifest } from '../types';
import type { RuleSection } from '../rulebook';
import { WORD_SEARCH_THEMES } from './word-search-themes';

export { WORD_SEARCH_THEMES };

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** [rowStep, colStep] */
export type Direction = readonly [number, number];
const RIGHT: Direction = [0, 1];
const DOWN: Direction = [1, 0];
const DOWN_RIGHT: Direction = [1, 1];
const UP_RIGHT: Direction = [-1, 1];
const FORWARD: Direction[] = [RIGHT, DOWN, DOWN_RIGHT, UP_RIGHT];

export interface WordSearchLevel {
  id: WordSearchDifficulty;
  label: string;
  tagline: string;
  gridSize: number;
  wordCount: number;
  directions: Direction[];
  /** Chance that a word is written backwards (reversed direction) */
  backwardsChance: number;
  minLen: number;
  maxLen: number;
  /** Countdown in seconds when timed mode is on */
  timeLimitSec: number;
  timedByDefault: boolean;
  /** Boards [from, to] (inclusive) that belong to this level */
  boards: [number, number];
  features: string[];
}

export const WORD_SEARCH_BOARD_COUNT = 500;

export const WORD_SEARCH_LEVELS: Record<WordSearchDifficulty, WordSearchLevel> = {
  easy: {
    id: 'easy', label: 'Easy', tagline: 'Beginner', gridSize: 6, wordCount: 5, directions: [RIGHT, DOWN],
    backwardsChance: 0, minLen: 3, maxLen: 6, timeLimitSec: 180, timedByDefault: false, boards: [1, 125],
    features: ['6 × 6 grid', '5 hidden words', 'Horizontal and vertical', 'No backwards words'],
  },
  medium: {
    id: 'medium', label: 'Medium', tagline: 'Intermediate', gridSize: 10, wordCount: 10, directions: FORWARD,
    backwardsChance: 0.25, minLen: 3, maxLen: 10, timeLimitSec: 300, timedByDefault: false, boards: [126, 250],
    features: ['10 × 10 grid', '10 hidden words', 'Horizontal, vertical and diagonal', 'Some backwards words'],
  },
  hard: {
    id: 'hard', label: 'Hard', tagline: 'Advanced', gridSize: 15, wordCount: 20, directions: FORWARD,
    backwardsChance: 0.5, minLen: 4, maxLen: 12, timeLimitSec: 480, timedByDefault: true, boards: [251, 375],
    features: ['15 × 15 grid', '20 hidden words', 'All eight directions', 'Countdown timer'],
  },
  expert: {
    id: 'expert', label: 'Expert', tagline: 'Challenge', gridSize: 20, wordCount: 30, directions: FORWARD,
    backwardsChance: 0.5, minLen: 5, maxLen: 15, timeLimitSec: 720, timedByDefault: true, boards: [376, 500],
    features: ['20 × 20 grid', '30 hidden words', 'All eight directions', 'Longer and more complex words'],
  },
};
export const WORD_SEARCH_DIFFICULTIES = Object.keys(WORD_SEARCH_LEVELS) as WordSearchDifficulty[];

export const WORD_SEARCH_POINTS = { find: 100, noHintBonus: 50, complete: 200, hint: -25, wrong: 0 } as const;

/** One of the 500 boards: a theme, a difficulty and its own bank of 30+ words */
export interface WordSearchBoard {
  number: number;
  theme: string;
  difficulty: WordSearchDifficulty;
  bank: string[];
}

export interface PlacedWord {
  word: string;
  positions: number[];
  found: boolean;
  foundBy: number | null;
  hinted: boolean;
}

/** Select a straight line of letters from the start cell to the end cell */
export interface WordSearchMove {
  start: number;
  end: number;
}

export interface WordSearchState extends GameState {
  boardNumber: number | null;
  theme: string;
  difficulty: WordSearchDifficulty;
  gridSize: number;
  grid: string[];
  words: PlacedWord[];
  foundWords: string[];
  scores: number[];
  wordsFoundBy: number[];
  selections: number;
  correctSelections: number;
  hintsUsed: number;
  hint: { word: string; cell: number } | null;
  timeLimitSec: number | null;
  startedAt: number;
  finishedAt: number | null;
  timedOut: boolean;
  lastResult: { word: string | null; positions: number[]; playerIndex: number; points: number } | null;
  /** Kept for backwards compatibility with older saves */
  selectedCells: number[];
}

export const WORD_SEARCH_MANIFEST: GameManifest = {
  id: 'word-search',
  name: 'Word Search',
  description: '500 themed boards across Easy, Medium, Hard and Expert. Find every hidden word in all eight directions — solo against the clock or against friends.',
  thumbnail: '🔤',
  minPlayers: 1,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '2.0.0',
};

/** Deterministic PRNG so every board and daily challenge is the same for everybody */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function difficultyForBoard(n: number): WordSearchDifficulty {
  return WORD_SEARCH_DIFFICULTIES.find((d) => n >= WORD_SEARCH_LEVELS[d].boards[0] && n <= WORD_SEARCH_LEVELS[d].boards[1]) ?? 'expert';
}

const boardCache = new Map<number, WordSearchBoard>();

/** Board 1-500. Boards 1-125 Easy, 126-250 Medium, 251-375 Hard, 376-500 Expert; themes rotate. */
export function getWordSearchBoard(n: number): WordSearchBoard {
  const number = Math.min(WORD_SEARCH_BOARD_COUNT, Math.max(1, Math.floor(n)));
  const cached = boardCache.get(number);
  if (cached) return cached;
  const theme = WORD_SEARCH_THEMES[(number - 1) % WORD_SEARCH_THEMES.length];
  const difficulty = difficultyForBoard(number);
  const { minLen, maxLen } = WORD_SEARCH_LEVELS[difficulty];
  const candidates = theme.words.filter((w) => w.length >= minLen && w.length <= maxLen);
  const size = 30 + (number % 11); // 30-40 words per board
  const bank: string[] = [];
  for (const w of seededShuffle(candidates, mulberry32(number * 7919 + 17))) {
    if (bank.length >= size) break;
    if (!bank.some((b) => b.includes(w) || w.includes(b))) bank.push(w);
  }
  bank.sort();
  const board = { number, theme: theme.name, difficulty, bank };
  boardCache.set(number, board);
  return board;
}

export function getWordSearchBoards(difficulty?: WordSearchDifficulty, theme?: string): WordSearchBoard[] {
  const out: WordSearchBoard[] = [];
  for (let n = 1; n <= WORD_SEARCH_BOARD_COUNT; n++) {
    if (difficulty && difficultyForBoard(n) !== difficulty) continue;
    if (theme && WORD_SEARCH_THEMES[(n - 1) % WORD_SEARCH_THEMES.length].name !== theme) continue;
    out.push(getWordSearchBoard(n));
  }
  return out;
}

/** The same daily puzzle for everyone: board and round depend only on the date (UTC) */
export function dailyChallenge(date = new Date()): { board: number; round: number; key: string } {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return { board: (Math.imul(day, 2654435761) >>> 0) % WORD_SEARCH_BOARD_COUNT + 1, round: day, key: new Date(day * 86400000).toISOString().slice(0, 10) };
}

export function normalizeWord(w: string): string {
  return w.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Place words into an empty grid using the level's directions, then fill blanks with random letters */
export function generateWordSearchGrid(
  bank: string[], level: Pick<WordSearchLevel, 'gridSize' | 'wordCount' | 'directions' | 'backwardsChance'>, rng: () => number,
): { grid: string[]; words: PlacedWord[] } {
  const size = level.gridSize;
  const usable = Array.from(new Set(bank.map(normalizeWord))).filter((w) => w.length >= 2 && w.length <= size);
  let best: { grid: string[]; words: PlacedWord[] } = { grid: Array(size * size).fill(''), words: [] };

  for (let attempt = 0; attempt < 40; attempt++) {
    const grid: string[] = Array(size * size).fill('');
    const words: PlacedWord[] = [];
    for (const word of seededShuffle(usable, rng)) {
      if (words.length >= level.wordCount) break;
      if (words.some((p) => p.word.includes(word) || word.includes(p.word))) continue;
      const positions = placeWord(grid, word, size, level, rng);
      if (positions) words.push({ word, positions, found: false, foundBy: null, hinted: false });
    }
    if (words.length > best.words.length) best = { grid, words };
    if (words.length >= Math.min(level.wordCount, usable.length)) break;
  }

  const letters = 'ABCDEFGHIJKLMNOPRSTUWY';
  const grid = best.grid.map((c) => c || letters[Math.floor(rng() * letters.length)]);
  return { grid, words: best.words };
}

function placeWord(grid: string[], word: string, size: number, level: Pick<WordSearchLevel, 'directions' | 'backwardsChance'>, rng: () => number): number[] | null {
  for (let tries = 0; tries < 150; tries++) {
    let [dr, dc] = level.directions[Math.floor(rng() * level.directions.length)];
    if (rng() < level.backwardsChance) { dr = -dr; dc = -dc; }
    const r0 = Math.floor(rng() * size);
    const c0 = Math.floor(rng() * size);
    const rEnd = r0 + dr * (word.length - 1);
    const cEnd = c0 + dc * (word.length - 1);
    if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue;
    const positions: number[] = [];
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const idx = (r0 + dr * i) * size + (c0 + dc * i);
      if (grid[idx] !== '' && grid[idx] !== word[i]) { ok = false; break; }
      positions.push(idx);
    }
    if (!ok) continue;
    positions.forEach((p, i) => { grid[p] = word[i]; });
    return positions;
  }
  return null;
}

/** Cells on the straight line from start to end, or null if they are not in one of the 8 directions */
export function selectionPath(start: number, end: number, size: number): number[] | null {
  if (start < 0 || end < 0 || start >= size * size || end >= size * size) return null;
  const r0 = Math.floor(start / size), c0 = start % size;
  const r1 = Math.floor(end / size), c1 = end % size;
  const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
  const len = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (r1 - r0 !== dr * len || c1 - c0 !== dc * len) return null;
  return Array.from({ length: len + 1 }, (_, i) => (r0 + dr * i) * size + (c0 + dc * i));
}

const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Find which hidden, unfound word the selection matches (forwards or backwards) */
export function matchSelection(state: WordSearchState, move: WordSearchMove): PlacedWord | null {
  const path = selectionPath(move.start, move.end, state.gridSize);
  if (!path || path.length < 2) return null;
  const reversed = [...path].reverse();
  const exact = state.words.find((w) => !w.found && (samePath(w.positions, path) || samePath(w.positions, reversed)));
  if (exact) return exact;
  const letters = path.map((p) => state.grid[p]).join('');
  const backwards = [...letters].reverse().join('');
  return state.words.find((w) => !w.found && (w.word === letters || w.word === backwards)) ?? null;
}

export class WordSearchEngine implements GameEngine<WordSearchState, WordSearchMove> {
  /**
   * options: board (1-500), round (replay number; changes which words of the bank are hidden),
   * difficulty (only for custom puzzles), words (custom word list), timed (boolean)
   */
  initialize(players: Player[], options?: Record<string, unknown>): WordSearchState {
    const custom = Array.isArray(options?.words) ? (options!.words as string[]).map(normalizeWord).filter((w) => w.length >= 2) : null;
    const boardNumber = custom ? null : Number(options?.board ?? 1);
    const board = boardNumber ? getWordSearchBoard(boardNumber) : null;
    const difficulty = board?.difficulty ?? ((options?.difficulty as WordSearchDifficulty) || 'medium');
    const level = { ...WORD_SEARCH_LEVELS[difficulty] };
    if (options?.gridSize) level.gridSize = Number(options.gridSize);
    if (options?.numWords) level.wordCount = Number(options.numWords);
    if (custom) {
      level.wordCount = Math.min(custom.length, 40);
      level.gridSize = Math.min(20, Math.max(level.gridSize, ...custom.map((w) => w.length)));
    }
    const round = Number(options?.round ?? Math.floor(Math.random() * 1e9));
    const rng = mulberry32((board?.number ?? 9999) * 100003 + round);
    const { grid, words } = generateWordSearchGrid(custom ?? board!.bank, level, rng);
    const timed = options?.timed === undefined ? level.timedByDefault : Boolean(options.timed);
    const now = Date.now();

    return {
      gameId: WORD_SEARCH_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      boardNumber: board?.number ?? null,
      theme: board?.theme ?? String(options?.theme ?? 'Custom'),
      difficulty,
      gridSize: level.gridSize,
      grid,
      words,
      foundWords: [],
      scores: players.map(() => 0),
      wordsFoundBy: players.map(() => 0),
      selections: 0,
      correctSelections: 0,
      hintsUsed: 0,
      hint: null,
      timeLimitSec: timed ? level.timeLimitSec : null,
      startedAt: now,
      finishedAt: null,
      timedOut: false,
      lastResult: null,
      selectedCells: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  isValidMove(state: WordSearchState, move: WordSearchMove, playerIndex: number): boolean {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayerIndex) return false;
    return !!selectionPath(move.start, move.end, state.gridSize);
  }

  applyMove(state: WordSearchState, move: WordSearchMove): WordSearchState {
    const player = state.currentPlayerIndex;
    const match = matchSelection(state, move);
    const path = selectionPath(move.start, move.end, state.gridSize) ?? [];
    const next: WordSearchState = {
      ...state,
      scores: [...state.scores],
      wordsFoundBy: [...state.wordsFoundBy],
      selections: state.selections + 1,
      updatedAt: Date.now(),
    };
    if (!match) {
      next.lastResult = { word: null, positions: path, playerIndex: player, points: WORD_SEARCH_POINTS.wrong };
      if (state.players.length > 1) next.currentPlayerIndex = (player + 1) % state.players.length;
      return next;
    }
    let points = WORD_SEARCH_POINTS.find + (match.hinted ? 0 : WORD_SEARCH_POINTS.noHintBonus);
    next.words = state.words.map((w) => (w === match ? { ...w, found: true, foundBy: player } : w));
    next.foundWords = [...state.foundWords, match.word];
    next.correctSelections = state.correctSelections + 1;
    next.wordsFoundBy[player]++;
    if (state.hint?.word === match.word) next.hint = null;
    if (next.words.every((w) => w.found)) {
      points += WORD_SEARCH_POINTS.complete;
      next.status = 'finished';
      next.finishedAt = Date.now();
    }
    next.scores[player] += points;
    next.lastResult = { word: match.word, positions: match.positions, playerIndex: player, points };
    if (next.status === 'finished') next.winner = this.leader(next);
    return next;
  }

  /** Reveal where an unfound word starts. Costs the current player 25 points. */
  useHint(state: WordSearchState): WordSearchState {
    if (state.status !== 'playing') return state;
    const target = state.words.find((w) => !w.found && w.word === state.hint?.word) ?? state.words.find((w) => !w.found && !w.hinted) ?? state.words.find((w) => !w.found);
    if (!target) return state;
    const scores = [...state.scores];
    scores[state.currentPlayerIndex] += WORD_SEARCH_POINTS.hint;
    return {
      ...state,
      scores,
      hintsUsed: state.hintsUsed + 1,
      words: state.words.map((w) => (w === target ? { ...w, hinted: true } : w)),
      hint: { word: target.word, cell: target.positions[0] },
      updatedAt: Date.now(),
    };
  }

  /** End the game when the countdown runs out */
  expire(state: WordSearchState): WordSearchState {
    if (state.status !== 'playing') return state;
    const next = { ...state, status: 'finished' as const, timedOut: true, finishedAt: Date.now(), updatedAt: Date.now() };
    next.winner = state.players.length > 1 ? this.leader(next) : null;
    return next;
  }

  /** Pass the turn to the next player (multiplayer) */
  passTurn(state: WordSearchState): WordSearchState {
    return { ...state, currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length, updatedAt: Date.now() };
  }

  private leader(state: WordSearchState): number | null {
    const max = Math.max(...state.scores);
    const leaders = state.scores.flatMap((s, i) => (s === max ? [i] : []));
    return leaders.length === 1 ? leaders[0] : null;
  }

  getLegalMoves(state: WordSearchState): WordSearchMove[] {
    return state.words.filter((w) => !w.found).map((w) => ({ start: w.positions[0], end: w.positions[w.positions.length - 1] }));
  }

  checkGameOver(state: WordSearchState): { isOver: boolean; winner: number | null } {
    return { isOver: state.status === 'finished', winner: state.winner };
  }

  /** Bots: easy misses often, medium sometimes, hard always finds a word */
  getAIMove(state: WordSearchState, difficulty: Difficulty): WordSearchMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) return { start: 0, end: 0 };
    const miss = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.2 : 0;
    if (Math.random() < miss) {
      const s = Math.floor(Math.random() * state.grid.length);
      return { start: s, end: s };
    }
    const byLength = [...moves].sort((a, b) => b.end - b.start - (a.end - a.start));
    return difficulty === 'hard' ? byLength[0] : moves[Math.floor(Math.random() * moves.length)];
  }

  serialize(state: WordSearchState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): WordSearchState {
    const parsed = JSON.parse(data) as WordSearchState;
    parsed.players = parsed.players.map((p: Player) => ({ id: p.id, name: p.name, isAI: p.isAI, difficulty: p.difficulty }));
    return parsed;
  }
}

export const WORD_SEARCH_RULES: RuleSection[] = [
  { title: 'Objective', rules: [
    'Find every word in the word list hidden inside the letter grid.',
    'Solo: find them all (before the timer runs out in timed mode). Multiplayer: score the most points.',
  ] },
  { title: 'The boards', rules: [
    'There are 500 boards. Each board has a theme (Animals, Food, Sierra Leone, Space and more) and its own bank of 30-40 words.',
    'Boards 1-125 are Easy, 126-250 Medium, 251-375 Hard and 376-500 Expert.',
    'Each round hides a fresh selection of words from the board’s bank, so you can replay a board and get a new puzzle.',
    'The Daily Challenge gives everyone the same puzzle each day.',
  ] },
  { title: 'Difficulty levels', rules: [
    'Easy (Beginner): 6 × 6 grid, 5 hidden words, horizontal and vertical only, no backwards words.',
    'Medium (Intermediate): 10 × 10 grid, 10 hidden words, horizontal, vertical and diagonal, some backwards words.',
    'Hard (Advanced): 15 × 15 grid, 20 hidden words, all eight directions, countdown timer.',
    'Expert (Challenge): 20 × 20 grid, 30 hidden words, all eight directions, longer and more complex words.',
  ] },
  { title: 'How words are hidden', rules: [
    'Words run in a straight line in any allowed direction: left to right, right to left, top to bottom, bottom to top, and the four diagonals.',
    'Words may cross and share letters. All other cells are filled with random letters.',
  ] },
  { title: 'How to play', rules: [
    'Press (or touch) the first letter of a word and drag across the letters to the last letter, then release.',
    'You can also tap the first letter and then tap the last letter.',
    'Selections must be a straight line: horizontal, vertical or exactly diagonal.',
    'If the letters form a hidden word (in either direction) it is highlighted and crossed off the list.',
  ] },
  { title: 'Scoring', rules: [
    'Find a word: +100 points.',
    'Find a word without using a hint on it: +50 bonus.',
    'Complete the whole puzzle: +200 points.',
    'Use a hint (reveals where a word starts): -25 points.',
    'Incorrect selection: 0 points (and in multiplayer the turn passes to the next player).',
  ] },
  { title: 'Timer, pause and stats', rules: [
    'Timed mode gives a countdown (Easy 3 min, Medium 5 min, Hard 8 min, Expert 12 min). When it reaches zero the round ends.',
    'You can pause and resume at any time; the grid is hidden while paused.',
    'Your words found, remaining words, accuracy, completion time and personal best per board are tracked.',
  ] },
  { title: 'Multiplayer', rules: [
    '2-4 players share one device, or fill seats with bots.',
    'Players take turns. Keep finding words to keep your turn; an incorrect selection passes the turn.',
    'The player with the highest score when all words are found (or time runs out) wins.',
  ] },
  { title: 'Custom puzzles', rules: [
    'Type your own list of words, pick a difficulty and the game builds a grid for you.',
  ] },
];
