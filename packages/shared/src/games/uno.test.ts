import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UnoEngine, UNO_MANIFEST } from './uno';
import { createPlayer } from '../games';

describe('UnoEngine', () => {
  const engine = new UnoEngine();

  it('should initialize an UNO game', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    assert.strictEqual(state.gameId, UNO_MANIFEST.id);
    assert.strictEqual(state.playersHands.length, 2);
    assert.strictEqual(state.playersHands[0].length, 7);
    assert.ok(state.deck.length > 0);
    assert.strictEqual(state.discardPile.length, 1);
    assert.strictEqual(state.direction, 1);
  });

  it('should validate card play by color', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const hand = state.playersHands[0];
    const topCard = state.discardPile[0];

    // Find a card matching color
    const matchingCard = hand.find((c) => c.color === topCard.color);
    if (matchingCard) {
      const validMove = { type: 'play' as const, card: matchingCard };
      assert.strictEqual(engine.isValidMove(state, validMove, 0), true);
    }
  });

  it('should validate wild card play', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const hand = state.playersHands[0];
    const wildCard = hand.find((c) => c.color === 'wild');

    if (wildCard) {
      const validMove = {
        type: 'play' as const,
        card: wildCard,
        chosenColor: 'red' as const,
      };
      assert.strictEqual(engine.isValidMove(state, validMove, 0), true);
    }
  });

  it('should validate draw move', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const drawMove = { type: 'draw' as const };
    assert.strictEqual(engine.isValidMove(state, drawMove, 0), true);
  });

  it('should apply play move and switch turn', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const hand = state.playersHands[0];
    const topCard = state.discardPile[0];

    const matchingCard = hand.find((c) => c.color === topCard.color);
    if (matchingCard) {
      const move = { type: 'play' as const, card: matchingCard };
      const newState = engine.applyMove(state, move);

      assert.strictEqual(newState.discardPile[newState.discardPile.length - 1].id, matchingCard.id);
      assert.strictEqual(newState.playersHands[0].length, 6);
      assert.strictEqual(newState.currentPlayerIndex, 1);
    }
  });

  it('should apply draw move', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const move = { type: 'draw' as const };
    const newState = engine.applyMove(state, move);

    assert.strictEqual(newState.playersHands[0].length, 8);
    assert.strictEqual(newState.currentPlayerIndex, 1);
  });

  it('should handle skip card', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Manually set up a skip card
    const skipCard = { color: 'red' as const, type: 'skip' as const, id: 'skip-test' };
    state.playersHands[0] = [skipCard];
    state.discardPile = [{ color: 'red' as const, type: 'number' as const, value: 5, id: 'top-test' }];

    const move = { type: 'play' as const, card: skipCard };
    const newState = engine.applyMove(state, move);

    // In 2-player game, skip should skip opponent and return to player 0
    assert.strictEqual(newState.currentPlayerIndex, 0);
  });

  it('should detect win when hand is empty', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Set up win condition
    state.playersHands[0] = [state.discardPile[0]];
    const card = state.playersHands[0][0];

    const move = { type: 'play' as const, card };
    const newState = engine.applyMove(state, move);

    assert.strictEqual(newState.status, 'finished');
    assert.strictEqual(newState.winner, 0);
  });

  it('should get legal moves', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const moves = engine.getLegalMoves(state);
    assert.ok(moves.length > 0);
    assert.ok(moves.some((m) => m.type === 'draw'));
  });

  it('should serialize and deserialize state', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const serialized = engine.serialize(state);
    const deserialized = engine.deserialize(serialized);

    assert.strictEqual(deserialized.gameId, state.gameId);
    assert.strictEqual(deserialized.playersHands.length, 2);
    assert.strictEqual(deserialized.deck.length, state.deck.length);
  });
});
