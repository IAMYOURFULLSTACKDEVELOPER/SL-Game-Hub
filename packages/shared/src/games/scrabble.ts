import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** Scrabble tile with letter and value */
export interface Tile {
  letter: string;
  value: number;
  isBlank?: boolean;
}

/** Scrabble placement on board */
export interface Placement {
  row: number;
  col: number;
  tile: Tile;
}

/** Scrabble move: place tiles on board */
export interface ScrabbleMove {
  placements: Placement[];
  isHorizontal: boolean;
}

/** Board square type */
export type SquareType = 'normal' | 'double_letter' | 'triple_letter' | 'double_word' | 'triple_word' | 'center';

/** Scrabble game state */
export interface ScrabbleState extends GameState {
  board: (Tile | null)[][];
  playersHands: Tile[][];
  bag: Tile[];
  boardSquares: SquareType[][];
  firstMove: boolean;
  consecutivePasses: number;
  scores: number[];
}

/** Scrabble game manifest */
export const SCRABBLE_MANIFEST: GameManifest = {
  id: 'scrabble',
  name: 'Scrabble',
  description: 'Create words from letter tiles and score points based on letter values.',
  thumbnail: '📝',
  minPlayers: 2,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Tile distribution for English Scrabble */
const TILE_DISTRIBUTION: { letter: string; value: number; count: number }[] = [
  { letter: 'A', value: 1, count: 9 },
  { letter: 'B', value: 3, count: 2 },
  { letter: 'C', value: 3, count: 2 },
  { letter: 'D', value: 2, count: 4 },
  { letter: 'E', value: 1, count: 12 },
  { letter: 'F', value: 4, count: 2 },
  { letter: 'G', value: 2, count: 3 },
  { letter: 'H', value: 4, count: 2 },
  { letter: 'I', value: 1, count: 9 },
  { letter: 'J', value: 8, count: 1 },
  { letter: 'K', value: 5, count: 1 },
  { letter: 'L', value: 1, count: 4 },
  { letter: 'M', value: 3, count: 2 },
  { letter: 'N', value: 1, count: 6 },
  { letter: 'O', value: 1, count: 8 },
  { letter: 'P', value: 3, count: 2 },
  { letter: 'Q', value: 10, count: 1 },
  { letter: 'R', value: 1, count: 6 },
  { letter: 'S', value: 1, count: 4 },
  { letter: 'T', value: 1, count: 6 },
  { letter: 'U', value: 1, count: 4 },
  { letter: 'V', value: 4, count: 2 },
  { letter: 'W', value: 4, count: 2 },
  { letter: 'X', value: 8, count: 1 },
  { letter: 'Y', value: 4, count: 2 },
  { letter: 'Z', value: 10, count: 1 },
  { letter: '', value: 0, count: 2 }, // Blank tiles
];

/** Common English words for validation (simplified dictionary) */
const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
  'is', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'did', 'does',
  'cat', 'dog', 'hat', 'bat', 'rat', 'mat', 'sat', 'pat', 'fat', 'gat',
  'car', 'bar', 'far', 'jar', 'tar', 'war', 'ear', 'oar', 'tear', 'gear',
  'red', 'bed', 'led', 'fed', 'wed', 'ted', 'kid', 'lid', 'rid', 'bid',
  'pig', 'big', 'dig', 'fig', 'jig', 'wig', 'log', 'bog', 'fog', 'hog',
  'cup', 'pup', 'sup', 'up', 'nut', 'cut', 'but', 'gut', 'hut', 'rut',
  'box', 'fox', 'ox', 'tax', 'wax', 'ax', 'mix', 'fix', 'six', 'pix',
  'pen', 'hen', 'men', 'ten', 'den', 'fen', 'gen', 'ken', 'len', 'wen',
  'pan', 'can', 'fan', 'man', 'ran', 'tan', 'van', 'ban', 'dan', 'gan',
  'sun', 'fun', 'run', 'gun', 'bun', 'pun', 'win', 'tin', 'bin', 'fin',
  'net', 'bet', 'get', 'jet', 'let', 'met', 'pet', 'set', 'vet', 'wet',
  'top', 'hop', 'mop', 'pop', 'cop', 'sop', 'lop', 'bop', 'fop', 'gop',
  'hot', 'pot', 'lot', 'dot', 'got', 'not', 'rot', 'cot', 'jot', 'tot',
  'map', 'lap', 'cap', 'gap', 'nap', 'rap', 'tap', 'sap', 'zap', 'yap',
  'dad', 'mad', 'bad', 'had', 'lad', 'pad', 'sad', 'fad', 'wad', 'rad',
  'mom', 'com', 'dom', 'bom', 'fom', 'gom', 'hom', 'kom', 'lom', 'rom',
  'sis', 'bis', 'dis', 'fis', 'gis', 'his', 'kis', 'lis', 'mis', 'ris',
  'pop', 'pip', 'pap', 'pep', 'pup', 'mop', 'bop', 'hop', 'cop', 'top',
  'bob', 'bib', 'bab', 'beb', 'bub', 'mob', 'sob', 'cob', 'dob', 'rob',
  'non', 'nin', 'nan', 'nen', 'nun', 'mon', 'son', 'con', 'don', 'ron',
  'eye', 'aye', 'bye', 'dye', 'lie', 'pie', 'tie', 'vie', 'wye', 'rye',
  'add', 'odd', 'edd', 'idd', 'udd', 'lud', 'bud', 'cud', 'dud', 'mud',
  'all', 'ill', 'ell', 'ull', 'oll', 'ball', 'call', 'fall', 'hall', 'mall',
  'ask', 'mask', 'task', 'bask', 'cask', 'flask', 'brisk', 'disk', 'risk', 'whisk',
  'ant', 'cant', 'rant', 'chant', 'grant', 'plant', 'slant', 'want', 'pant', 'sant',
  'ace', 'face', 'lace', 'race', 'pace', 'mace', 'case', 'base', 'vase', 'chase',
  'age', 'cage', 'page', 'rage', 'sage', 'wage', 'stage', 'gauge', 'engage', 'mage',
  'are', 'bare', 'care', 'dare', 'fare', 'hare', 'mare', 'pare', 'rare', 'ware',
  'ate', 'bate', 'cate', 'date', 'fate', 'gate', 'hate', 'late', 'mate', 'rate',
  'ape', 'cape', 'drape', 'gape', 'nape', 'rape', 'tape', 'shape', 'scape', 'escape',
  'ice', 'dice', 'lice', 'mice', 'nice', 'rice', 'vice', 'price', 'slice', 'spice',
  'one', 'bone', 'cone', 'done', 'gone', 'hone', 'lone', 'none', 'pone', 'tone',
  'ore', 'bore', 'core', 'fore', 'gore', 'more', 'pore', 'sore', 'score', 'store',
  'use', 'fuse', 'muse', 'ruse', 'abuse', 'cause', 'pause', 'excuse', 'refuse', 'confuse',
  'key', 'grey', 'prey', 'they', 'obey', 'donkey', 'monkey', 'turkey', 'jockey', 'hockey',
  'play', 'clay', 'gray', 'pray', 'slay', 'stay', 'tray', 'display', 'delay', 'relay',
  'way', 'away', 'sway', 'subway', 'highway', 'doorway', 'pathway', 'always', 'anyway', 'midway',
  'day', 'today', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'holiday',
  'may', 'clay', 'gray', 'pray', 'slay', 'stay', 'tray', 'display', 'delay', 'relay',
  'say', 'essay', 'assay', 'okays', 'naysay', 'say', 'says', 'saying', 'said', 'unsay',
  'pay', 'repay', 'impay', 'nonpay', 'prepay', 'uppay', 'away', 'bipay', 'copay', 'defray',
  'bay', 'obey', 'hobnob', 'okay', 'jockey', 'hockey', 'donkey', 'monkey', 'turkey', 'whiskey',
  'boy', 'toy', 'joy', 'coy', 'soy', 'employ', 'deploy', 'annoy', 'enjoy', 'ahoy',
  'fly', 'dry', 'cry', 'try', 'fry', 'shy', 'sky', 'spy', 'why', 'guy',
  'now', 'how', 'cow', 'bow', 'wow', 'sow', 'mow', 'row', 'tow', 'vow',
  'law', 'raw', 'saw', 'paw', 'jaw', 'caw', 'haw', 'daw', 'maw', 'taw',
  'new', 'few', 'hew', 'mew', 'pew', 'sew', 'view', 'review', 'interview', 'preview',
  'low', 'blow', 'flow', 'glow', 'slow', 'grow', 'show', 'throw', 'know', 'snow',
  'who', 'whom', 'whose', 'whole', 'wholly', 'wholesale', 'wholesome', 'whoo', 'whop', 'whorl',
  'yes', 'yep', 'yess', 'yesterday', 'yet', 'yesterday', 'yield', 'young', 'your', 'yours',
  'and', 'band', 'hand', 'land', 'sand', 'stand', 'brand', 'grand', 'strand', 'expand',
  'end', 'bend', 'lend', 'mend', 'pend', 'rend', 'send', 'spend', 'tend', 'vend',
  'ind', 'bind', 'find', 'kind', 'mind', 'wind', 'grind', 'blind', 'behind', 'remind',
  'ond', 'bond', 'fond', 'pond', 'respond', 'diamond', 'second', 'beyond', 'blond', 'frond',
  'und', 'fund', 'pound', 'round', 'sound', 'ground', 'surround', 'abound', 'bound', 'compound',
  'for', 'more', 'core', 'store', 'score', 'before', 'ignore', 'explore', 'restore', 'adore',
  'nor', 'honor', 'major', 'minor', 'senior', 'junior', 'interior', 'exterior', 'superior', 'inferior',
  'our', 'hour', 'sour', 'four', 'tour', 'devour', 'colour', 'flavour', 'honour', 'labour',
  'air', 'fair', 'hair', 'pair', 'chair', 'stair', 'repair', 'despair', 'affair', 'armchair',
  'ear', 'hear', 'fear', 'near', 'dear', 'bear', 'gear', 'year', 'clear', 'appear',
  'oar', 'roar', 'soar', 'boar', 'uproar', 'explore', 'ignore', 'restore', 'adore', 'shore',
  'are', 'bare', 'care', 'dare', 'fare', 'hare', 'mare', 'pare', 'rare', 'share',
  'ere', 'here', 'there', 'where', 'sincere', 'severe', 'austere', 'atmosphere', 'hemisphere', 'biosphere',
  'ire', 'fire', 'hire', 'tire', 'wire', 'entire', 'desire', 'retire', 'inspire', 'expire',
  'ore', 'bore', 'core', 'fore', 'gore', 'more', 'pore', 'sore', 'score', 'store',
  'ure', 'cure', 'pure', 'sure', 'endure', 'mature', 'nature', 'future', 'picture', 'fixture',
  'age', 'cage', 'page', 'rage', 'sage', 'wage', 'stage', 'gauge', 'engage', 'courage',
  'ale', 'bale', 'dale', 'fale', 'gale', 'hale', 'kale', 'male', 'pale', 'sale',
  'ane', 'bane', 'cane', 'fane', 'gane', 'hane', 'lane', 'mane', 'pane', 'rane',
  'ape', 'cape', 'drape', 'gape', 'nape', 'rape', 'tape', 'shape', 'scape', 'escape',
  'ase', 'base', 'case', 'ease', 'lease', 'phase', 'raise', 'chase', 'praise', 'cease',
  'ate', 'bate', 'cate', 'date', 'fate', 'gate', 'hate', 'late', 'mate', 'rate',
  'ave', 'cave', 'pave', 'rave', 'save', 'wave', 'brave', 'crave', 'shave', 'stave',
  'awe', 'bawl', 'crawl', 'drawl', 'pawl', 'shawl', 'squall', 'straw', 'thrall', 'trawl',
  'axe', 'lax', 'tax', 'wax', 'flax', 'relax', 'annex', 'complex', 'flex', 'reflex',
  'aze', 'blaze', 'craze', 'glaze', 'graze', 'haze', 'maze', 'phase', 'praise', 'raise',
]);

