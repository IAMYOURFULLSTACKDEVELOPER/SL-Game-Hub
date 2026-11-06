import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** Word in the grid */
export interface Word {
  word: string;
  found: boolean;
  positions: number[];
}

/** Word Search move: select a word by its start and end positions */
export interface WordSearchMove {
  word: string;
  start: number;
  end: number;
}

/** Word Search game state */
export interface WordSearchState extends GameState {
  gridSize: number;
  grid: string[];
  words: Word[];
  foundWords: string[];
  selectedCells: number[];
}

const WORD_LIST = [
  'CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'TIGER', 'BEAR', 'WOLF',
  'TREE', 'FLOWER', 'GRASS', 'RIVER', 'OCEAN', 'MOUNTAIN', 'SKY', 'STAR',
  'SUN', 'MOON', 'CLOUD', 'RAIN', 'SNOW', 'WIND', 'FIRE', 'EARTH',
  'RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK', 'WHITE', 'ORANGE', 'PURPLE',
  'MUSIC', 'DANCE', 'SING', 'PLAY', 'READ', 'WRITE', 'DRAW', 'PAINT',
];

export const WORD_SEARCH_MANIFEST: GameManifest = {
  id: 'word-search',
  name: 'Word Search',
  description: 'Find the hidden words in the grid.',
  thumbnail: '🔤',
  minPlayers: 1,
  maxPlayers: 1,
  modes: ['single'],
  version: '1.0.0',
};

export class WordSearchEngine implements GameEngine<WordSearchState, WordSearchMove> {
  private readonly directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  initialize(players: Player[], options?: Record<string, unknown>): WordSearchState {
    const gridSize = (options?.gridSize as number) || 10;
    const numWords = (options?.numWords as number) || 8;

    const shuffledWords = shuffle([...WORD_LIST]);
    const selectedWords = shuffledWords.slice(0, numWords);
    const grid = Array(gridSize * gridSize).fill('');

    const wordData: Word[] = [];
    for (const word of selectedWords) {
      const positions = this.placeWord(grid, word, gridSize);
      if (positions.length > 0) {
        wordData.push({ word, found: false, positions });
      }
    }

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === '') {
        grid[i] = letters[Math.floor(Math.random() * letters.length)];
      }
    }

    return {
      gameId: WORD_SEARCH_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      gridSize,
      grid,
      words: wordData,
      foundWords: [],
      selectedCells: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private placeWord(grid: string[], word: string, size: number): number[] {
    const shuffledDirs = shuffle([...this.directions]);

    for (const [dx, dy] of shuffledDirs) {
      const startPositions = shuffle([...Array(size * size).keys()]);

      for (const startIndex of startPositions) {
        const startX = startIndex % size;
        const startY = Math.floor(startIndex / size);
        const positions: number[] = [];
        let valid = true;

        for (let i = 0; i < word.length; i++) {
          const x = startX + i * dx;
          const y = startY + i * dy;

          if (x < 0 || x >= size || y < 0 || y >= size) {
            valid = false;
            break;
          }

          const index = y * size + x;
          if (grid[index] !== '' && grid[index] !== word[i]) {
            valid = false;
            break;
          }

          positions.push(index);
        }

        if (valid && positions.length === word.length) {
          for (const pos of positions) {
            grid[pos] = word[positions.indexOf(pos)];
          }
          return positions;
        }
      }
    }

    return [];
  }

  isValidMove(state: WordSearchState, move: WordSearchMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== 0) return false;

    const wordObj = state.words.find((w) => w.word === move.word);
    if (!wordObj || wordObj.found) return false;

    const positions = wordObj.positions;
    if (!positions.includes(move.start) || !positions.includes(move.end)) {
      return false;
    }

    return true;
  }

  applyMove(state: WordSearchState, move: WordSearchMove): WordSearchState {
    const newState = { ...state, updatedAt: Date.now() };
    newState.words = state.words.map((w) =>
      w.word === move.word ? { ...w, found: true } : w
    );
    newState.foundWords = [...state.foundWords, move.word];

    if (newState.foundWords.length === newState.words.length) {
      newState.status = 'finished';
      newState.winner = 0;
    }

    return newState;
  }

  getLegalMoves(state: WordSearchState): WordSearchMove[] {
    return state.words
      .filter((w) => !w.found && w.positions.length > 0)
      .map((w) => ({
        word: w.word,
        start: w.positions[0],
        end: w.positions[w.positions.length - 1],
      }));
  }

  checkGameOver(state: WordSearchState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: WordSearchState, difficulty: Difficulty): WordSearchMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) return { word: '', start: 0, end: 0 };

    switch (difficulty) {
      case 'easy':
        return getRandomMove(moves);
      case 'medium':
        const sortedByLength = [...moves].sort((a, b) => a.word.length - b.word.length);
        return Math.random() < 0.6 ? sortedByLength[0] : getRandomMove(moves);
      case 'hard':
        return [...moves].sort((a, b) => b.word.length - a.word.length)[0];
      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: WordSearchState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): WordSearchState {
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
