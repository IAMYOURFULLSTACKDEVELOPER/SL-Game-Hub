import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** Property types */
export type PropertyType = 'property' | 'railroad' | 'utility' | 'chance' | 'community_chest' | 'tax' | 'corner' | 'go_to_jail';

/** Property ownership */
export interface Property {
  id: number;
  name: string;
  type: PropertyType;
  group?: string; // color group for properties
  price?: number;
  rent?: number;
  houseRent?: number[]; // rent with 1-4 houses
  hotelRent?: number;
  houseCost?: number;
  hotelCost?: number;
  owner?: number; // player index
  houses?: number; // 0-4
  hotel?: boolean;
  mortgaged?: boolean;
}

/** Chance and Community Chest cards */
export interface Card {
  type: 'chance' | 'community_chest';
  text: string;
  action: 'gain' | 'lose' | 'move' | 'move_to' | 'jail' | 'jail_free' | 'pay_per_property' | 'collect_from_players' | 'move_nearest_railway' | 'move_nearest_utility' | 'move_nearest_hotel';
  amount?: number;
  position?: number;
  multiplier?: number;
}

/** Monopoly move types */
export interface MonopolyMove {
  type: 'roll' | 'buy' | 'pass' | 'build' | 'mortgage' | 'unmortgage' | 'pay_jail' | 'use_card' | 'auction_bid' | 'trade';
  propertyId?: number;
  houses?: number;
  bidAmount?: number;
  targetPlayer?: number;
  tradeProperties?: number[];
  tradeMoney?: number;
  tradeCard?: boolean;
}

/** Auction state */
export interface AuctionState {
  active: boolean;
  propertyId: number;
  highestBidder: number | null;
  highestBid: number;
  bidders: number[];
  rounds: number;
}

/** Debt tracking for bankruptcy */
export interface Debt {
  playerIndex: number;
  amount: number;
  creditor: number | null; // null = bank, number = player index
}

/** Monopoly game state */
export interface MonopolyState extends GameState {
  board: Property[];
  playersMoney: number[];
  playersPositions: number[];
  playersProperties: number[][]; // property IDs owned by each player
  playersInJail: boolean[];
  playersJailTurns: number[];
  playersGetOutOfJailCards: number[];
  currentDice: number[];
  consecutiveDoubles: number;
  propertiesOwned: number[]; // count per player
  housesBuilt: number;
  hotelsBuilt: number;
  chanceCards: Card[];
  communityChestCards: Card[];
  currentChanceCard: Card | null;
  currentCommunityChestCard: Card | null;
  auction: AuctionState;
  lastRolledDoubles: boolean;
  debts: Debt[];
  bankruptPlayers: number[];
}