/** Scrabble game engine */
export class ScrabbleEngine implements GameEngine<ScrabbleState, ScrabbleMove> {
  initialize(players: Player[], options?: Record<string, unknown>): ScrabbleState {
    // Create tile bag
    const bag: Tile[] = [];
    for (const tile of TILE_DISTRIBUTION) {
      for (let i = 0; i < tile.count; i++) {
        bag.push({ letter: tile.letter, value: tile.value, isBlank: tile.letter === '' });
      }
    }
    shuffle(bag);

    // Initialize board
    const board: (Tile | null)[][] = Array(15).fill(null).map(() => Array(15).fill(null));

    // Initialize board squares
    const boardSquares = this.createBoardSquares();

    // Deal initial hands (7 tiles each)
    const playersHands: Tile[][] = [];
    for (let i = 0; i < players.length; i++) {
      const hand: Tile[] = [];
      for (let j = 0; j < 7 && bag.length > 0; j++) {
        hand.push(bag.pop()!);
      }
      playersHands.push(hand);
    }

    return {
      gameId: SCRABBLE_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      board,
      playersHands,
      bag,
      boardSquares,
      firstMove: true,
      consecutivePasses: 0,
      scores: Array(players.length).fill(0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private createBoardSquares(): SquareType[][] {
    const squares: SquareType[][] = Array(15).fill(null).map(() => Array(15).fill('normal'));

    // Triple word squares
    const tripleWord: [number, number][] = [
      [0, 0], [0, 7], [0, 14],
      [7, 0], [7, 14],
      [14, 0], [14, 7], [14, 14],
    ];
    for (const [r, c] of tripleWord) squares[r][c] = 'triple_word';

    // Double word squares
    const doubleWord: [number, number][] = [
      [1, 1], [2, 2], [3, 3], [4, 4],
      [1, 13], [2, 12], [3, 11], [4, 10],
      [13, 1], [12, 2], [11, 3], [10, 4],
      [13, 13], [12, 12], [11, 11], [10, 10],
    ];
    for (const [r, c] of doubleWord) squares[r][c] = 'double_word';

    // Triple letter squares
    const tripleLetter: [number, number][] = [
      [1, 5], [1, 9],
      [5, 1], [5, 5], [5, 9], [5, 13],
      [9, 1], [9, 5], [9, 9], [9, 13],
      [13, 5], [13, 9],
    ];
    for (const [r, c] of tripleLetter) squares[r][c] = 'triple_letter';

    // Double letter squares
    const doubleLetter: [number, number][] = [
      [0, 3], [0, 11],
      [2, 6], [2, 8],
      [3, 0], [3, 7], [3, 14],
      [6, 2], [6, 6], [6, 8], [6, 12],
      [7, 3], [7, 11],
      [8, 2], [8, 6], [8, 8], [8, 12],
      [11, 0], [11, 7], [11, 14],
      [12, 6], [12, 8],
      [14, 3], [14, 11],
    ];
    for (const [r, c] of doubleLetter) squares[r][c] = 'double_letter';

    // Center square
    squares[7][7] = 'center';

    return squares;
  }

  isValidMove(state: ScrabbleState, move: ScrabbleMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;

    const hand = state.playersHands[playerIndex];

    // Check if player has the tiles
    for (const placement of move.placements) {
      const tileIndex = hand.findIndex(
        (t) => t.letter === placement.tile.letter && t.value === placement.tile.value
      );
      if (tileIndex === -1) return false;
    }

    // Check if placements are in a straight line
    if (move.placements.length === 0) return false;
    if (move.placements.length === 1) return true; // Single tile is always in line

    const rows = new Set(move.placements.map((p) => p.row));
    const cols = new Set(move.placements.map((p) => p.col));

    if (rows.size === 1) {
      // Horizontal placement
      if (!move.isHorizontal) return false;
      const colArray = Array.from(cols).sort((a, b) => a - b);
      for (let i = 0; i < colArray.length - 1; i++) {
        if (colArray[i + 1] - colArray[i] !== 1) return false; // Must be consecutive
      }
    } else if (cols.size === 1) {
      // Vertical placement
      if (move.isHorizontal) return false;
      const rowArray = Array.from(rows).sort((a, b) => a - b);
      for (let i = 0; i < rowArray.length - 1; i++) {
        if (rowArray[i + 1] - rowArray[i] !== 1) return false; // Must be consecutive
      }
    } else {
      return false; // Not in a straight line
    }

    // Check if placements are on empty squares
    for (const placement of move.placements) {
      if (placement.row < 0 || placement.row >= 15 || placement.col < 0 || placement.col >= 15) return false;
      if (state.board[placement.row][placement.col] !== null) return false;
    }

    // First move must cover center square
    if (state.firstMove) {
      const coversCenter = move.placements.some((p) => p.row === 7 && p.col === 7);
      if (!coversCenter) return false;
    }

    // Check if word is valid
    const words = this.getFormedWords(state, move);
    for (const word of words) {
      if (!this.isValidWord(word)) return false;
    }

    // Check if tiles connect to existing tiles (except first move)
    if (!state.firstMove) {
      const connects = move.placements.some((p) => this.hasAdjacentTile(state, p.row, p.col));
      if (!connects) return false;
    }

    return true;
  }

  private hasAdjacentTile(state: ScrabbleState, row: number, col: number): boolean {
    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
    ];
    for (const [dr, dc] of directions) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15) {
        if (state.board[nr][nc] !== null) return true;
      }
    }
    return false;
  }

