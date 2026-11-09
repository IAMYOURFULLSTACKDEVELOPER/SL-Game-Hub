import type { GameState, GameEngine, Player, Difficulty, GameManifest } from '../types';
import { shuffle } from '../games';

/* ------------------------------------------------------------------ */
/* Board data — follows the SIERRAPOLY board artwork, GO at bottom right */
/* ------------------------------------------------------------------ */

export type SpaceType = 'go' | 'property' | 'railway' | 'utility' | 'chance' | 'community_chest' | 'tax' | 'jail' | 'free_parking' | 'go_to_jail';
export type ColorGroup = 'brown' | 'light_blue' | 'magenta' | 'orange' | 'red' | 'yellow' | 'green' | 'dark_blue';

export interface BoardSpace {
  id: number;
  name: string;
  type: SpaceType;
  group?: ColorGroup;
  price?: number;
  /** [no houses, 1, 2, 3, 4 houses, hotel] */
  rent?: number[];
  houseCost?: number;
  mortgage?: number;
  tax?: number;
}

export const SIERRAPOLY_GROUPS: Record<ColorGroup, { label: string; color: string; spaces: number[] }> = {
  brown: { label: 'Brown', color: '#7a1a0a', spaces: [1, 3] },
  light_blue: { label: 'Light blue', color: '#aeb4dd', spaces: [6, 8, 9] },
  magenta: { label: 'Magenta', color: '#b0005f', spaces: [11, 13, 14] },
  orange: { label: 'Orange', color: '#d95a00', spaces: [16, 18, 19] },
  red: { label: 'Red', color: '#c8102e', spaces: [21, 23, 24] },
  yellow: { label: 'Yellow', color: '#f2d600', spaces: [26, 27, 29] },
  green: { label: 'Green', color: '#0a6b1f', spaces: [31, 32, 34] },
  dark_blue: { label: 'Dark blue', color: '#0b2a80', spaces: [37, 39] },
};

/** Rent schedule by purchase price: [base, 1-4 houses, hotel] and house/hotel cost */
const RENT_TABLE: Record<number, { rent: number[]; house: number }> = {
  60: { rent: [2, 10, 30, 90, 160, 250], house: 50 },
  80: { rent: [4, 20, 60, 180, 320, 450], house: 50 },
  100: { rent: [6, 30, 90, 270, 400, 550], house: 50 },
  120: { rent: [8, 40, 100, 300, 450, 600], house: 50 },
  140: { rent: [10, 50, 150, 450, 625, 750], house: 100 },
  160: { rent: [12, 60, 180, 500, 700, 900], house: 100 },
  180: { rent: [14, 70, 200, 550, 750, 950], house: 100 },
  200: { rent: [16, 80, 220, 600, 800, 1000], house: 100 },
  220: { rent: [18, 90, 250, 700, 875, 1050], house: 150 },
  240: { rent: [20, 100, 300, 750, 925, 1100], house: 150 },
  260: { rent: [22, 110, 330, 800, 975, 1150], house: 150 },
  280: { rent: [24, 120, 360, 850, 1025, 1200], house: 150 },
  300: { rent: [26, 130, 390, 900, 1100, 1275], house: 200 },
  320: { rent: [28, 150, 450, 1000, 1200, 1400], house: 200 },
  350: { rent: [35, 175, 500, 1100, 1300, 1500], house: 200 },
  400: { rent: [50, 200, 600, 1400, 1700, 2000], house: 200 },
};

const prop = (id: number, name: string, group: ColorGroup, price: number): BoardSpace =>
  ({ id, name, type: 'property', group, price, rent: RENT_TABLE[price].rent, houseCost: RENT_TABLE[price].house, mortgage: price / 2 });
const rail = (id: number, name: string): BoardSpace => ({ id, name, type: 'railway', price: 200, mortgage: 100 });
const util = (id: number, name: string): BoardSpace => ({ id, name, type: 'utility', price: 150, mortgage: 75 });

export const SIERRAPOLY_BOARD: BoardSpace[] = [
  { id: 0, name: 'GO', type: 'go' },
  prop(1, 'Victoria Park', 'brown', 60),
  { id: 2, name: 'Community Chest', type: 'community_chest' },
  prop(3, 'Atuga Mini Stadium', 'brown', 80),
  { id: 4, name: 'Income F.C.C. Tax', type: 'tax', tax: 200 },
  rail(5, 'Port Loko Railway'),
  prop(6, 'Siaka Stevens Stadium', 'light_blue', 100),
  { id: 7, name: 'Chance', type: 'chance' },
  prop(8, 'Hill-Valley Academy', 'light_blue', 100),
  prop(9, 'Comahs', 'light_blue', 120),
  { id: 10, name: 'Jail / Just Visiting', type: 'jail' },
  prop(11, 'Fourah Bay College', 'magenta', 140),
  util(12, 'EDSA'),
  prop(13, "St Joseph's Convent", 'magenta', 140),
  prop(14, 'Albert Academy', 'magenta', 160),
  rail(15, 'Central Railway'),
  prop(16, "St John's Church", 'orange', 180),
  { id: 17, name: 'Community Chest', type: 'community_chest' },
  prop(18, 'Lebanese International College', 'orange', 180),
  prop(19, 'Limkokwing University', 'orange', 200),
  { id: 20, name: 'Free Parking', type: 'free_parking' },
  prop(21, 'Modern High School', 'red', 220),
  { id: 22, name: 'Chance', type: 'chance' },
  prop(23, 'Annie Walsh Memorial School', 'red', 220),
  prop(24, 'Naiahcom High School', 'red', 240),
  rail(25, 'Railway'),
  prop(26, 'Gigibonta Beach Bar', 'yellow', 260),
  prop(27, 'Ski Bar', 'yellow', 260),
  util(28, 'Guma Valley Water Company'),
  prop(29, 'Lead Hotel', 'yellow', 280),
  { id: 30, name: 'Go To Jail', type: 'go_to_jail' },
  prop(31, 'RegiManuel Gray Estate', 'green', 300),
  prop(32, 'Bintumani Hotel', 'green', 300),
  { id: 33, name: 'Community Chest', type: 'community_chest' },
  prop(34, 'Radisson Blu Hotel', 'green', 320),
  rail(35, 'Old Railway Brookfields'),
  { id: 36, name: 'Chance', type: 'chance' },
  prop(37, 'LOR Restaurant', 'dark_blue', 350),
  { id: 38, name: 'Luxury F.C.C. Tax', type: 'tax', tax: 100 },
  prop(39, 'Chapter-One Night Club & Bar', 'dark_blue', 400),
];