/** SierraPoly game manifest */
export const MONOPOLY_MANIFEST: GameManifest = {
  id: 'monopoly',
  name: 'SierraPoly',
  description: 'A property-trading board game inspired by Sierra Leone locations, institutions, businesses, utilities and transportation systems.',
  thumbnail: '🏠',
  minPlayers: 2,
  maxPlayers: 8,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Create SierraPoly board with Sierra Leone locations (new board design) */
function createBoard(): Property[] {
  const board: Property[] = [];

  // GO
  board.push({ id: 0, name: 'GO', type: 'corner' });

  // Limkokwing University (brown)
  board.push({
    id: 1,
    name: 'Limkokwing University',
    type: 'property',
    group: 'brown',
    price: 60,
    rent: 2,
    houseRent: [10, 30, 90, 160],
    hotelRent: 250,
    houseCost: 50,
    hotelCost: 50,
  });

  // Community Chest
  board.push({ id: 2, name: 'Community Chest', type: 'community_chest' });

  // St John's Church (brown)
  board.push({
    id: 3,
    name: 'St John\'s Church',
    type: 'property',
    group: 'brown',
    price: 60,
    rent: 4,
    houseRent: [20, 60, 180, 320],
    hotelRent: 450,
    houseCost: 50,
    hotelCost: 50,
  });

  // Income Tax (NLE 200)
  board.push({ id: 4, name: 'Income Tax', type: 'tax', price: 200 });

  // Central Railway
  board.push({
    id: 5,
    name: 'Central Railway',
    type: 'railroad',
    price: 200,
    rent: 25,
  });

  // Fourah Bay College (light blue)
  board.push({
    id: 6,
    name: 'Fourah Bay College',
    type: 'property',
    group: 'light_blue',
    price: 100,
    rent: 6,
    houseRent: [30, 90, 270, 400],
    hotelRent: 550,
    houseCost: 50,
    hotelCost: 50,
  });

  // Chance
  board.push({ id: 7, name: 'Chance', type: 'chance' });

  // Comahs (light blue)
  board.push({
    id: 8,
    name: 'Comahs',
    type: 'property',
    group: 'light_blue',
    price: 100,
    rent: 6,
    houseRent: [30, 90, 270, 400],
    hotelRent: 550,
    houseCost: 50,
    hotelCost: 50,
  });

  // Hill-Valley Academy (light blue)
  board.push({
    id: 9,
    name: 'Hill-Valley Academy',
    type: 'property',
    group: 'light_blue',
    price: 120,
    rent: 8,
    houseRent: [40, 100, 300, 450],
    hotelRent: 600,
    houseCost: 50,
    hotelCost: 50,
  });

  // Jail (Just Visiting)
  board.push({ id: 10, name: 'Jail / Just Visiting', type: 'corner' });

  // Siaka Stevens Stadium (pink)
  board.push({
    id: 11,
    name: 'Siaka Stevens Stadium',
    type: 'property',
    group: 'pink',
    price: 140,
    rent: 10,
    houseRent: [50, 150, 450, 625],
    hotelRent: 750,
    houseCost: 100,
    hotelCost: 100,
  });

  // EDSA (utility)
  board.push({
    id: 12,
    name: 'EDSA',
    type: 'utility',
    price: 150,
    rent: 0, // special calculation
  });

  // Port Loko Railway
  board.push({
    id: 13,
    name: 'Port Loko Railway',
    type: 'railroad',
    price: 200,
    rent: 25,
  });

  // Atuga Mini Stadium (pink)
  board.push({
    id: 14,
    name: 'Atuga Mini Stadium',
    type: 'property',
    group: 'pink',
    price: 140,
    rent: 10,
    houseRent: [50, 150, 450, 625],
    hotelRent: 750,
    houseCost: 100,
    hotelCost: 100,
  });

  // Victoria Park (pink)
  board.push({
    id: 15,
    name: 'Victoria Park',
    type: 'property',
    group: 'pink',
    price: 160,
    rent: 12,
    houseRent: [60, 180, 500, 700],
    hotelRent: 900,
    houseCost: 100,
    hotelCost: 100,
  });

  // Chapter-One Night Club & Bar (orange)
  board.push({
    id: 16,
    name: 'Chapter-One Night Club & Bar',
    type: 'property',
    group: 'orange',
    price: 180,
    rent: 14,
    houseRent: [70, 200, 550, 750],
    hotelRent: 950,
    houseCost: 100,
    hotelCost: 100,
  });

  // Community Chest
  board.push({ id: 17, name: 'Community Chest', type: 'community_chest' });

  // Lor Restaurant (orange)
  board.push({
    id: 18,
    name: 'Lor Restaurant',
    type: 'property',
    group: 'orange',
    price: 180,
    rent: 14,
    houseRent: [70, 200, 550, 750],
    hotelRent: 950,
    houseCost: 100,
    hotelCost: 100,
  });

  // Old Railway Brookfields
  board.push({
    id: 19,
    name: 'Old Railway Brookfields',
    type: 'railroad',
    price: 200,
    rent: 25,
  });

  // Gigibonta Beach Bar (orange)
  board.push({
    id: 20,
    name: 'Gigibonta Beach Bar',
    type: 'property',
    group: 'orange',
    price: 200,
    rent: 16,
    houseRent: [80, 220, 600, 800],
    hotelRent: 1000,
    houseCost: 100,
    hotelCost: 100,
  });

  // Free Parking (No reward)
  board.push({ id: 21, name: 'Free Parking', type: 'corner' });

  // Railway (red)
  board.push({
    id: 22,
    name: 'Railway',
    type: 'railroad',
    price: 200,
    rent: 25,
  });

  // Chance
  board.push({ id: 23, name: 'Chance', type: 'chance' });

  // Naiahcom High School (red)
  board.push({
    id: 24,
    name: 'Naiahcom High School',
    type: 'property',
    group: 'red',
    price: 220,
    rent: 18,
    houseRent: [90, 250, 700, 875],
    hotelRent: 1050,
    houseCost: 150,
    hotelCost: 150,
  });

  // Annie Walsh Memorial School (red)
  board.push({
    id: 25,
    name: 'Annie Walsh Memorial School',
    type: 'property',
    group: 'red',
    price: 220,
    rent: 18,
    houseRent: [90, 250, 700, 875],
    hotelRent: 1050,
    houseCost: 150,
    hotelCost: 150,
  });

  // Modern High School (yellow)
  board.push({
    id: 26,
    name: 'Modern High School',
    type: 'property',
    group: 'yellow',
    price: 260,
    rent: 22,
    houseRent: [110, 330, 800, 975],
    hotelRent: 1150,
    houseCost: 150,
    hotelCost: 150,
  });

  // Bintumani Hotel (yellow)
  board.push({
    id: 27,
    name: 'Bintumani Hotel',
    type: 'property',
    group: 'yellow',
    price: 260,
    rent: 22,
    houseRent: [110, 330, 800, 975],
    hotelRent: 1150,
    houseCost: 150,
    hotelCost: 150,
  });

  // Guma Valley Water Company (utility)
  board.push({
    id: 28,
    name: 'Guma Valley Water Company',
    type: 'utility',
    price: 150,
    rent: 0,
  });

  // Radisson Blu Hotel (yellow)
  board.push({
    id: 29,
    name: 'Radisson Blu Hotel',
    type: 'property',
    group: 'yellow',
    price: 280,
    rent: 24,
    houseRent: [120, 360, 850, 1025],
    hotelRent: 1200,
    houseCost: 150,
    hotelCost: 150,
  });

  // Go To Jail
  board.push({ id: 30, name: 'Go To Jail', type: 'go_to_jail' });

  // Regimanuel Gray Estate (green)
  board.push({
    id: 31,
    name: 'Regimanuel Gray Estate',
    type: 'property',
    group: 'green',
    price: 300,
    rent: 26,
    houseRent: [130, 390, 900, 1100],
    hotelRent: 1275,
    houseCost: 200,
    hotelCost: 200,
  });

  // Lead Hotel (green)
  board.push({
    id: 32,
    name: 'Lead Hotel',
    type: 'property',
    group: 'green',
    price: 300,
    rent: 26,
    houseRent: [130, 390, 900, 1100],
    hotelRent: 1275,
    houseCost: 200,
    hotelCost: 200,
  });

  // Community Chest
  board.push({ id: 33, name: 'Community Chest', type: 'community_chest' });

  // Ski Bar (green)
  board.push({
    id: 34,
    name: 'Ski Bar',
    type: 'property',
    group: 'green',
    price: 320,
    rent: 28,
    houseRent: [150, 450, 1000, 1200],
    hotelRent: 1400,
    houseCost: 200,
    hotelCost: 200,
  });

  // Luxury Tax (NLE 100)
  board.push({ id: 35, name: 'Luxury Tax', type: 'tax', price: 100 });

  // Chance
  board.push({ id: 36, name: 'Chance', type: 'chance' });

  // (Note: The board image shows some spaces that need to be mapped. 
  // For now, using placeholders for spaces 37-39 based on standard monopoly positions)
  // Placeholder for property 37 (dark blue)
  board.push({
    id: 37,
    name: 'Freetown City Center',
    type: 'property',
    group: 'dark_blue',
    price: 350,
    rent: 35,
    houseRent: [175, 500, 1100, 1300],
    hotelRent: 1500,
    houseCost: 200,
    hotelCost: 200,
  });

  // Placeholder for property 38 (dark blue)
  board.push({
    id: 38,
    name: 'Atlantic Lumley',
    type: 'property',
    group: 'dark_blue',
    price: 400,
    rent: 50,
    houseRent: [200, 600, 1400, 1700],
    hotelRent: 2000,
    houseCost: 200,
    hotelCost: 200,
  });

  // Property 39 (the final space before GO)
  board.push({
    id: 39,
    name: 'Aberdeen Beach',
    type: 'property',
    group: 'dark_blue',
    price: 400,
    rent: 50,
    houseRent: [200, 600, 1400, 1700],
    hotelRent: 2000,
    houseCost: 200,
    hotelCost: 200,
  });

  return board;
}

/** Create Chance cards (16-card deck per rules) */
function createChanceCards(): Card[] {
  return [
    { type: 'chance', text: 'Advance to GO and collect NLE 200', action: 'move_to', position: 0 },
    { type: 'chance', text: 'Collect NLE 150 from the bank', action: 'gain', amount: 150 },
    { type: 'chance', text: 'Collect NLE 100 as a community award', action: 'gain', amount: 100 },
    { type: 'chance', text: 'Pay NLE 50 for vehicle maintenance', action: 'lose', amount: 50 },
    { type: 'chance', text: 'Advance to Chapter-One Night Club & Bar. Pay rent if applicable', action: 'move_to', position: 16 },
    { type: 'chance', text: 'Advance to the nearest railway. Pay double rent if owned', action: 'move_nearest_railway' },
    { type: 'chance', text: 'Advance to the nearest utility. Pay the required utility rent', action: 'move_nearest_utility' },
    { type: 'chance', text: 'Go directly to Jail. Do not collect NLE 200', action: 'jail' },
    { type: 'chance', text: 'Pay NLE 100 for a business licence', action: 'lose', amount: 100 },
    { type: 'chance', text: 'Collect NLE 200 as a financial bonus', action: 'gain', amount: 200 },
    { type: 'chance', text: 'Pay NLE 25 per house and NLE 100 per hotel for repairs', action: 'pay_per_property', multiplier: 25 },
    { type: 'chance', text: 'Advance to the nearest hotel. Pay double rent if owned', action: 'move_nearest_hotel' },
    { type: 'chance', text: 'Collect NLE 75 as a competition prize', action: 'gain', amount: 75 },
    { type: 'chance', text: 'Pay NLE 50 for a traffic violation', action: 'lose', amount: 50 },
    { type: 'chance', text: 'Collect NLE 100 due to a bank error', action: 'gain', amount: 100 },
    { type: 'chance', text: 'Get Out of Jail Free', action: 'jail_free' },
  ];
}

/** Create Community Chest cards (16-card deck per rules) */
function createCommunityChestCards(): Card[] {
  return [
    { type: 'community_chest', text: 'Collect NLE 100 as family support', action: 'gain', amount: 100 },
    { type: 'community_chest', text: 'Pay NLE 50 for medical expenses', action: 'lose', amount: 50 },
    { type: 'community_chest', text: 'Collect NLE 150 from matured savings', action: 'gain', amount: 150 },
    { type: 'community_chest', text: 'Pay NLE 100 for school fees', action: 'lose', amount: 100 },
    { type: 'community_chest', text: 'Collect NLE 200 from a business investment', action: 'gain', amount: 200 },
    { type: 'community_chest', text: 'Pay NLE 75 for electricity bills', action: 'lose', amount: 75 },
    { type: 'community_chest', text: 'Collect NLE 100 from a community lottery', action: 'gain', amount: 100 },
    { type: 'community_chest', text: 'Go directly to Jail', action: 'jail' },
    { type: 'community_chest', text: 'Pay NLE 50 for water bills', action: 'lose', amount: 50 },
    { type: 'community_chest', text: 'Collect NLE 50 from every other active player', action: 'collect_from_players', amount: 50 },
    { type: 'community_chest', text: 'Collect NLE 250 as inheritance', action: 'gain', amount: 250 },
    { type: 'community_chest', text: 'Pay NLE 100 for property maintenance', action: 'lose', amount: 100 },
    { type: 'community_chest', text: 'Collect NLE 200 from the bank', action: 'gain', amount: 200 },
    { type: 'community_chest', text: 'Pay NLE 25 as a community contribution', action: 'lose', amount: 25 },
    { type: 'community_chest', text: 'Advance to GO and collect NLE 200', action: 'move_to', position: 0 },
    { type: 'community_chest', text: 'Get Out of Jail Free', action: 'jail_free' },
  ];
}

/** Monopoly game engine */
export class MonopolyEngine implements GameEngine<MonopolyState, MonopolyMove> {
  initialize(players: Player[], options?: Record<string, unknown>): MonopolyState {
    const board = createBoard();
    const chanceCards = shuffle(createChanceCards());
    const communityChestCards = shuffle(createCommunityChestCards());

    return {
      gameId: MONOPOLY_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      board,
      playersMoney: Array(players.length).fill(1500), // NLE 1,500 starting capital
      playersPositions: Array(players.length).fill(0),
      playersProperties: Array(players.length).fill([]).map(() => []),
      playersInJail: Array(players.length).fill(false),
      playersJailTurns: Array(players.length).fill(0),
      playersGetOutOfJailCards: Array(players.length).fill(0),
      currentDice: [0, 0],
      consecutiveDoubles: 0,
      propertiesOwned: Array(players.length).fill(0),
      housesBuilt: 0,
      hotelsBuilt: 0,
      chanceCards,
      communityChestCards,
      currentChanceCard: null,
      currentCommunityChestCard: null,
      auction: {
        active: false,
        propertyId: 0,
        highestBidder: null,
        highestBid: 0,
        bidders: [],
        rounds: 0,
      },
      lastRolledDoubles: false,
      debts: [],
      bankruptPlayers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: MonopolyState, move: MonopolyMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;

    const playerMoney = state.playersMoney[playerIndex];

    switch (move.type) {
      case 'roll':
        return true;

      case 'buy':
        if (move.propertyId === undefined) return false;
        const property = state.board[move.propertyId];
        if (!property || property.owner !== undefined) return false;
        if (property.price === undefined) return false;
        return playerMoney >= property.price;

      case 'pass':
        return true;

      case 'build':
        if (move.propertyId === undefined || move.houses === undefined) return false;
        const buildProp = state.board[move.propertyId];
        if (!buildProp || buildProp.owner !== playerIndex) return false;
        if (buildProp.type !== 'property') return false;
        if (buildProp.houses === undefined || buildProp.houses >= 4) return false;
        if (buildProp.houseCost === undefined) return false;
        if (playerMoney < buildProp.houseCost) return false;

        // Check for even distribution rule
        if (!this.canBuildHouse(state, playerIndex, move.propertyId, move.houses)) {
          return false;
        }

        // Check if any property in group is mortgaged
        if (buildProp.group) {
          const groupMortgaged = state.board.some(
            (p) => p.group === buildProp.group && p.owner === playerIndex && p.mortgaged
          );
          if (groupMortgaged) return false;
        }

        return true;

      case 'mortgage':
        if (move.propertyId === undefined) return false;
        const mortgageProp = state.board[move.propertyId];
        if (!mortgageProp || mortgageProp.owner !== playerIndex) return false;
        if (mortgageProp.mortgaged) return false;
        if (mortgageProp.houses && mortgageProp.houses > 0) return false;
        return true;

      case 'unmortgage':
        if (move.propertyId === undefined) return false;
        const unmortgageProp = state.board[move.propertyId];
        if (!unmortgageProp || unmortgageProp.owner !== playerIndex) return false;
        if (!unmortgageProp.mortgaged) return false;
        const unmortgageCost = unmortgageProp.price ? Math.floor(unmortgageProp.price * 1.1) : 0;
        return playerMoney >= unmortgageCost;

      case 'pay_jail':
        if (!state.playersInJail[playerIndex]) return false;
        return playerMoney >= 100; // NLE 100 jail fine

      case 'use_card':
        if (!state.playersInJail[playerIndex]) return false;
        return state.playersGetOutOfJailCards[playerIndex] > 0;

      case 'auction_bid':
        if (!state.auction.active) return false;
        if (move.bidAmount === undefined) return false;
        if (move.bidAmount <= state.auction.highestBid) return false;
        return playerMoney >= move.bidAmount;

      case 'trade':
        if (move.targetPlayer === undefined) return false;
        if (move.targetPlayer === playerIndex) return false;
        if (move.targetPlayer >= state.players.length) return false;
        // Trading is always valid (actual agreement is handled by players)
        return true;

      default:
        return false;
    }
  }

  applyMove(state: MonopolyState, move: MonopolyMove): MonopolyState {
    const newState = { ...state, updatedAt: Date.now() };
    newState.board = state.board.map((p) => ({ ...p }));
    newState.playersMoney = [...state.playersMoney];
    newState.playersPositions = [...state.playersPositions];
    newState.playersProperties = state.playersProperties.map((p) => [...p]);
    newState.playersInJail = [...state.playersInJail];
    newState.playersJailTurns = [...state.playersJailTurns];
    newState.playersGetOutOfJailCards = [...state.playersGetOutOfJailCards];
    newState.propertiesOwned = [...state.propertiesOwned];
    newState.auction = { ...state.auction };
    newState.debts = [...state.debts];
    newState.bankruptPlayers = [...state.bankruptPlayers];

    const playerIndex = state.currentPlayerIndex;

    switch (move.type) {
      case 'roll':
        this.handleRoll(newState, playerIndex);
        break;

      case 'buy':
        this.handleBuy(newState, playerIndex, move.propertyId!);
        break;

      case 'pass':
        this.handlePass(newState, playerIndex);
        break;

      case 'build':
        this.handleBuild(newState, playerIndex, move.propertyId!, move.houses!);
        break;

      case 'mortgage':
        this.handleMortgage(newState, playerIndex, move.propertyId!);
        break;

      case 'unmortgage':
        this.handleUnmortgage(newState, playerIndex, move.propertyId!);
        break;

      case 'pay_jail':
        this.handlePayJail(newState, playerIndex);
        break;

      case 'use_card':
        this.handleUseCard(newState, playerIndex);
        break;

      case 'auction_bid':
        this.handleAuctionBid(newState, playerIndex, move.bidAmount!);
        break;

      case 'trade':
        this.handleTrade(newState, playerIndex, move.targetPlayer!, move.tradeProperties, move.tradeMoney, move.tradeCard);
        break;
    }

    // Check for bankruptcy
    this.checkBankruptcy(newState);

    // Switch to next player if not in jail and not in auction
    if (!newState.playersInJail[newState.currentPlayerIndex] || move.type === 'pay_jail' || move.type === 'use_card') {
      if (!newState.auction.active) {
        newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
      }
    }

    return newState;
  }

  private handleRoll(state: MonopolyState, playerIndex: number): void {
    // Roll dice
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    state.currentDice = [dice1, dice2];
    const total = dice1 + dice2;
    state.lastRolledDoubles = dice1 === dice2;

    // Check for doubles
    if (dice1 === dice2) {
      state.consecutiveDoubles++;
      if (state.consecutiveDoubles === 3) {
        // Go to jail (3 consecutive doubles)
        state.playersPositions[playerIndex] = 10;
        state.playersInJail[playerIndex] = true;
        state.playersJailTurns[playerIndex] = 0;
        state.consecutiveDoubles = 0;
        return;
      }
    } else {
      state.consecutiveDoubles = 0;
    }

    // Handle jail
    if (state.playersInJail[playerIndex]) {
      state.playersJailTurns[playerIndex]++;
      if (dice1 === dice2) {
        // Get out of jail on doubles
        state.playersInJail[playerIndex] = false;
        state.playersJailTurns[playerIndex] = 0;
        this.movePlayer(state, playerIndex, total);
        // No extra roll when getting out of jail
        state.consecutiveDoubles = 0;
      } else if (state.playersJailTurns[playerIndex] >= 3) {
        // Must pay to get out after 3 turns
        state.playersMoney[playerIndex] -= 100; // NLE 100 jail fine
        state.playersInJail[playerIndex] = false;
        state.playersJailTurns[playerIndex] = 0;
        this.movePlayer(state, playerIndex, total);
      }
      return;
    }

    // Move player
    this.movePlayer(state, playerIndex, total);
  }

  private movePlayer(state: MonopolyState, playerIndex: number, spaces: number): void {
    const oldPosition = state.playersPositions[playerIndex];
    const newPosition = (oldPosition + spaces) % 40;
    state.playersPositions[playerIndex] = newPosition;

    // Pass Go
    if (newPosition < oldPosition) {
      state.playersMoney[playerIndex] += 200;
    }

    // Handle landing on property
    this.handleLanding(state, playerIndex, newPosition);
  }

  private handleLanding(state: MonopolyState, playerIndex: number, position: number): void {
    const property = state.board[position];

    switch (property.type) {
      case 'property':
      case 'railroad':
      case 'utility':
        if (property.owner === undefined) {
          // Unowned - player can buy or it goes to auction
          // (Buy action handled separately)
        } else if (property.owner !== playerIndex && !property.mortgaged) {
          // Pay rent
          const rent = this.calculateRent(state, property, position);
          state.playersMoney[playerIndex] -= rent;
          state.playersMoney[property.owner] += rent;

          // Track debt if player goes negative
          if (state.playersMoney[playerIndex] < 0) {
            state.debts.push({
              playerIndex,
              amount: Math.abs(state.playersMoney[playerIndex]),
              creditor: property.owner,
            });
          }
        }
        break;

      case 'tax':
        if (property.price) {
          state.playersMoney[playerIndex] -= property.price;
          // Track debt if player goes negative (owed to bank)
          if (state.playersMoney[playerIndex] < 0) {
            state.debts.push({
              playerIndex,
              amount: Math.abs(state.playersMoney[playerIndex]),
              creditor: null, // null = bank
            });
          }
        }
        break;

      case 'go_to_jail':
        state.playersPositions[playerIndex] = 10;
        state.playersInJail[playerIndex] = true;
        state.playersJailTurns[playerIndex] = 0;
        break;

      case 'chance':
        this.handleChanceCard(state, playerIndex);
        break;

      case 'community_chest':
        this.handleCommunityChestCard(state, playerIndex);
        break;

      default:
        break;
    }
  }

  private handleChanceCard(state: MonopolyState, playerIndex: number): void {
    if (state.chanceCards.length === 0) {
      state.chanceCards = shuffle(createChanceCards());
    }
    const card = state.chanceCards.pop()!;
    state.currentChanceCard = card;
    this.applyCard(state, playerIndex, card);
  }

  private handleCommunityChestCard(state: MonopolyState, playerIndex: number): void {
    if (state.communityChestCards.length === 0) {
      state.communityChestCards = shuffle(createCommunityChestCards());
    }
    const card = state.communityChestCards.pop()!;
    state.currentCommunityChestCard = card;
    this.applyCard(state, playerIndex, card);
  }

  private applyCard(state: MonopolyState, playerIndex: number, card: Card): void {
    switch (card.action) {
      case 'gain':
        if (card.amount) {
          state.playersMoney[playerIndex] += card.amount;
        }
        break;

      case 'lose':
        if (card.amount) {
          state.playersMoney[playerIndex] -= card.amount;
          // Track debt if player goes negative (owed to bank)
          if (state.playersMoney[playerIndex] < 0) {
            state.debts.push({
              playerIndex,
              amount: Math.abs(state.playersMoney[playerIndex]),
              creditor: null, // null = bank
            });
          }
        }
        break;

      case 'move':
        if (card.amount) {
          const spaces = card.amount;
          const oldPosition = state.playersPositions[playerIndex];
          const newPosition = (oldPosition + spaces + 40) % 40;
          state.playersPositions[playerIndex] = newPosition;

          // Pass GO
          if (newPosition < oldPosition && spaces > 0) {
            state.playersMoney[playerIndex] += 200;
          }

          this.handleLanding(state, playerIndex, newPosition);
        }
        break;

      case 'move_to':
        if (card.position !== undefined) {
          const oldPosition = state.playersPositions[playerIndex];
          const newPosition = card.position;

          // Check if passing GO
          if (newPosition < oldPosition && card.position !== 0) {
            state.playersMoney[playerIndex] += 200;
          }

          state.playersPositions[playerIndex] = newPosition;
          this.handleLanding(state, playerIndex, newPosition);
        }
        break;

      case 'jail':
        state.playersPositions[playerIndex] = 10;
        state.playersInJail[playerIndex] = true;
        state.playersJailTurns[playerIndex] = 0;
        break;

      case 'jail_free':
        state.playersGetOutOfJailCards[playerIndex]++;
        break;

      case 'pay_per_property':
        if (card.multiplier) {
          let total = 0;
          for (const propId of state.playersProperties[playerIndex]) {
            const prop = state.board[propId];
            if (prop.houses) {
              total += prop.houses * card.multiplier;
            }
            if (prop.hotel) {
              total += card.multiplier * 4;
            }
          }
          state.playersMoney[playerIndex] -= total;
        }
        break;

      case 'collect_from_players':
        if (card.amount) {
          for (let i = 0; i < state.players.length; i++) {
            if (i !== playerIndex) {
              state.playersMoney[i] -= card.amount;
              state.playersMoney[playerIndex] += card.amount;

              // Track debt if other player goes negative
              if (state.playersMoney[i] < 0) {
                state.debts.push({
                  playerIndex: i,
                  amount: Math.abs(state.playersMoney[i]),
                  creditor: playerIndex,
                });
              }
            }
          }
        }
        break;

      case 'move_nearest_railway':
        this.moveToNearest(state, playerIndex, 'railroad');
        break;

      case 'move_nearest_utility':
        this.moveToNearest(state, playerIndex, 'utility');
        break;

      case 'move_nearest_hotel':
        this.moveToNearest(state, playerIndex, 'hotel');
        break;
    }
  }

  private moveToNearest(state: MonopolyState, playerIndex: number, type: 'railroad' | 'utility' | 'hotel'): void {
    const currentPosition = state.playersPositions[playerIndex];
    let nearestPosition = -1;
    let minDistance = 40;

    if (type === 'railroad') {
      // Railway positions: 5, 13, 19, 22
      const railwayPositions = [5, 13, 19, 22];
      for (const pos of railwayPositions) {
        const distance = (pos - currentPosition + 40) % 40;
        if (distance > 0 && distance < minDistance) {
          minDistance = distance;
          nearestPosition = pos;
        }
      }
    } else if (type === 'utility') {
      // Utility positions: 12, 28
      const utilityPositions = [12, 28];
      for (const pos of utilityPositions) {
        const distance = (pos - currentPosition + 40) % 40;
        if (distance > 0 && distance < minDistance) {
          minDistance = distance;
          nearestPosition = pos;
        }
      }
    } else if (type === 'hotel') {
      // Hotel positions (properties with hotels): 27, 29, 34, 37, 38, 39
      const hotelPositions = [27, 29, 34, 37, 38, 39];
      for (const pos of hotelPositions) {
        const distance = (pos - currentPosition + 40) % 40;
        if (distance > 0 && distance < minDistance) {
          minDistance = distance;
          nearestPosition = pos;
        }
      }
    }

    if (nearestPosition !== -1) {
      const oldPosition = state.playersPositions[playerIndex];
      state.playersPositions[playerIndex] = nearestPosition;

      // Pass GO
      if (nearestPosition < oldPosition) {
        state.playersMoney[playerIndex] += 200;
      }

      this.handleLanding(state, playerIndex, nearestPosition);
    }
  }

  private calculateRent(state: MonopolyState, property: Property, position: number): number {
    if (property.mortgaged) return 0;

    if (property.type === 'railroad') {
      const railroadCount = state.board.filter(
        (p) => p.type === 'railroad' && p.owner === property.owner
      ).length;
      // Railway multipliers: 1x, 2x, 4x, 8x
      const multipliers = [1, 2, 4, 8];
      return (property.rent || 25) * multipliers[railroadCount - 1] || 25;
    }

    if (property.type === 'utility') {
      const utilityCount = state.board.filter(
        (p) => p.type === 'utility' && p.owner === property.owner
      ).length;
      const diceTotal = state.currentDice[0] + state.currentDice[1];
      // Utility rent: 4x dice for one, 10x dice for both
      return utilityCount === 1 ? diceTotal * 4 : diceTotal * 10;
    }

    if (property.type === 'property') {
      if (property.hotel) {
        return property.hotelRent || 0;
      }
      if (property.houses && property.houses > 0) {
        return (property.houseRent && property.houseRent[property.houses - 1]) || 0;
      }
      // Check for monopoly (increased rent on undeveloped properties)
      const groupProperties = state.board.filter(
        (p) => p.group === property.group && p.owner === property.owner
      );
      if (groupProperties.length >= this.getGroupSize(property.group)) {
        return (property.rent || 0) * 2;
      }
      return property.rent || 0;
    }

    return 0;
  }

  private getGroupSize(group?: string): number {
    const sizes: Record<string, number> = {
      brown: 2,
      light_blue: 3,
      pink: 3,
      orange: 3,
      red: 3,
      yellow: 3,
      green: 3,
      dark_blue: 2,
    };
    return group ? sizes[group] || 1 : 1;
  }

  private canBuildHouse(state: MonopolyState, playerIndex: number, propertyId: number, targetHouses: number): boolean {
    const property = state.board[propertyId];
    if (!property || !property.group) return true;

    // Get all properties in the group owned by this player
    const groupProperties = state.board.filter(
      (p) => p.group === property.group && p.owner === playerIndex
    );

    // Check if player owns complete group
    if (groupProperties.length < this.getGroupSize(property.group)) {
      return false;
    }

    // Even distribution rule: "A second house cannot be built on one property until every property in that group has at least one"
    // This means the first house can be built on any property
    // For subsequent houses, check even distribution
    if (targetHouses === 1) {
      // First house - always allowed on any property in the group
      return true;
    }

    // For 2nd house and beyond, enforce even distribution
    const minHouses = Math.min(...groupProperties.map((p) => p.houses || 0));
    if (targetHouses > minHouses + 1) {
      return false;
    }

    return true;
  }

  private handleBuy(state: MonopolyState, playerIndex: number, propertyId: number): void {
    const property = state.board[propertyId];
    if (property && property.price) {
      state.playersMoney[playerIndex] -= property.price;
      property.owner = playerIndex;
      state.playersProperties[playerIndex].push(propertyId);
      state.propertiesOwned[playerIndex]++;

      // Track debt if player goes negative (owed to bank)
      if (state.playersMoney[playerIndex] < 0) {
        state.debts.push({
          playerIndex,
          amount: Math.abs(state.playersMoney[playerIndex]),
          creditor: null, // null = bank
        });
      }
    }
  }

  private handlePass(state: MonopolyState, playerIndex: number): void {
    const currentPosition = state.playersPositions[playerIndex];
    const property = state.board[currentPosition];

    // If landing on unowned property and passing, start auction
    if (property && property.owner === undefined && property.price && property.type !== 'corner' && property.type !== 'chance' && property.type !== 'community_chest' && property.type !== 'tax' && property.type !== 'go_to_jail') {
      this.startAuction(state, currentPosition);
    }
  }

  private startAuction(state: MonopolyState, propertyId: number): void {
    state.auction = {
      active: true,
      propertyId,
      highestBidder: null,
      highestBid: 0,
      bidders: state.players.map((_, i) => i),
      rounds: 0,
    };
  }

  private handleAuctionBid(state: MonopolyState, playerIndex: number, bidAmount: number): void {
    state.playersMoney[playerIndex] -= bidAmount;
    state.auction.highestBid = bidAmount;
    state.auction.highestBidder = playerIndex;
    state.auction.rounds++;

    // Check if auction should end (simplified: end after each player has had a chance)
    if (state.auction.rounds >= state.players.length) {
      this.endAuction(state);
    } else {
      // Move to next bidder
      const currentBidderIndex = state.auction.bidders.indexOf(playerIndex);
      state.currentPlayerIndex = state.auction.bidders[(currentBidderIndex + 1) % state.auction.bidders.length];
    }
  }

  private endAuction(state: MonopolyState): void {
    if (state.auction.highestBidder !== null) {
      const property = state.board[state.auction.propertyId];
      property.owner = state.auction.highestBidder;
      state.playersProperties[state.auction.highestBidder].push(state.auction.propertyId);
      state.propertiesOwned[state.auction.highestBidder]++;
    }
    state.auction.active = false;
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  }

  private handleTrade(state: MonopolyState, playerIndex: number, targetPlayer: number, properties?: number[], money?: number, card?: boolean): void {
    // Transfer properties (from current player to target)
    if (properties && properties.length > 0) {
      for (const propId of properties) {
        const property = state.board[propId];
        if (property && property.owner === playerIndex) {
          // Remove from current player
          state.playersProperties[playerIndex] = state.playersProperties[playerIndex].filter((id) => id !== propId);
          state.propertiesOwned[playerIndex]--;

          // Add to target player
          property.owner = targetPlayer;
          state.playersProperties[targetPlayer].push(propId);
          state.propertiesOwned[targetPlayer]++;
        }
      }
    }

    // Transfer money (from target player to current player - receiving payment for properties)
    if (money) {
      state.playersMoney[playerIndex] += money;
      state.playersMoney[targetPlayer] -= money;
    }

    // Transfer Get Out of Jail Free card
    if (card && state.playersGetOutOfJailCards[playerIndex] > 0) {
      state.playersGetOutOfJailCards[playerIndex]--;
      state.playersGetOutOfJailCards[targetPlayer]++;
    }
  }

  private handleBuild(state: MonopolyState, playerIndex: number, propertyId: number, houses: number): void {
    const property = state.board[propertyId];
    if (property && property.houseCost) {
      state.playersMoney[playerIndex] -= property.houseCost;
      property.houses = houses;
      state.housesBuilt++;
    }
  }

  private handleMortgage(state: MonopolyState, playerIndex: number, propertyId: number): void {
    const property = state.board[propertyId];
    if (property && property.price) {
      property.mortgaged = true;
      state.playersMoney[playerIndex] += Math.floor(property.price / 2);
    }
  }

  private handleUnmortgage(state: MonopolyState, playerIndex: number, propertyId: number): void {
    const property = state.board[propertyId];
    if (property && property.price) {
      const cost = Math.floor(property.price * 1.1);
      state.playersMoney[playerIndex] -= cost;
      property.mortgaged = false;
    }
  }

  private handlePayJail(state: MonopolyState, playerIndex: number): void {
    state.playersMoney[playerIndex] -= 100; // NLE 100 jail fine
    state.playersInJail[playerIndex] = false;
    state.playersJailTurns[playerIndex] = 0;
  }

  private handleUseCard(state: MonopolyState, playerIndex: number): void {
    state.playersGetOutOfJailCards[playerIndex]--;
    state.playersInJail[playerIndex] = false;
    state.playersJailTurns[playerIndex] = 0;
  }

  private checkBankruptcy(state: MonopolyState): void {
    for (let i = 0; i < state.players.length; i++) {
      if (state.playersMoney[i] < 0 && !state.bankruptPlayers.includes(i)) {
        // Player is bankrupt
        state.bankruptPlayers.push(i);

        // Find if debt is owed to a player or bank
        const debt = state.debts.find((d) => d.playerIndex === i);
        const creditor = debt?.creditor ?? null;

        if (creditor !== null) {
          // Debt owed to another player - transfer assets to creditor
          for (const propId of state.playersProperties[i]) {
            const property = state.board[propId];
            if (property.mortgaged) {
              // Creditor must pay 10% interest to unmortgage
              const unmortgageCost = Math.floor((property.price || 0) * 1.1);
              state.playersMoney[creditor] -= unmortgageCost;
              property.mortgaged = false;
            }
            property.owner = creditor;
            state.playersProperties[creditor].push(propId);
            state.propertiesOwned[creditor]++;
          }

          // Transfer Get Out of Jail Free cards
          state.playersGetOutOfJailCards[creditor] += state.playersGetOutOfJailCards[i];
          state.playersGetOutOfJailCards[i] = 0;
        } else {
          // Debt owed to bank - bank takes properties and auctions them
          for (const propId of state.playersProperties[i]) {
            state.board[propId].owner = undefined;
            state.board[propId].houses = 0;
            state.board[propId].hotel = false;
            state.board[propId].mortgaged = false;
          }
          state.playersProperties[i] = [];
          state.propertiesOwned[i] = 0;
        }

        // Clear player's money and properties
        state.playersMoney[i] = 0;
        state.playersProperties[i] = [];
        state.propertiesOwned[i] = 0;
      }
    }

    // Check if only one player remains (winning condition: last solvent player)
    const activePlayers = state.players.filter((_, i) => !state.bankruptPlayers.includes(i));
    if (activePlayers.length === 1) {
      state.status = 'finished';
      state.winner = state.players.findIndex((_, i) => !state.bankruptPlayers.includes(i));
    }
  }

  getLegalMoves(state: MonopolyState): MonopolyMove[] {
    const moves: MonopolyMove[] = [];
    const playerIndex = state.currentPlayerIndex;
    const currentPosition = state.playersPositions[playerIndex];
    const currentProperty = state.board[currentPosition];

    // Auction state
    if (state.auction.active) {
      const minBid = state.auction.highestBid + 1;
      if (state.playersMoney[playerIndex] >= minBid) {
        moves.push({ type: 'auction_bid', bidAmount: minBid });
        moves.push({ type: 'auction_bid', bidAmount: minBid + 50 });
        moves.push({ type: 'auction_bid', bidAmount: minBid + 100 });
      }
      return moves;
    }

    // Can always roll
    moves.push({ type: 'roll' });

    // Can buy unowned property
    if (currentProperty && currentProperty.owner === undefined && currentProperty.price) {
      if (state.playersMoney[playerIndex] >= currentProperty.price) {
        moves.push({ type: 'buy', propertyId: currentPosition });
      }
    }

    // Can pass
    moves.push({ type: 'pass' });

    // Jail options
    if (state.playersInJail[playerIndex]) {
      if (state.playersMoney[playerIndex] >= 100) {
        moves.push({ type: 'pay_jail' });
      }
      if (state.playersGetOutOfJailCards[playerIndex] > 0) {
        moves.push({ type: 'use_card' });
      }
    }

    // Build houses on owned properties
    for (const propId of state.playersProperties[playerIndex]) {
      const property = state.board[propId];
      if (property && property.type === 'property' && property.houseCost) {
        const currentHouses = property.houses || 0;
        if (currentHouses < 4 && state.playersMoney[playerIndex] >= property.houseCost) {
          moves.push({ type: 'build', propertyId: propId, houses: currentHouses + 1 });
        }
      }
    }

    // Mortgage properties
    for (const propId of state.playersProperties[playerIndex]) {
      const property = state.board[propId];
      if (property && !property.mortgaged && (!property.houses || property.houses === 0)) {
        moves.push({ type: 'mortgage', propertyId: propId });
      }
    }

    // Unmortgage properties
    for (const propId of state.playersProperties[playerIndex]) {
      const property = state.board[propId];
      if (property && property.mortgaged && property.price) {
        const cost = Math.floor(property.price * 1.1);
        if (state.playersMoney[playerIndex] >= cost) {
          moves.push({ type: 'unmortgage', propertyId: propId });
        }
      }
    }

    return moves;
  }

  checkGameOver(state: MonopolyState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: MonopolyState, difficulty: Difficulty): MonopolyMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      return { type: 'pass' };
    }

    // Handle auction
    if (state.auction.active) {
      const bidMoves = moves.filter((m) => m.type === 'auction_bid');
      if (bidMoves.length > 0) {
        const property = state.board[state.auction.propertyId];
        const propertyValue = property.price || 0;

        switch (difficulty) {
          case 'easy':
            // Random bid or pass
            if (Math.random() < 0.5) {
              return getRandomMove(bidMoves);
            }
            return { type: 'pass' };

          case 'medium':
            // Bid up to property value
            const mediumBid = bidMoves.find((m) => m.bidAmount && m.bidAmount <= propertyValue);
            if (mediumBid && Math.random() < 0.7) {
              return mediumBid;
            }
            return { type: 'pass' };

          case 'hard':
            // Strategic bidding
            const hardBid = bidMoves.find((m) => m.bidAmount && m.bidAmount <= propertyValue * 1.2);
            if (hardBid) {
              return hardBid;
            }
            return { type: 'pass' };

          default:
            return getRandomMove(bidMoves);
        }
      }
      return { type: 'pass' };
    }

    switch (difficulty) {
      case 'easy':
        return getRandomMove(moves);

      case 'medium':
        // Prefer buying properties and building
        const buyMoves = moves.filter((m) => m.type === 'buy');
        const buildMoves = moves.filter((m) => m.type === 'build');
        if (buyMoves.length > 0 && Math.random() < 0.8) {
          return getRandomMove(buyMoves);
        }
        if (buildMoves.length > 0 && Math.random() < 0.6) {
          return getRandomMove(buildMoves);
        }
        return getRandomMove(moves);

      case 'hard':
        // Strategic AI
        const scoredMoves = moves.map((move) => {
          let score = 0;

          if (move.type === 'buy') {
            const property = state.board[move.propertyId!];
            if (property && property.price) {
              // Prefer higher value properties
              score += property.price / 10;
              // Prefer completing color groups
              const groupProperties = state.board.filter(
                (p) => p.group === property.group && p.owner === state.currentPlayerIndex
              ).length;
              score += groupProperties * 20;
            }
          }

          if (move.type === 'build') {
            // Prefer building on properties with high rent
            const property = state.board[move.propertyId!];
            if (property && property.hotelRent) {
              score += property.hotelRent / 10;
            }
          }

          if (move.type === 'mortgage') {
            // Only mortgage if low on money
            if (state.playersMoney[state.currentPlayerIndex] < 200) {
              score += 10;
            } else {
              score -= 20;
            }
          }

          // Always get out of jail
          if (move.type === 'pay_jail' || move.type === 'use_card') {
            score += 50;
          }

          return { move, score };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        return scoredMoves[0].move;

      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: MonopolyState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): MonopolyState {
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