  private getFormedWords(state: ScrabbleState, move: ScrabbleMove): string[] {
    const words: string[] = [];
    const tempBoard = state.board.map((r) => [...r]);

    // Place tiles on temp board
    for (const placement of move.placements) {
      tempBoard[placement.row][placement.col] = placement.tile;
    }

    // Get main word (horizontal or vertical)
    const mainWord = this.getWordAtPosition(tempBoard, move);
    if (mainWord) words.push(mainWord);

    // Get cross words
    for (const placement of move.placements) {
      const crossWord = this.getCrossWord(tempBoard, placement.row, placement.col, move.isHorizontal);
      if (crossWord && crossWord !== mainWord) words.push(crossWord);
    }

    return words;
  }

  private getWordAtPosition(board: (Tile | null)[][], move: ScrabbleMove): string | null {
    const { placements, isHorizontal } = move;
    if (placements.length === 0) return null;

    const row = placements[0].row;
    const col = placements[0].col;

    if (isHorizontal) {
      // Get horizontal word
      let startCol = col;
      while (startCol > 0 && board[row][startCol - 1] !== null) startCol--;

      let endCol = col;
      while (endCol < 14 && board[row][endCol + 1] !== null) endCol++;

      let word = '';
      for (let c = startCol; c <= endCol; c++) {
        const tile = board[row][c];
        if (tile) word += tile.letter || '?';
      }
      return word.length > 1 ? word : null;
    } else {
      // Get vertical word
      let startRow = row;
      while (startRow > 0 && board[startRow - 1][col] !== null) startRow--;

      let endRow = row;
      while (endRow < 14 && board[endRow + 1][col] !== null) endRow++;

      let word = '';
      for (let r = startRow; r <= endRow; r++) {
        const tile = board[r][col];
        if (tile) word += tile.letter || '?';
      }
      return word.length > 1 ? word : null;
    }
  }