export const SIERRAPOLY = {
  startingCash: 1500,
  goSalary: 200,
  jailFine: 50,
  jailPosition: 10,
  houses: 32,
  hotels: 12,
  railwayRent: [0, 25, 50, 100, 200],
  utilityMultiplier: [0, 4, 10],
  mortgageInterest: 0.1,
  openingBid: 10,
  banknotes: [1000, 500, 100, 50, 20, 10, 5, 1],
  startingNotes: [[500, 2], [100, 4], [50, 1], [20, 1], [10, 2], [5, 1], [1, 5]] as [number, number][],
} as const;

const RAILWAYS = [5, 15, 25, 35];
const UTILITIES = [12, 28];
const BUYABLE = new Set(SIERRAPOLY_BOARD.filter((s) => s.price).map((s) => s.id));

/* ------------------------------------------------------------------ */
/* Cards                                                              */
/* ------------------------------------------------------------------ */

export interface SierraPolyCard {
  deck: 'chance' | 'community_chest';
  text: string;
  action: 'gain' | 'pay' | 'move_to' | 'move_back' | 'jail' | 'jail_free' | 'nearest_railway' | 'nearest_utility' | 'repairs' | 'pay_each' | 'collect_each';
  amount?: number;
  to?: number;
  perHouse?: number;
  perHotel?: number;
}

export const CHANCE_CARDS: SierraPolyCard[] = [
  { deck: 'chance', text: 'Advance to GO. Collect NLE200.', action: 'move_to', to: 0 },
  { deck: 'chance', text: 'Advance to Chapter-One Night Club & Bar.', action: 'move_to', to: 39 },
  { deck: 'chance', text: 'Advance to Fourah Bay College. If you pass GO, collect NLE200.', action: 'move_to', to: 11 },
  { deck: 'chance', text: 'Take a trip on the Central Railway. If you pass GO, collect NLE200.', action: 'move_to', to: 15 },
  { deck: 'chance', text: 'Advance to Radisson Blu Hotel. If you pass GO, collect NLE200.', action: 'move_to', to: 34 },
  { deck: 'chance', text: 'Advance to Victoria Park. If you pass GO, collect NLE200.', action: 'move_to', to: 1 },
  { deck: 'chance', text: 'Advance to the nearest railway. If owned, pay the owner twice the rent.', action: 'nearest_railway' },
  { deck: 'chance', text: 'Advance to the nearest utility. If owned, pay the owner 10 times the dice total.', action: 'nearest_utility' },
  { deck: 'chance', text: 'The bank pays you a dividend of NLE50.', action: 'gain', amount: 50 },
  { deck: 'chance', text: 'Your building loan matures. Collect NLE150.', action: 'gain', amount: 150 },
  { deck: 'chance', text: 'Get Out of Jail Free. Keep this card until needed or traded.', action: 'jail_free' },
  { deck: 'chance', text: 'Go back 3 spaces.', action: 'move_back', amount: 3 },
  { deck: 'chance', text: 'Go directly to Jail. Do not pass GO, do not collect NLE200.', action: 'jail' },
  { deck: 'chance', text: 'Make general repairs on all your property: NLE25 per house, NLE100 per hotel.', action: 'repairs', perHouse: 25, perHotel: 100 },
  { deck: 'chance', text: 'Okada traffic fine. Pay NLE15.', action: 'pay', amount: 15 },
  { deck: 'chance', text: 'You have been elected chairman of the board. Pay each player NLE50.', action: 'pay_each', amount: 50 },
];

export const COMMUNITY_CHEST_CARDS: SierraPolyCard[] = [
  { deck: 'community_chest', text: 'Advance to GO. Collect NLE200.', action: 'move_to', to: 0 },
  { deck: 'community_chest', text: 'Bank error in your favour. Collect NLE200.', action: 'gain', amount: 200 },
  { deck: 'community_chest', text: 'Doctor’s fees at Connaught Hospital. Pay NLE50.', action: 'pay', amount: 50 },
  { deck: 'community_chest', text: 'From the sale of your cocoa harvest you get NLE50.', action: 'gain', amount: 50 },
  { deck: 'community_chest', text: 'Get Out of Jail Free. Keep this card until needed or traded.', action: 'jail_free' },
  { deck: 'community_chest', text: 'Go directly to Jail. Do not pass GO, do not collect NLE200.', action: 'jail' },
  { deck: 'community_chest', text: 'Your Osusu savings mature. Collect NLE100.', action: 'gain', amount: 100 },
  { deck: 'community_chest', text: 'Income tax refund from the N.R.A. Collect NLE20.', action: 'gain', amount: 20 },
  { deck: 'community_chest', text: 'It is your birthday. Collect NLE10 from every player.', action: 'collect_each', amount: 10 },
  { deck: 'community_chest', text: 'Life insurance matures. Collect NLE100.', action: 'gain', amount: 100 },
  { deck: 'community_chest', text: 'Pay hospital fees of NLE100.', action: 'pay', amount: 100 },
  { deck: 'community_chest', text: 'Pay school fees of NLE50.', action: 'pay', amount: 50 },
  { deck: 'community_chest', text: 'Receive NLE25 consultancy fee.', action: 'gain', amount: 25 },
  { deck: 'community_chest', text: 'You are assessed for street repairs: NLE40 per house, NLE115 per hotel.', action: 'repairs', perHouse: 40, perHotel: 115 },
  { deck: 'community_chest', text: 'You won second prize in the Miss Sierra Leone beauty contest. Collect NLE10.', action: 'gain', amount: 10 },
  { deck: 'community_chest', text: 'You inherit NLE100.', action: 'gain', amount: 100 },
];

