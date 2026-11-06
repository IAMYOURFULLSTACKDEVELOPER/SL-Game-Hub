import { registerGame } from '../games';
import { SnakeEngine, SNAKE_MANIFEST } from './snake';
import { SnakeAndLadderEngine, SNAKE_AND_LADDER_MANIFEST } from './snake-and-ladder';
import { CheckersEngine, CHECKERS_MANIFEST } from './checkers';
import { WordSearchEngine, WORD_SEARCH_MANIFEST } from './word-search';
import { ChessEngine, CHESS_MANIFEST } from './chess';
import { ScrabbleEngine, SCRABBLE_MANIFEST } from './scrabble';
import { UnoEngine, UNO_MANIFEST } from './uno';
import { MonopolyEngine, MONOPOLY_MANIFEST } from './monopoly';
import { DiceEngine, DICE_MANIFEST } from './dice';

// Register Snake game
registerGame({
  manifest: SNAKE_MANIFEST,
  engine: new SnakeEngine(),
});

// Register Snake & Ladder game
registerGame({
  manifest: SNAKE_AND_LADDER_MANIFEST,
  engine: new SnakeAndLadderEngine(),
});

// Register Checkers game
registerGame({
  manifest: CHECKERS_MANIFEST,
  engine: new CheckersEngine(),
});

// Register Word Search game
registerGame({
  manifest: WORD_SEARCH_MANIFEST,
  engine: new WordSearchEngine(),
});

// Register Chess game
registerGame({
  manifest: CHESS_MANIFEST,
  engine: new ChessEngine(),
});

// Register Scrabble game
registerGame({
  manifest: SCRABBLE_MANIFEST,
  engine: new ScrabbleEngine(),
});

// Register UNO game
registerGame({
  manifest: UNO_MANIFEST,
  engine: new UnoEngine(),
});

// Register Monopoly game
registerGame({
  manifest: MONOPOLY_MANIFEST,
  engine: new MonopolyEngine(),
});

// Register Dice game
registerGame({
  manifest: DICE_MANIFEST,
  engine: new DiceEngine(),
});
