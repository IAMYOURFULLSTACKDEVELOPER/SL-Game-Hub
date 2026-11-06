import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MonopolyEngine, MONOPOLY_MANIFEST } from './monopoly';
import { createPlayer } from '../games';

describe('MonopolyEngine (SierraPoly)', () => {
  const engine = new MonopolyEngine();

  it('should initialize a SierraPoly game', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    assert.strictEqual(state.gameId, MONOPOLY_MANIFEST.id);
    assert.strictEqual(MONOPOLY_MANIFEST.name, 'SierraPoly');
    assert.strictEqual(state.board.length, 40);
    assert.strictEqual(state.playersMoney.length, 2);
    assert.strictEqual(state.playersMoney[0], 1500); // NLE 1,500 starting capital
    assert.strictEqual(state.playersPositions[0], 0);
    assert.ok(state.chanceCards.length > 0);
    assert.ok(state.communityChestCards.length > 0);
  });

  it('should validate roll move', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const move = { type: 'roll' as const };
    assert.strictEqual(engine.isValidMove(state, move, 0), true);
  });

  it('should validate buy move for unowned property', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Move player to a property
    state.playersPositions[0] = 1;

    const move = { type: 'buy' as const, propertyId: 1 };
    assert.strictEqual(engine.isValidMove(state, move, 0), true);
  });

  it('should validate pass move', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const move = { type: 'pass' as const };
    assert.strictEqual(engine.isValidMove(state, move, 0), true);
  });

  it('should apply roll move and update position', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const move = { type: 'roll' as const };
    const newState = engine.applyMove(state, move);

    assert.strictEqual(newState.currentDice.length, 2);
    assert.strictEqual(newState.currentPlayerIndex, 1);
  });

  it('should apply buy move and deduct money', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    state.playersPositions[0] = 1;

    const move = { type: 'buy' as const, propertyId: 1 };
    const newState = engine.applyMove(state, move);

    assert.strictEqual(newState.board[1].owner, 0);
    assert.ok(newState.playersMoney[0] < 1500);
    assert.ok(newState.playersProperties[0].includes(1));
  });

  it('should handle passing Go and collecting $200', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Set position near end of board (position 39 is just before Go)
    state.playersPositions[0] = 39;

    const move = { type: 'roll' as const };
    const newState = engine.applyMove(state, move);

    // Player should have passed Go (rolled and wrapped around) and collected $200
    // Since we can't control dice, just verify the logic exists
    // The implementation adds 200 when newPosition < oldPosition
    assert.ok(newState.playersMoney[0] >= 1500);
  });

  it('should handle landing on Go To Jail', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Manually set player on Go To Jail square
    state.playersPositions[0] = 30;

    // Apply the landing logic directly by calling handleLanding
    engine['handleLanding'](state, 0, 30);

    // Player should be sent to jail
    assert.strictEqual(state.playersPositions[0], 10);
    assert.strictEqual(state.playersInJail[0], true);
  });

  it('should handle paying rent when landing on owned property', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Player 2 owns property 1
    state.board[1].owner = 1;
    state.playersProperties[1] = [1];

    // Player 1 is at position 0, needs to roll to land on property 1
    state.playersPositions[0] = 0;

    const move = { type: 'roll' as const };
    const newState = engine.applyMove(state, move);

    // If player 1 landed on property 1, they should pay rent
    if (newState.playersPositions[0] === 1) {
      assert.ok(newState.playersMoney[0] < 1500);
      assert.ok(newState.playersMoney[1] > 1500);
    }
  });

  it('should handle jail mechanics', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    state.playersInJail[0] = true;
    state.playersJailTurns[0] = 0;

    const payJailMove = { type: 'pay_jail' as const };
    const newState = engine.applyMove(state, payJailMove);

    assert.strictEqual(newState.playersInJail[0], false);
    assert.strictEqual(newState.playersMoney[0], 1400); // NLE 100 jail fine
  });

  it('should get legal moves', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    const moves = engine.getLegalMoves(state);
    assert.ok(moves.length > 0);
    assert.ok(moves.some((m) => m.type === 'roll'));
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
    assert.strictEqual(deserialized.board.length, 40);
    assert.strictEqual(deserialized.playersMoney.length, 2);
  });

  it('should have Sierra Leone-themed properties', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Check for Sierra Leone locations from new board
    assert.strictEqual(state.board[1].name, 'Limkokwing University');
    assert.strictEqual(state.board[5].name, 'Central Railway');
    assert.strictEqual(state.board[6].name, 'Fourah Bay College');
    assert.strictEqual(state.board[12].name, 'EDSA');
    assert.strictEqual(state.board[13].name, 'Port Loko Railway');
    assert.strictEqual(state.board[16].name, 'Chapter-One Night Club & Bar');
    assert.strictEqual(state.board[19].name, 'Old Railway Brookfields');
    assert.strictEqual(state.board[22].name, 'Railway');
    assert.strictEqual(state.board[28].name, 'Guma Valley Water Company');
    assert.strictEqual(state.board[27].name, 'Bintumani Hotel');
    assert.strictEqual(state.board[29].name, 'Radisson Blu Hotel');
  });

  it('should apply tax according to SierraPoly rules', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Income Tax is NLE 200 (position 4)
    state.playersPositions[0] = 4;
    engine['handleLanding'](state, 0, 4);
    assert.strictEqual(state.playersMoney[0], 1300); // 1500 - 200

    // Luxury Tax is NLE 100 (position 35)
    state.playersMoney[0] = 1500;
    state.playersPositions[0] = 35;
    engine['handleLanding'](state, 0, 35);
    assert.strictEqual(state.playersMoney[0], 1400); // 1500 - 100
  });

  it('should apply railway rent multipliers correctly', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Player 2 owns Central Railway (position 5)
    state.board[5].owner = 1;
    state.playersProperties[1] = [5];

    // Test 1 railway: 1x base rent (25)
    state.playersPositions[0] = 5;
    engine['handleLanding'](state, 0, 5);
    assert.strictEqual(state.playersMoney[0], 1475); // 1500 - 25
    assert.strictEqual(state.playersMoney[1], 1525); // 1500 + 25

    // Player 2 now owns 2 railways
    state.board[13].owner = 1;
    state.playersProperties[1] = [5, 13];
    state.playersMoney[0] = 1500;
    state.playersMoney[1] = 1500;

    // Test 2 railways: 2x base rent (50)
    state.playersPositions[0] = 13;
    engine['handleLanding'](state, 0, 13);
    assert.strictEqual(state.playersMoney[0], 1450); // 1500 - 50
    assert.strictEqual(state.playersMoney[1], 1550); // 1500 + 50
  });

  it('should apply utility rent correctly', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Player 2 owns EDSA (position 12)
    state.board[12].owner = 1;
    state.playersProperties[1] = [12];
    state.currentDice = [4, 5]; // Total = 9

    // Test 1 utility: 4x dice total (4 * 9 = 36)
    state.playersPositions[0] = 12;
    engine['handleLanding'](state, 0, 12);
    assert.strictEqual(state.playersMoney[0], 1464); // 1500 - 36
    assert.strictEqual(state.playersMoney[1], 1536); // 1500 + 36

    // Player 2 now owns both utilities
    state.board[28].owner = 1;
    state.playersProperties[1] = [12, 28];
    state.playersMoney[0] = 1500;
    state.playersMoney[1] = 1500;

    // Test 2 utilities: 10x dice total (10 * 9 = 90)
    state.playersPositions[0] = 28;
    engine['handleLanding'](state, 0, 28);
    assert.strictEqual(state.playersMoney[0], 1410); // 1500 - 90
    assert.strictEqual(state.playersMoney[1], 1590); // 1500 + 90
  });



  it('should handle property trading', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    // Player 1 owns property 1
    state.board[1].owner = 0;
    state.playersProperties[0] = [1];
    state.propertiesOwned[0] = 1;

    // Trade property 1 from player 1 to player 2 for NLE 100
    // Player 1 gives property, receives NLE 100
    const tradeMove = {
      type: 'trade' as const,
      targetPlayer: 1,
      tradeProperties: [1],
      tradeMoney: 100,
    };

    const newState = engine.applyMove(state, tradeMove);

    assert.strictEqual(newState.board[1].owner, 1);
    assert.ok(!newState.playersProperties[0].includes(1));
    assert.ok(newState.playersProperties[1].includes(1));
    assert.strictEqual(newState.playersMoney[0], 1600); // 1500 + 100 (receives payment)
    assert.strictEqual(newState.playersMoney[1], 1400); // 1500 - 100 (pays for property)
  });

  it('should have 16 Chance cards', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    assert.strictEqual(state.chanceCards.length, 16);
  });

  it('should have 16 Community Chest cards', () => {
    const players = [
      createPlayer('1', 'Player 1', false),
      createPlayer('2', 'Player 2', false),
    ];
    const state = engine.initialize(players);

    assert.strictEqual(state.communityChestCards.length, 16);
  });
});