/* ------------------------------------------------------------------ */
/* State and moves                                                     */
/* ------------------------------------------------------------------ */

export type SierraPolyPhase = 'roll' | 'jail' | 'buy' | 'auction' | 'debt' | 'end';

export interface SierraPolyDebt { debtor: number; amount: number; creditor: number | null; reason: string }
export interface SierraPolyAuction { space: number; highBid: number; highBidder: number | null; active: number[]; turn: number }
export interface TradeSide { spaces: number[]; cash: number; jailCards: number }

export type MonopolyMove =
  | { type: 'roll'; dice?: [number, number] }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'auction_pass' }
  | { type: 'pay_jail' }
  | { type: 'use_jail_card' }
  | { type: 'build'; space: number }
  | { type: 'sell_building'; space: number }
  | { type: 'mortgage'; space: number }
  | { type: 'unmortgage'; space: number }
  | { type: 'trade'; with: number; give: TradeSide; get: TradeSide }
  | { type: 'pay_debt' }
  | { type: 'bankrupt' }
  | { type: 'end_turn' }
  | { type: 'time_up' };

export interface MonopolyState extends GameState {
  phase: SierraPolyPhase;
  money: number[];
  positions: number[];
  inJail: boolean[];
  jailTurns: number[];
  jailCards: { chance: number; community_chest: number }[];
  bankrupt: boolean[];
  owners: (number | null)[];
  /** 0-4 houses, 5 = hotel */
  buildings: number[];
  mortgaged: boolean[];
  dice: [number, number];
  doublesCount: number;
  extraRoll: boolean;
  pendingBuy: number | null;
  auction: SierraPolyAuction | null;
  auctionQueue: number[];
  debts: SierraPolyDebt[];
  chanceDeck: number[];
  chestDeck: number[];
  lastCard: SierraPolyCard | null;
  log: string[];
  endsAt: number | null;
  netWorths: number[] | null;
}

export const MONOPOLY_MANIFEST: GameManifest = {
  id: 'monopoly',
  name: 'SierraPoly',
  description: 'A property-trading board game inspired by Sierra Leone locations, institutions, businesses, utilities and transportation systems.',
  thumbnail: '🏠',
  minPlayers: 2,
  maxPlayers: 8,
  modes: ['single', 'multi'],
  version: '2.0.0',
};

const nle = (n: number) => `NLE${n.toLocaleString('en-US')}`;
const rollDie = () => Math.floor(Math.random() * 6) + 1;

/** Split an amount into SIERRAPOLY banknotes (largest first) */
export function toBanknotes(amount: number): [number, number][] {
  let rest = Math.max(0, Math.floor(amount));
  return SIERRAPOLY.banknotes.map((n) => { const q = Math.floor(rest / n); rest -= q * n; return [n, q] as [number, number]; }).filter(([, q]) => q > 0);
}

/** Cash + purchase value of properties + buildings − mortgages */
export function netWorth(state: MonopolyState, p: number): number {
  let worth = state.money[p];
  state.owners.forEach((o, i) => {
    if (o !== p) return;
    const s = SIERRAPOLY_BOARD[i];
    worth += s.price! - (state.mortgaged[i] ? s.mortgage! : 0);
    const b = state.buildings[i];
    if (b) worth += (b === 5 ? 5 : b) * s.houseCost!;
  });
  return worth;
}

export const ownsGroup = (state: MonopolyState, p: number, g: ColorGroup) => SIERRAPOLY_GROUPS[g].spaces.every((i) => state.owners[i] === p);
export const housesLeft = (state: MonopolyState) => SIERRAPOLY.houses - state.buildings.reduce((s, b) => s + (b < 5 ? b : 0), 0);
export const hotelsLeft = (state: MonopolyState) => SIERRAPOLY.hotels - state.buildings.filter((b) => b === 5).length;
export const unmortgageCost = (space: number) => SIERRAPOLY_BOARD[space].mortgage! + Math.ceil(SIERRAPOLY_BOARD[space].mortgage! / 10);

/** Whose decision it is right now (debtor, auction bidder or the player whose turn it is) */
export function actor(state: MonopolyState): number {
  if (state.phase === 'debt' && state.debts.length) return state.debts[0].debtor;
  if (state.phase === 'auction' && state.auction) return state.auction.active[state.auction.turn];
  return state.currentPlayerIndex;
}

