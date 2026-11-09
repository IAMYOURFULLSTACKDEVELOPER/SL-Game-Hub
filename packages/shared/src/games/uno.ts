import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** UNO card colors */
export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

/** UNO card types */
export type CardType =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'wild_draw_four';

/** UNO card */
export interface Card {
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for number cards
  id: string; // unique identifier
}

/** UNO move: play a card or draw */
export interface UnoMove {
  type: 'play' | 'draw';
  card?: Card;
  chosenColor?: CardColor; // for wild cards
}

/** UNO game state */
export interface UnoState extends GameState {
  deck: Card[];
  discardPile: Card[];
  playersHands: Card[][];
  currentColor: CardColor;
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  mustDraw: number; // cards the current player must draw
  saidUno: boolean[]; // track if each player said UNO
  currentDrawCount: number; // cards drawn this turn
}

/** UNO game manifest */
export const UNO_MANIFEST: GameManifest = {
  id: 'uno',
  name: 'UNO',
  description: 'Match colors and numbers, use action cards to outsmart your opponents.',
  thumbnail: '🃏',
  minPlayers: 2,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Create UNO deck */
function createDeck(): Card[] {
  const deck: Card[] = [];
  let idCounter = 0;

  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];

  // Number cards (0-9)
  for (const color of colors) {
    // One 0 per color
    deck.push({ color, type: 'number', value: 0, id: `card-${idCounter++}` });

    // Two of each 1-9 per color
    for (let num = 1; num <= 9; num++) {
      deck.push({ color, type: 'number', value: num, id: `card-${idCounter++}` });
      deck.push({ color, type: 'number', value: num, id: `card-${idCounter++}` });
    }
  }

  // Action cards (skip, reverse, draw two)
  for (const color of colors) {
    for (let i = 0; i < 2; i++) {
      deck.push({ color, type: 'skip', id: `card-${idCounter++}` });
      deck.push({ color, type: 'reverse', id: `card-${idCounter++}` });
      deck.push({ color, type: 'draw_two', id: `card-${idCounter++}` });
    }
  }

  // Wild cards (4 of each)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', type: 'wild', id: `card-${idCounter++}` });
    deck.push({ color: 'wild', type: 'wild_draw_four', id: `card-${idCounter++}` });
  }

  return deck;
}

/** UNO game engine */
export class UnoEngine implements GameEngine<UnoState, UnoMove> {
  initialize(players: Player[], options?: Record<string, unknown>): UnoState {
    const deck = createDeck();
    shuffle(deck);

    // Deal 7 cards to each player
    const playersHands: Card[][] = [];
    for (let i = 0; i < players.length; i++) {
      const hand: Card[] = [];
      for (let j = 0; j < 7; j++) {
        hand.push(deck.pop()!);
      }
      playersHands.push(hand);
    }

    // Start discard pile
    let startCard = deck.pop()!;
    while (startCard.color === 'wild') {
      // Don't start with wild card
      deck.unshift(startCard);
      shuffle(deck);
      startCard = deck.pop()!;
    }

    return {
      gameId: UNO_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      deck,
      discardPile: [startCard],
      playersHands,
      currentColor: startCard.color,
      direction: 1,
      mustDraw: 0,
      saidUno: Array(players.length).fill(false),
      currentDrawCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: UnoState, move: UnoMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;

    const hand = state.playersHands[playerIndex];

    if (move.type === 'draw') {
      // Can always draw if no playable card (or choose to draw)
      return true;
    }

    if (move.type === 'play') {
      if (!move.card) return false;

      // Check if player has the card
      const hasCard = hand.some((c) => c.id === move.card!.id);
      if (!hasCard) return false;

      // Check if card matches
      const topCard = state.discardPile[state.discardPile.length - 1];
      return this.canPlayCard(move.card, topCard, state.currentColor);
    }

    return false;
  }

  private canPlayCard(card: Card, topCard: Card, currentColor: CardColor): boolean {
    // Wild cards can always be played
    if (card.color === 'wild') return true;

    // Match color
    if (card.color === currentColor) return true;

    // Match number/symbol
    if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) {
      return true;
    }

    // Match action type
    if (card.type !== 'number' && card.type === topCard.type) {
      return true;
    }

    return false;
  }