  private getCrossWord(board: (Tile | null)[][], row: number, col: number, isHorizontal: boolean): string | null {
    if (isHorizontal) {
      // Get vertical cross word
      let startRow = row;
      while (startRow > 0 && board[startRow - 1][col] !== null) startRow--;

      let endRow = row;
      while (endRow < 14 && board[endRow + 1][col] !== null) endRow++;

      let word = '';
      for (let r = startRow; r <= endRow; r++) {
        const tile = board[r][col];
        if (tile) word += tile.letter || '?';
      }
      return word.length > 1 ? word : null;
    } else {
      // Get horizontal cross word
      let startCol = col;
      while (startCol > 0 && board[row][startCol - 1] !== null) startCol--;

      let endCol = col;
      while (endCol < 14 && board[row][endCol + 1] !== null) endCol++;

      let word = '';
      for (let c = startCol; c <= endCol; c++) {
        const tile = board[row][c];
        if (tile) word += tile.letter || '?';
      }
      return word.length > 1 ? word : null;
    }
  }

  private isValidWord(word: string): boolean {
    return COMMON_WORDS.has(word.toLowerCase());
  }

  applyMove(state: ScrabbleState, move: ScrabbleMove): ScrabbleState {
    const newState = { ...state, updatedAt: Date.now() };
    newState.board = state.board.map((r) => [...r]);
    newState.playersHands = state.playersHands.map((h) => [...h]);
    newState.scores = [...state.scores];

    const playerIndex = state.currentPlayerIndex;
    const hand = newState.playersHands[playerIndex];

    // Remove tiles from hand and place on board
    for (const placement of move.placements) {
      const tileIndex = hand.findIndex(
        (t) => t.letter === placement.tile.letter && t.value === placement.tile.value
      );
      if (tileIndex !== -1) {
        hand.splice(tileIndex, 1);
      }
      newState.board[placement.row][placement.col] = placement.tile;
    }

    // Calculate score
    const score = this.calculateScore(newState, move);
    newState.scores[playerIndex] += score;

    // Draw new tiles
    while (hand.length < 7 && newState.bag.length > 0) {
      hand.push(newState.bag.pop()!);
    }

    // Update game state
    newState.firstMove = false;
    newState.consecutivePasses = 0;

    // Switch player
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;

    // Check for game over
    if (newState.bag.length === 0 && this.isHandEmpty(newState)) {
      newState.status = 'finished';
      const maxScore = Math.max(...newState.scores);
      const winners = newState.scores.map((s, i) => (s === maxScore ? i : -1)).filter((i) => i !== -1);
      newState.winner = winners[0];
    }

    return newState;
  }