export function rentFor(state: MonopolyState, space: number, diceTotal: number, doubleRailway = false, utilityTimes?: number): number {
  const s = SIERRAPOLY_BOARD[space];
  const owner = state.owners[space];
  if (owner === null || state.mortgaged[space]) return 0;
  if (s.type === 'railway') {
    const n = RAILWAYS.filter((r) => state.owners[r] === owner).length;
    return SIERRAPOLY.railwayRent[n] * (doubleRailway ? 2 : 1);
  }
  if (s.type === 'utility') {
    const n = UTILITIES.filter((u) => state.owners[u] === owner).length;
    return diceTotal * (utilityTimes ?? SIERRAPOLY.utilityMultiplier[n]);
  }
  const b = state.buildings[space];
  if (b > 0) return s.rent![b];
  return s.rent![0] * (ownsGroup(state, owner, s.group!) ? 2 : 1);
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export class MonopolyEngine implements GameEngine<MonopolyState, MonopolyMove> {
  /** options.minutes: timed game (highest net worth when time runs out) */
  initialize(players: Player[], options?: Record<string, unknown>): MonopolyState {
    const n = players.length;
    const minutes = Number(options?.minutes ?? 0);
    const now = Date.now();
    return {
      gameId: MONOPOLY_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      phase: 'roll',
      money: Array(n).fill(SIERRAPOLY.startingCash),
      positions: Array(n).fill(0),
      inJail: Array(n).fill(false),
      jailTurns: Array(n).fill(0),
      jailCards: Array.from({ length: n }, () => ({ chance: 0, community_chest: 0 })),
      bankrupt: Array(n).fill(false),
      owners: SIERRAPOLY_BOARD.map(() => null),
      buildings: SIERRAPOLY_BOARD.map(() => 0),
      mortgaged: SIERRAPOLY_BOARD.map(() => false),
      dice: [0, 0],
      doublesCount: 0,
      extraRoll: false,
      pendingBuy: null,
      auction: null,
      auctionQueue: [],
      debts: [],
      chanceDeck: shuffle(CHANCE_CARDS.map((_, i) => i)),
      chestDeck: shuffle(COMMUNITY_CHEST_CARDS.map((_, i) => i)),
      lastCard: null,
      log: [`Game started. Each player receives ${nle(SIERRAPOLY.startingCash)}. ${players[0].name} goes first.`],
      endsAt: minutes > 0 ? now + minutes * 60000 : null,
      netWorths: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Why a move is not allowed right now, or null if it is */
  check(state: MonopolyState, move: MonopolyMove, p: number): string | null {
    if (state.status !== 'playing') return 'The game is over.';
    if (move.type === 'time_up') return state.endsAt ? null : 'This is not a timed game.';
    if (p !== actor(state)) return 'It is not your decision right now.';
    const ph = state.phase;
    const cash = state.money[p];
    const manage = ph === 'roll' || ph === 'jail' || ph === 'end' || ph === 'debt';
    switch (move.type) {
      case 'roll': return ph === 'roll' || ph === 'jail' ? null : 'You cannot roll now.';
      case 'buy': return ph !== 'buy' ? 'Nothing to buy.' : cash < SIERRAPOLY_BOARD[state.pendingBuy!].price! ? 'Not enough cash — raise money or decline to auction it.' : null;
      case 'decline': return ph === 'buy' ? null : 'Nothing to decline.';
      case 'bid': {
        if (ph !== 'auction') return 'No auction running.';
        const min = Math.max(SIERRAPOLY.openingBid, state.auction!.highBid + 1);
        if (move.amount < min) return `Bid at least ${nle(min)}.`;
        return move.amount > cash ? 'You cannot bid more than your cash.' : null;
      }
      case 'auction_pass': return ph === 'auction' ? null : 'No auction running.';
      case 'pay_jail': return ph !== 'jail' ? 'You are not in Jail.' : cash < SIERRAPOLY.jailFine ? 'Not enough cash.' : null;
      case 'use_jail_card': return ph !== 'jail' ? 'You are not in Jail.' : state.jailCards[p].chance + state.jailCards[p].community_chest > 0 ? null : 'You have no Get Out of Jail Free card.';
      case 'end_turn': return ph === 'end' ? null : 'Finish your current action first.';
      case 'pay_debt': return ph !== 'debt' ? 'You owe nothing.' : cash < state.debts[0].amount ? 'Not enough cash yet — sell buildings, mortgage or trade.' : null;
      case 'bankrupt': return ph === 'debt' && cash < state.debts[0].amount ? null : 'You can still pay.';
      case 'build': {
        if (!manage) return 'Not now.';
        const s = SIERRAPOLY_BOARD[move.space];
        if (s?.type !== 'property' || state.owners[move.space] !== p) return 'You can only build on your own colour-group properties.';
        const g = SIERRAPOLY_GROUPS[s.group!].spaces;
        if (!ownsGroup(state, p, s.group!)) return 'You must own the complete colour group first.';
        if (g.some((i) => state.mortgaged[i])) return 'Unmortgage every property in the group first.';
        const level = state.buildings[move.space];
        if (level >= 5) return 'Only one hotel per property.';
        if (level > Math.min(...g.map((i) => state.buildings[i]))) return 'Build evenly: every property in the group needs as many houses first.';
        if (cash < s.houseCost!) return 'Not enough cash.';
        if (level === 4 ? hotelsLeft(state) < 1 : housesLeft(state) < 1) return `The Bank has no ${level === 4 ? 'hotels' : 'houses'} left.`;
        return null;
      }
      case 'sell_building': {
        if (!manage) return 'Not now.';
        const s = SIERRAPOLY_BOARD[move.space];
        if (state.owners[move.space] !== p || !state.buildings[move.space]) return 'No buildings to sell there.';
        const g = SIERRAPOLY_GROUPS[s.group!].spaces;
        if (state.buildings[move.space] < Math.max(...g.map((i) => state.buildings[i]))) return 'Sell evenly: start with the most developed property.';
        return null;
      }
      case 'mortgage': {
        if (!manage) return 'Not now.';
        const s = SIERRAPOLY_BOARD[move.space];
        if (state.owners[move.space] !== p || state.mortgaged[move.space]) return 'You cannot mortgage that.';
        if (s.group && SIERRAPOLY_GROUPS[s.group].spaces.some((i) => state.buildings[i] > 0)) return 'Sell all buildings in this colour group first.';
        return null;
      }
      case 'unmortgage':
        if (!manage) return 'Not now.';
        if (state.owners[move.space] !== p || !state.mortgaged[move.space]) return 'That property is not mortgaged.';
        return cash < unmortgageCost(move.space) ? 'Not enough cash.' : null;
      case 'trade': {
        if (!manage) return 'Not now.';
        const o = move.with;
        if (o === p || o < 0 || o >= state.players.length || state.bankrupt[o]) return 'Choose another active player.';
        const sideOk = (side: TradeSide, who: number) =>
          side.cash >= 0 && side.cash <= state.money[who] && side.jailCards <= state.jailCards[who].chance + state.jailCards[who].community_chest
          && side.spaces.every((i) => state.owners[i] === who && !(SIERRAPOLY_BOARD[i].group && SIERRAPOLY_GROUPS[SIERRAPOLY_BOARD[i].group!].spaces.some((j) => state.buildings[j] > 0)));
        if (!sideOk(move.give, p) || !sideOk(move.get, o)) return 'Invalid trade: assets must be owned and free of buildings (sell buildings first).';
        if (!move.give.spaces.length && !move.get.spaces.length && !move.give.jailCards && !move.get.jailCards) return 'A trade must include a property or card.';
        return null;
      }
      default: return 'Unknown move.';
    }
  }

  isValidMove(state: MonopolyState, move: MonopolyMove, playerIndex: number): boolean {
    return this.check(state, move, playerIndex) === null;
  }

  applyMove(state: MonopolyState, move: MonopolyMove): MonopolyState {
    const p = move.type === 'time_up' ? state.currentPlayerIndex : actor(state);
    if (this.check(state, move, p)) return state;
    const s: MonopolyState = JSON.parse(JSON.stringify(state));
    s.updatedAt = Date.now();
    const name = (i: number) => s.players[i].name;
    const log = (t: string) => { s.log.push(t); if (s.log.length > 200) s.log.splice(0, s.log.length - 200); };

    switch (move.type) {
      case 'roll': {
        const dice = move.dice ?? [rollDie(), rollDie()];
        s.dice = dice;
        const total = dice[0] + dice[1];
        const doubles = dice[0] === dice[1];
        s.lastCard = null;
        if (s.phase === 'jail') {
          s.extraRoll = false;
          if (doubles) {
            log(`${name(p)} rolled ${dice[0]} + ${dice[1]} — doubles! Released from Jail.`);
            s.inJail[p] = false; s.jailTurns[p] = 0;
          } else if (++s.jailTurns[p] >= 3) {
            log(`${name(p)} rolled ${dice[0]} + ${dice[1]} — third failed attempt. Pays the ${nle(SIERRAPOLY.jailFine)} fine.`);
            s.inJail[p] = false; s.jailTurns[p] = 0;
            this.pay(s, p, SIERRAPOLY.jailFine, null, 'Jail fine');
          } else {
            log(`${name(p)} rolled ${dice[0]} + ${dice[1]} — no doubles, stays in Jail (attempt ${s.jailTurns[p]} of 3).`);
            s.phase = 'end';
            break;
          }
          s.phase = 'roll';
          this.move(s, p, total);
        } else {
          s.doublesCount = doubles ? s.doublesCount + 1 : 0;
          if (s.doublesCount === 3) {
            log(`${name(p)} rolled doubles three times in a row — go directly to Jail!`);
            this.sendToJail(s, p);
          } else {
            s.extraRoll = doubles;
            log(`${name(p)} rolled ${dice[0]} + ${dice[1]} = ${total}${doubles ? ' (doubles — roll again after this)' : ''}.`);
            this.move(s, p, total);
          }
        }
        break;
      }
      case 'buy': {
        const i = s.pendingBuy!;
        s.money[p] -= SIERRAPOLY_BOARD[i].price!;
        s.owners[i] = p;
        s.pendingBuy = null;
        log(`${name(p)} bought ${SIERRAPOLY_BOARD[i].name} for ${nle(SIERRAPOLY_BOARD[i].price!)}.`);
        break;
      }
      case 'decline': {
        const i = s.pendingBuy!;
        s.pendingBuy = null;
        log(`${name(p)} declined ${SIERRAPOLY_BOARD[i].name}. It goes to auction.`);
        this.startAuction(s, i);
        break;
      }
      case 'bid': {
        const a = s.auction!;
        a.highBid = move.amount; a.highBidder = p;
        log(`${name(p)} bids ${nle(move.amount)}.`);
        this.nextBidder(s);
        break;
      }
      case 'auction_pass': {
        const a = s.auction!;
        log(`${name(p)} drops out of the auction.`);
        a.active.splice(a.turn, 1);
        if (a.turn >= a.active.length) a.turn = 0;
        this.nextBidder(s, false);
        break;
      }
      case 'pay_jail':
        s.money[p] -= SIERRAPOLY.jailFine;
        s.inJail[p] = false; s.jailTurns[p] = 0;
        log(`${name(p)} paid the ${nle(SIERRAPOLY.jailFine)} fine and leaves Jail.`);
        s.phase = 'roll';
        return this.finishAction(s, true);
      case 'use_jail_card': {
        const deck = s.jailCards[p].chance > 0 ? 'chance' : 'community_chest';
        s.jailCards[p][deck]--;
        this.returnJailCard(s, deck);
        s.inJail[p] = false; s.jailTurns[p] = 0;
        log(`${name(p)} used a Get Out of Jail Free card.`);
        s.phase = 'roll';
        return this.finishAction(s, true);
      }
      case 'build': {
        const sp = SIERRAPOLY_BOARD[move.space];
        s.money[p] -= sp.houseCost!;
        s.buildings[move.space]++;
        log(`${name(p)} built ${s.buildings[move.space] === 5 ? 'a hotel' : `house ${s.buildings[move.space]}`} on ${sp.name} for ${nle(sp.houseCost!)}.`);
        return this.finishAction(s, true);
      }
      case 'sell_building': {
        const sp = SIERRAPOLY_BOARD[move.space];
        const half = sp.houseCost! / 2;
        if (s.buildings[move.space] === 5 && housesLeft(s) < 4) {
          s.buildings[move.space] = 0;
          s.money[p] += half * 5;
          log(`${name(p)} sold the hotel on ${sp.name} (the Bank has too few houses to break it down) for ${nle(half * 5)}.`);
        } else {
          s.buildings[move.space]--;
          s.money[p] += half;
          log(`${name(p)} sold a ${s.buildings[move.space] === 4 ? 'hotel (it becomes 4 houses)' : 'house'} on ${sp.name} for ${nle(half)}.`);
        }
        return this.finishAction(s, true);
      }
      case 'mortgage': {
        const sp = SIERRAPOLY_BOARD[move.space];
        s.mortgaged[move.space] = true;
        s.money[p] += sp.mortgage!;
        log(`${name(p)} mortgaged ${sp.name} for ${nle(sp.mortgage!)}.`);
        return this.finishAction(s, true);
      }
      case 'unmortgage': {
        const cost = unmortgageCost(move.space);
        s.mortgaged[move.space] = false;
        s.money[p] -= cost;
        log(`${name(p)} repaid the mortgage on ${SIERRAPOLY_BOARD[move.space].name} (${nle(cost)} incl. 10% interest).`);
        return this.finishAction(s, true);
      }
      case 'trade': {
        const o = move.with;
        const transfer = (side: TradeSide, from: number, to: number) => {
          side.spaces.forEach((i) => { s.owners[i] = to; });
          s.money[from] -= side.cash; s.money[to] += side.cash;
          for (let k = 0; k < side.jailCards; k++) {
            const deck = s.jailCards[from].chance > 0 ? 'chance' : 'community_chest';
            s.jailCards[from][deck]--; s.jailCards[to][deck]++;
          }
        };
        transfer(move.give, p, o);
        transfer(move.get, o, p);
        const describe = (t: TradeSide) => [...t.spaces.map((i) => `${SIERRAPOLY_BOARD[i].name}${s.mortgaged[i] ? ' (mortgaged)' : ''}`), t.cash ? nle(t.cash) : '', t.jailCards ? `${t.jailCards} Jail card(s)` : ''].filter(Boolean).join(', ') || 'nothing';
        log(`Trade: ${name(p)} gave ${describe(move.give)} to ${name(o)} for ${describe(move.get)}.`);
        return this.finishAction(s, true);
      }
      case 'pay_debt': {
        const d = s.debts.shift()!;
        s.money[p] -= d.amount;
        if (d.creditor !== null) s.money[d.creditor] += d.amount;
        log(`${name(p)} paid ${nle(d.amount)} ${d.creditor !== null ? `to ${name(d.creditor)}` : 'to the Bank'} (${d.reason}).`);
        break;
      }
      case 'bankrupt':
        this.declareBankrupt(s, p);
        break;
      case 'end_turn':
        this.nextTurn(s);
        return s;
      case 'time_up':
        return this.finishByNetWorth(s);
    }
    return this.finishAction(s, false);
  }

  /** Resolve what happens next after an action */
  private finishAction(s: MonopolyState, managementOnly: boolean): MonopolyState {
    const alive = s.bankrupt.flatMap((b, i) => (b ? [] : [i]));
    if (alive.length === 1) {
      s.status = 'finished'; s.winner = alive[0]; s.phase = 'end';
      s.log.push(`🏆 ${s.players[alive[0]].name} is the last player standing and wins SIERRAPOLY!`);
      return s;
    }
    if (managementOnly && s.phase !== 'debt') return s;
    s.debts = s.debts.filter((d) => !s.bankrupt[d.debtor]);
    if (s.debts.length) {
      if (s.money[s.debts[0].debtor] >= s.debts[0].amount) {
        // pay automatically when the cash is available
        const d = s.debts.shift()!;
        s.money[d.debtor] -= d.amount;
        if (d.creditor !== null) s.money[d.creditor] += d.amount;
        s.log.push(`${s.players[d.debtor].name} paid ${nle(d.amount)} ${d.creditor !== null ? `to ${s.players[d.creditor].name}` : 'to the Bank'} (${d.reason}).`);
        return this.finishAction(s, false);
      }
      s.phase = 'debt';
      return s;
    }
    if (s.auction) { s.phase = 'auction'; return s; }
    if (s.auctionQueue.length) { this.startAuction(s, s.auctionQueue.shift()!); return this.finishAction(s, false); }
    if (s.pendingBuy !== null) { s.phase = 'buy'; return s; }
    if (s.bankrupt[s.currentPlayerIndex]) { this.nextTurn(s); return s; }
    s.phase = s.extraRoll && !s.inJail[s.currentPlayerIndex] ? 'roll' : 'end';
    return s;
  }

  private nextTurn(s: MonopolyState) {
    const n = s.players.length;
    let i = s.currentPlayerIndex;
    do { i = (i + 1) % n; } while (s.bankrupt[i]);
    s.currentPlayerIndex = i;
    s.doublesCount = 0; s.extraRoll = false; s.lastCard = null;
    s.phase = s.inJail[i] ? 'jail' : 'roll';
    s.log.push(`— ${s.players[i].name}'s turn${s.inJail[i] ? ' (in Jail)' : ''}.`);
  }

  private pay(s: MonopolyState, from: number, amount: number, to: number | null, reason: string) {
    if (amount <= 0) return;
    if (s.debts.length === 0 && s.money[from] >= amount) {
      s.money[from] -= amount;
      if (to !== null) s.money[to] += amount;
      s.log.push(`${s.players[from].name} paid ${nle(amount)} ${to !== null ? `to ${s.players[to].name}` : 'to the Bank'} (${reason}).`);
    } else {
      s.debts.push({ debtor: from, amount, creditor: to, reason });
      s.log.push(`${s.players[from].name} owes ${nle(amount)} ${to !== null ? `to ${s.players[to].name}` : 'to the Bank'} (${reason}).`);
    }
  }

  private sendToJail(s: MonopolyState, p: number) {
    s.positions[p] = SIERRAPOLY.jailPosition;
    s.inJail[p] = true; s.jailTurns[p] = 0;
    s.extraRoll = false; s.doublesCount = 0;
  }

  private advanceTo(s: MonopolyState, p: number, to: number, collectGo = true) {
    const from = s.positions[p];
    if (collectGo && (to < from || to === 0) && from !== to) {
      s.money[p] += SIERRAPOLY.goSalary;
      s.log.push(`${s.players[p].name} ${to === 0 ? 'landed on' : 'passed'} GO and collects ${nle(SIERRAPOLY.goSalary)}.`);
    }
    s.positions[p] = to;
  }

  private move(s: MonopolyState, p: number, steps: number) {
    this.advanceTo(s, p, (s.positions[p] + steps) % 40);
    this.land(s, p);
  }

  private land(s: MonopolyState, p: number, opts: { doubleRailway?: boolean; utilityTimes?: number } = {}) {
    const i = s.positions[p];
    const sp = SIERRAPOLY_BOARD[i];
    const name = s.players[p].name;
    s.log.push(`${name} landed on ${sp.name}.`);
    if (BUYABLE.has(i)) {
      const owner = s.owners[i];
      if (owner === null) s.pendingBuy = i;
      else if (owner !== p) {
        if (s.mortgaged[i]) s.log.push(`${sp.name} is mortgaged — no rent is due.`);
        else this.pay(s, p, rentFor(s, i, s.dice[0] + s.dice[1], opts.doubleRailway, opts.utilityTimes), owner, `rent for ${sp.name}`);
      }
      return;
    }
    switch (sp.type) {
      case 'tax': this.pay(s, p, sp.tax!, null, sp.name); break;
      case 'go_to_jail': s.log.push(`${name} goes directly to Jail!`); this.sendToJail(s, p); break;
      case 'chance': case 'community_chest': this.drawCard(s, p, sp.type); break;
      default: break;
    }
  }

  private drawCard(s: MonopolyState, p: number, deck: 'chance' | 'community_chest') {
    const pile = deck === 'chance' ? s.chanceDeck : s.chestDeck;
    const idx = pile.shift()!;
    const card = (deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS)[idx];
    s.lastCard = card;
    s.log.push(`${deck === 'chance' ? '❓ Chance' : '💰 Community Chest'}: "${card.text}"`);
    if (card.action === 'jail_free') s.jailCards[p][deck]++;
    else pile.push(idx);
    const others = s.players.map((_, i) => i).filter((i) => i !== p && !s.bankrupt[i]);
    switch (card.action) {
      case 'gain': s.money[p] += card.amount!; break;
      case 'pay': this.pay(s, p, card.amount!, null, 'card'); break;
      case 'move_to': this.advanceTo(s, p, card.to!); this.land(s, p); break;
      case 'move_back': s.positions[p] = (s.positions[p] + 40 - card.amount!) % 40; this.land(s, p); break;
      case 'jail': this.sendToJail(s, p); break;
      case 'nearest_railway': case 'nearest_utility': {
        const list = card.action === 'nearest_railway' ? RAILWAYS : UTILITIES;
        const from = s.positions[p];
        const to = list.find((x) => x > from) ?? list[0];
        this.advanceTo(s, p, to);
        this.land(s, p, card.action === 'nearest_railway' ? { doubleRailway: true } : { utilityTimes: 10 });
        break;
      }
      case 'repairs': {
        let houses = 0, hotels = 0;
        s.owners.forEach((o, i) => { if (o === p) { if (s.buildings[i] === 5) hotels++; else houses += s.buildings[i]; } });
        this.pay(s, p, houses * card.perHouse! + hotels * card.perHotel!, null, 'repairs');
        break;
      }
      case 'pay_each': others.forEach((o) => this.pay(s, p, card.amount!, o, 'card')); break;
      case 'collect_each': others.forEach((o) => this.pay(s, o, card.amount!, p, 'card')); break;
      default: break;
    }
  }

  private returnJailCard(s: MonopolyState, deck: 'chance' | 'community_chest') {
    const cards = deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
    (deck === 'chance' ? s.chanceDeck : s.chestDeck).push(cards.findIndex((c) => c.action === 'jail_free'));
  }

  private startAuction(s: MonopolyState, space: number) {
    const active = s.players.map((_, i) => i).filter((i) => !s.bankrupt[i]);
    // bidding starts with the player whose turn it is, then clockwise
    const startAt = Math.max(0, active.indexOf(s.currentPlayerIndex));
    s.auction = { space, highBid: 0, highBidder: null, active, turn: startAt };
    s.phase = 'auction';
    s.log.push(`🔨 Auction for ${SIERRAPOLY_BOARD[space].name} (opening bid ${nle(SIERRAPOLY.openingBid)}).`);
  }

  private nextBidder(s: MonopolyState, advance = true) {
    const a = s.auction!;
    if (a.active.length === 0 || (a.active.length === 1 && a.highBidder === a.active[0])) {
      if (a.highBidder !== null) {
        s.money[a.highBidder] -= a.highBid;
        s.owners[a.space] = a.highBidder;
        s.log.push(`🔨 ${s.players[a.highBidder].name} wins ${SIERRAPOLY_BOARD[a.space].name} for ${nle(a.highBid)}.`);
      } else s.log.push(`No bids — ${SIERRAPOLY_BOARD[a.space].name} stays with the Bank.`);
      s.auction = null;
      return;
    }
    if (advance) a.turn = (a.turn + 1) % a.active.length;
    if (a.active[a.turn] === a.highBidder) a.turn = (a.turn + 1) % a.active.length;
  }

  private declareBankrupt(s: MonopolyState, p: number) {
    const debt = s.debts[0];
    const creditor = debt?.creditor ?? null;
    s.bankrupt[p] = true;
    s.log.push(`💥 ${s.players[p].name} is bankrupt${creditor !== null ? ` to ${s.players[creditor].name}` : ' to the Bank'}!`);
    // Buildings go back to the Bank at half price; the proceeds go to the creditor
    let proceeds = s.money[p];
    s.owners.forEach((o, i) => {
      if (o !== p) return;
      const b = s.buildings[i];
      if (b) proceeds += (b === 5 ? 5 : b) * SIERRAPOLY_BOARD[i].houseCost! / 2;
      s.buildings[i] = 0;
      if (creditor !== null) s.owners[i] = creditor;
      else { s.owners[i] = null; s.mortgaged[i] = false; s.auctionQueue.push(i); }
    });
    s.money[p] = 0;
    if (creditor !== null) {
      s.money[creditor] += proceeds;
      s.jailCards[creditor].chance += s.jailCards[p].chance;
      s.jailCards[creditor].community_chest += s.jailCards[p].community_chest;
    } else {
      for (let k = 0; k < s.jailCards[p].chance; k++) this.returnJailCard(s, 'chance');
      for (let k = 0; k < s.jailCards[p].community_chest; k++) this.returnJailCard(s, 'community_chest');
    }
    s.jailCards[p] = { chance: 0, community_chest: 0 };
    s.inJail[p] = false;
    s.debts = s.debts.filter((d) => d.debtor !== p).map((d) => (d.creditor === p ? { ...d, creditor: null } : d));
    if (s.pendingBuy !== null && s.currentPlayerIndex === p) { s.auctionQueue.unshift(s.pendingBuy); s.pendingBuy = null; }
  }

  private finishByNetWorth(s: MonopolyState): MonopolyState {
    s.netWorths = s.players.map((_, i) => (s.bankrupt[i] ? 0 : netWorth(s, i) - s.debts.filter((d) => d.debtor === i).reduce((a, d) => a + d.amount, 0)));
    const max = Math.max(...s.netWorths);
    const top = s.netWorths.flatMap((w, i) => (w === max && !s.bankrupt[i] ? [i] : []));
    s.status = 'finished';
    s.winner = top.length === 1 ? top[0] : null;
    s.log.push(`⏰ Time is up! ${s.winner !== null ? `${s.players[s.winner].name} wins with a net worth of ${nle(max)}.` : 'It is a tie on net worth.'}`);
    return s;
  }

  getLegalMoves(state: MonopolyState): MonopolyMove[] {
    const p = actor(state);
    const candidates: MonopolyMove[] = [
      { type: 'roll' }, { type: 'buy' }, { type: 'decline' }, { type: 'auction_pass' }, { type: 'pay_jail' }, { type: 'use_jail_card' },
      { type: 'pay_debt' }, { type: 'bankrupt' }, { type: 'end_turn' },
    ];
    if (state.auction) candidates.push({ type: 'bid', amount: Math.max(SIERRAPOLY.openingBid, state.auction.highBid + 10) });
    for (let i = 0; i < 40; i++) {
      if (state.owners[i] !== p) continue;
      candidates.push({ type: 'build', space: i }, { type: 'sell_building', space: i }, { type: 'mortgage', space: i }, { type: 'unmortgage', space: i });
    }
    return candidates.filter((m) => this.isValidMove(state, m, p));
  }

  checkGameOver(state: MonopolyState): { isOver: boolean; winner: number | null } {
    return { isOver: state.status === 'finished', winner: state.winner };
  }

  /** Would a bot accept this trade? (it gives `get` and receives `give`) */
  botAcceptsTrade(state: MonopolyState, move: Extract<MonopolyMove, { type: 'trade' }>): boolean {
    const bot = move.with;
    const proposer = actor(state);
    // value of a side to whoever receives it; completing a colour group is worth much more
    const value = (side: TradeSide, receiver: number) => side.cash + side.jailCards * 50 + side.spaces.reduce((v, i) => {
      const sp = SIERRAPOLY_BOARD[i];
      const worth = sp.price! - (state.mortgaged[i] ? sp.mortgage! : 0);
      const completes = !!sp.group && SIERRAPOLY_GROUPS[sp.group].spaces.every((j) => j === i || state.owners[j] === receiver || side.spaces.includes(j));
      return v + worth * (completes ? 2.5 : 1);
    }, 0);
    return value(move.give, bot) >= value(move.get, proposer) * 1.25 + 20;
  }

  getAIMove(state: MonopolyState, difficulty: Difficulty): MonopolyMove {
    const p = actor(state);
    const cash = state.money[p];
    const reserve = difficulty === 'easy' ? 50 : difficulty === 'medium' ? 120 : 180;
    const ok = (m: MonopolyMove) => this.isValidMove(state, m, p);
    const completes = (space: number) => {
      const g = SIERRAPOLY_BOARD[space].group;
      return !!g && SIERRAPOLY_GROUPS[g].spaces.every((j) => j === space || state.owners[j] === p);
    };

    switch (state.phase) {
      case 'debt': {
        if (ok({ type: 'pay_debt' })) return { type: 'pay_debt' };
        const built = state.owners.map((o, i) => i).filter((i) => state.owners[i] === p && state.buildings[i] > 0)
          .sort((a, b) => state.buildings[b] - state.buildings[a]);
        for (const i of built) if (ok({ type: 'sell_building', space: i })) return { type: 'sell_building', space: i };
        const mort = state.owners.map((o, i) => i).filter((i) => state.owners[i] === p && !state.mortgaged[i])
          .sort((a, b) => SIERRAPOLY_BOARD[a].price! - SIERRAPOLY_BOARD[b].price!);
        for (const i of mort) if (ok({ type: 'mortgage', space: i })) return { type: 'mortgage', space: i };
        return { type: 'bankrupt' };
      }
      case 'buy': {
        const price = SIERRAPOLY_BOARD[state.pendingBuy!].price!;
        const keep = completes(state.pendingBuy!) && difficulty !== 'easy' ? 0 : reserve;
        return cash - price >= keep && ok({ type: 'buy' }) ? { type: 'buy' } : { type: 'decline' };
      }
      case 'auction': {
        const a = state.auction!;
        const price = SIERRAPOLY_BOARD[a.space].price!;
        const factor = difficulty === 'easy' ? 0.6 : difficulty === 'medium' ? 0.85 : completes(a.space) ? 1.4 : 1.05;
        const limit = Math.min(cash - reserve / 2, Math.floor(price * factor));
        const step = price >= 200 ? 20 : 10;
        const bid = Math.max(SIERRAPOLY.openingBid, a.highBid + step);
        return bid <= limit ? { type: 'bid', amount: bid } : { type: 'auction_pass' };
      }
      case 'jail':
        if (ok({ type: 'use_jail_card' })) return { type: 'use_jail_card' };
        {
          const unowned = state.owners.filter((o, i) => o === null && BUYABLE.has(i)).length;
          if (cash > 400 && unowned > 8 && ok({ type: 'pay_jail' })) return { type: 'pay_jail' };
        }
        return { type: 'roll' };
      default: {
        // develop and repair finances before rolling / ending the turn
        if (difficulty !== 'easy') {
          for (let i = 0; i < 40; i++) {
            if (state.mortgaged[i] && state.owners[i] === p && cash - unmortgageCost(i) > reserve * 3 && ok({ type: 'unmortgage', space: i })) return { type: 'unmortgage', space: i };
          }
          const buildable = state.owners.map((o, i) => i).filter((i) => ok({ type: 'build', space: i }))
            .sort((a, b) => state.buildings[a] - state.buildings[b] || SIERRAPOLY_BOARD[b].price! - SIERRAPOLY_BOARD[a].price!);
          const target = buildable.find((i) => cash - SIERRAPOLY_BOARD[i].houseCost! > reserve * 2);
          if (target !== undefined) return { type: 'build', space: target };
        }
        return state.phase === 'end' ? { type: 'end_turn' } : { type: 'roll' };
      }
    }
  }

  serialize(state: MonopolyState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): MonopolyState {
    const parsed = JSON.parse(data) as MonopolyState;
    parsed.players = parsed.players.map((p: Player) => ({ id: p.id, name: p.name, isAI: p.isAI, difficulty: p.difficulty }));
    return parsed;
  }
}