  applyMove(state: UnoState, move: UnoMove): UnoState {
    const newState = { ...state, updatedAt: Date.now() };
    newState.deck = [...state.deck];
    newState.discardPile = [...state.discardPile];
    newState.playersHands = state.playersHands.map((h) => [...h]);
    newState.saidUno = [...state.saidUno];

    const playerIndex = state.currentPlayerIndex;
    const hand = newState.playersHands[playerIndex];

    if (move.type === 'draw') {
      // Draw cards
      const drawCount = state.mustDraw > 0 ? state.mustDraw : 1;
      for (let i = 0; i < drawCount && newState.deck.length > 0; i++) {
        hand.push(newState.deck.pop()!);
      }

      newState.mustDraw = 0;
      newState.currentDrawCount += drawCount;

      // If drew due to mustDraw, skip turn
      if (state.mustDraw > 0) {
        this.advanceTurn(newState);
        return newState;
      }

      // Check if drawn card can be played (optional - simplified to always pass)
      this.advanceTurn(newState);
      return newState;
    }

    if (move.type === 'play' && move.card) {
      // Remove card from hand
      const cardIndex = hand.findIndex((c) => c.id === move.card!.id);
      if (cardIndex !== -1) {
        hand.splice(cardIndex, 1);
      }

      // Add to discard pile
      newState.discardPile.push(move.card);

      // Update current color
      if (move.card.color === 'wild' && move.chosenColor) {
        newState.currentColor = move.chosenColor;
      } else if (move.card.color !== 'wild') {
        newState.currentColor = move.card.color;
      }

      // Check for UNO
      if (hand.length === 1) {
        newState.saidUno[playerIndex] = true;
      } else if (hand.length === 0) {
        // Player wins
        newState.status = 'finished';
        newState.winner = playerIndex;
        return newState;
      }

      // Apply card effects
      this.applyCardEffect(newState, move.card);

      // Advance turn
      this.advanceTurn(newState);
    }

    return newState;
  }

  private applyCardEffect(state: UnoState, card: Card): void {
    switch (card.type) {
      case 'skip':
        this.advanceTurn(state);
        break;

      case 'reverse':
        state.direction = state.direction === 1 ? -1 : 1;
        // In 2-player game, reverse acts like skip
        if (state.players.length === 2) {
          this.advanceTurn(state);
        }
        break;

      case 'draw_two':
        state.mustDraw = 2;
        break;

      case 'wild_draw_four':
        state.mustDraw = 4;
        break;

      default:
        break;
    }
  }

  private advanceTurn(state: UnoState): void {
    const playerCount = state.players.length;
    if (state.direction === 1) {
      state.currentPlayerIndex = (state.currentPlayerIndex + 1) % playerCount;
    } else {
      state.currentPlayerIndex = (state.currentPlayerIndex - 1 + playerCount) % playerCount;
    }
  }

  getLegalMoves(state: UnoState): UnoMove[] {
    const moves: UnoMove[] = [];
    const hand = state.playersHands[state.currentPlayerIndex];
    const topCard = state.discardPile[state.discardPile.length - 1];

    // Can always draw
    moves.push({ type: 'draw' });

    // Find playable cards
    for (const card of hand) {
      if (this.canPlayCard(card, topCard, state.currentColor)) {
        if (card.color === 'wild') {
          // For wild cards, add all color choices
          const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
          for (const color of colors) {
            moves.push({ type: 'play', card, chosenColor: color });
          }
        } else {
          moves.push({ type: 'play', card });
        }
      }
    }

    return moves;
  }

  checkGameOver(state: UnoState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: UnoState, difficulty: Difficulty): UnoMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      return { type: 'draw' };
    }

    const playableMoves = moves.filter((m) => m.type === 'play');

    switch (difficulty) {
      case 'easy':
        if (playableMoves.length > 0 && Math.random() < 0.7) {
          return getRandomMove(playableMoves);
        }
        return { type: 'draw' };

      case 'medium':
        // Prefer action cards and save wild cards
        const scoredMoves = playableMoves.map((move) => {
          let score = 0;
          if (move.card) {
            if (move.card.type === 'skip' || move.card.type === 'reverse' || move.card.type === 'draw_two') {
              score += 5;
            }
            if (move.card.color === 'wild') {
              score -= 3; // Save wild cards
            }
            if (move.card.type === 'number') {
              score += move.card.value || 0;
            }
          }
          return { move, score };
        });
        scoredMoves.sort((a, b) => b.score - a.score);

        if (scoredMoves.length > 0 && scoredMoves[0].score > 0) {
          return scoredMoves[0].move;
        }
        return { type: 'draw' };

      case 'hard':
        // Strategic play: use action cards when opponent has few cards
        const hand = state.playersHands[state.currentPlayerIndex];
        const opponentIndex = (state.currentPlayerIndex + state.direction + state.players.length) % state.players.length;
        const opponentHandSize = state.playersHands[opponentIndex].length;

        const strategicMoves = playableMoves.map((move) => {
          let score = 0;
          if (move.card) {
            // Prioritize action cards when opponent has few cards
            if (opponentHandSize <= 3) {
              if (move.card.type === 'draw_two' || move.card.type === 'wild_draw_four') {
                score += 10;
              }
              if (move.card.type === 'skip' || move.card.type === 'reverse') {
                score += 7;
              }
            }

            // Prefer matching color over matching number
            if (move.card.color === state.currentColor && move.card.color !== 'wild') {
              score += 3;
            }

            // Save wild cards for emergencies
            if (move.card.color === 'wild') {
              score -= 5;
              // But use wild draw four if opponent has few cards
              if (opponentHandSize <= 2 && move.card.type === 'wild_draw_four') {
                score += 15;
              }
            }

            // Play high-value number cards
            if (move.card.type === 'number') {
              score += (move.card.value || 0) / 2;
            }
          }
          return { move, score };
        });
        strategicMoves.sort((a, b) => b.score - a.score);

        if (strategicMoves.length > 0 && strategicMoves[0].score > -5) {
          return strategicMoves[0].move;
        }
        return { type: 'draw' };

      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: UnoState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): UnoState {
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