  private calculateScore(state: ScrabbleState, move: ScrabbleMove): number {
    let score = 0;
    let wordMultiplier = 1;

    const tempBoard = state.board.map((r) => [...r]);
    for (const placement of move.placements) {
      tempBoard[placement.row][placement.col] = placement.tile;
    }

    // Calculate letter scores with multipliers
    for (const placement of move.placements) {
      const square = state.boardSquares[placement.row][placement.col];
      let letterScore = placement.tile.value;

      if (square === 'double_letter') {
        letterScore *= 2;
      } else if (square === 'triple_letter') {
        letterScore *= 3;
      } else if (square === 'double_word') {
        wordMultiplier *= 2;
      } else if (square === 'triple_word' || square === 'center') {
        wordMultiplier *= 3;
      }

      score += letterScore;
    }

    // Add existing tiles in the word
    const mainWord = this.getWordAtPosition(tempBoard, move);
    if (mainWord) {
      for (const placement of move.placements) {
        // Add adjacent existing tiles
        // (Simplified - in full implementation would add all tiles in word)
      }
    }

    score *= wordMultiplier;

    // Bingo bonus (using all 7 tiles)
    if (move.placements.length === 7) {
      score += 50;
    }

    return score;
  }

  private isHandEmpty(state: ScrabbleState): boolean {
    return state.playersHands.some((hand) => hand.length === 0);
  }

  getLegalMoves(state: ScrabbleState): ScrabbleMove[] {
    const moves: ScrabbleMove[] = [];
    const hand = state.playersHands[state.currentPlayerIndex];

    // Generate all possible single tile placements
    for (const tile of hand) {
      for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 15; col++) {
          if (state.board[row][col] === null) {
            const move: ScrabbleMove = {
              placements: [{ row, col, tile }],
              isHorizontal: true,
            };
            if (this.isValidMove(state, move, state.currentPlayerIndex)) {
              moves.push(move);
            }
          }
        }
      }
    }

    // Generate multi-tile placements (simplified)
    // Full implementation would generate all combinations

    return moves;
  }

  checkGameOver(state: ScrabbleState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: ScrabbleState, difficulty: Difficulty): ScrabbleMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      // Pass - return empty move
      return { placements: [], isHorizontal: true };
    }

    switch (difficulty) {
      case 'easy':
        return getRandomMove(moves);

      case 'medium':
        // Prefer longer words and higher scores
        const scoredMoves = moves.map((move) => {
          const score = this.calculateScore(state, move);
          return { move, score };
        });
        scoredMoves.sort((a, b) => b.score - a.score);
        return scoredMoves[0].move;

      case 'hard':
        // Prefer high-scoring moves with bonus squares
        const bestMoves = moves.map((move) => {
          let score = this.calculateScore(state, move);

          // Bonus for using bonus squares
          for (const placement of move.placements) {
            const square = state.boardSquares[placement.row][placement.col];
            if (square === 'triple_word' || square === 'double_word') {
              score += 20;
            } else if (square === 'triple_letter' || square === 'double_letter') {
              score += 5;
            }
          }

          // Bonus for longer words
          score += move.placements.length * 3;

          return { move, score };
        });
        bestMoves.sort((a, b) => b.score - a.score);
        return bestMoves[0].move;

      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: ScrabbleState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): ScrabbleState {
    const parsed = JSON.parse(data);
    parsed.players = parsed.players.map((p: Player) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      difficulty: p.difficulty,
    }));
    return parsed;
  }
}
