import type { RuleSection } from '../rulebook';
import { SIERRAPOLY_BOARD, SIERRAPOLY_GROUPS } from './monopoly';

const nle = (n: number) => `NLE${n.toLocaleString('en-US')}`;
const buyable = SIERRAPOLY_BOARD.filter((s) => s.price);
const groupNames = (Object.keys(SIERRAPOLY_GROUPS) as (keyof typeof SIERRAPOLY_GROUPS)[])
  .map((g) => `${SIERRAPOLY_GROUPS[g].label} group: ${SIERRAPOLY_GROUPS[g].spaces.map((i) => SIERRAPOLY_BOARD[i].name).join(', ')}`);

export const SIERRAPOLY_RULES: RuleSection[] = [
  { title: 'Introduction', intro: 'Welcome to SIERRAPOLY, a property-trading board game inspired by Monopoly and designed around Sierra Leonean locations, institutions, entertainment destinations, hotels, railways and businesses. Players move around the board purchasing properties, collecting rent, developing buildings, trading assets and managing their finances using Sierra Leonean Leone (NLE) banknotes. The game combines strategy, negotiation, financial management and luck. Every decision matters: purchasing a property can create a profitable investment, while poor financial decisions can lead to bankruptcy.' },
  { title: 'Objective of the game', intro: 'The main objective is to become the wealthiest player by acquiring properties, developing them, collecting rent and managing your money effectively. A player wins by being the last financially surviving player when all other players have gone bankrupt. Alternatively, players can agree to a timed game. When the agreed time expires, the player with the highest total net worth wins. Net worth includes:', rules: [
    'Cash currently held.', 'Purchase value of owned properties.', 'Value of houses and hotels.', 'Other eligible assets, minus outstanding debts and mortgages.',
  ] },
  { title: 'Game components', steps: [
    'Game board — properties, railways, utilities, Chance, Community Chest, tax spaces, Free Parking, Jail and GO.',
    'SIERRAPOLY banknotes — eight denominations: NLE1, NLE5, NLE10, NLE20, NLE50, NLE100, NLE500 and NLE1,000.',
    'Dice and player tokens — two six-sided dice and one playing token for every participant.',
    'Property deeds and buildings — property ownership cards, houses and hotels used to develop properties and increase rent.',
    'Chance and Community Chest cards — two separate decks containing instructions, rewards, penalties and special movements.',
  ] },
  { title: 'Number of players', rules: ['Minimum: 2 players.', 'Recommended: 3–6 players.', 'Maximum: 8 players.', 'One participant acts as the Banker (on SL Game Hub the game is the Banker and keeps personal funds separate from bank funds).'] },
  { title: 'Preparing the game', steps: [
    'Place the SIERRAPOLY board on a flat playing surface.',
    'Separate the Chance and Community Chest cards, shuffle each deck and place them face down on their designated spaces.',
    'Select a Banker.',
    'Give each player a playing token.',
    'Place all tokens on the GO space.',
    'Give each player their starting capital of NLE1,500.',
    'Place the remaining money, property deeds, houses and hotels with the Banker.',
    'Decide who starts first.',
  ], tables: [{ caption: 'Starting capital distribution (NLE1,500 per player)', head: ['Banknote', 'Quantity', 'Total'], rows: [
    ['NLE500', '2', 'NLE1,000'], ['NLE100', '4', 'NLE400'], ['NLE50', '1', 'NLE50'], ['NLE20', '1', 'NLE20'], ['NLE10', '2', 'NLE20'], ['NLE5', '1', 'NLE5'], ['NLE1', '5', 'NLE5'], ['Total', '16', 'NLE1,500'],
  ] }], note: 'The NLE1,000 banknote is available for transactions but is not included in the starting distribution.' },
  { title: 'How to play', intro: 'Players take turns in a clockwise direction, beginning with the player selected to go first. During your turn:', steps: [
    'Roll both dice.', 'Move your token forward according to the combined dice total.', 'Identify the space where your token lands.',
    'Follow the instructions associated with that space.', 'Complete any purchase, payment, collection or card instruction.',
    'End your turn unless you rolled doubles and are entitled to another turn.',
  ], rules: [
    'Rolling doubles: move according to the total of both dice, complete the action of your landing space, then you may roll again.',
    'If you roll doubles three consecutive times during one turn, you must immediately go to Jail. You do not complete the movement associated with the third roll.',
    'Players move in the direction indicated by the board layout, following the spaces in sequence.',
    'If a player passes GO, the player collects NLE200 from the Bank. If a player lands directly on GO, the player also collects NLE200. A player does not receive additional GO money simply for remaining on the GO space.',
  ] },
  { title: 'Property ownership and purchasing', rules: [
    'Purchasing: when you land on an unowned property you may buy it at the price printed on the board. The Banker confirms it is unowned, you pay the Bank, and you receive the deed. Example: Victoria Park costs NLE60.',
    'Refusing to purchase: the property must immediately be auctioned. All players — including the player who declined — may bid. The opening bid is NLE10; players raise their bids or drop out, and the highest bidder wins and pays the Bank immediately. The winner does not have to be the player who landed on it.',
    'Landing on another player’s property: you must pay rent as shown on the deed. Rent depends on whether the property is undeveloped, whether the owner owns the complete colour group, the number of houses, whether a hotel has been built, and whether it is mortgaged.',
    'If the property is mortgaged, no rent is collected.',
    'Every deed shows the property name, purchase price, base rent, rent with a complete colour group, rent with one to four houses, rent with a hotel, mortgage value and house/hotel construction price.',
  ] },
  { title: 'Property groups and development', intro: 'SIERRAPOLY properties are divided into colour groups. Owning every property of a group gives a monopoly: rent on undeveloped properties in that group is doubled, and you may build houses and then hotels.', rules: [
    ...groupNames,
    'A mortgaged property does not count towards the complete-group development requirement — unmortgage it before building.',
    'Houses: you must own every property in the group. Houses must be built evenly — no second house on a property until every property in the group has one, and so on. Pay the construction cost to the Bank. Houses may be purchased only when the Bank has buildings available.',
    'Hotels: a property with four houses (and the group built evenly to four) may be upgraded. The four houses are returned to the Bank, you pay the hotel price and receive one hotel. Only one hotel per property.',
    'Building shortages: the Bank has 32 houses and 12 hotels. If it runs out, players must wait until buildings become available.',
  ] },
  { title: 'Railway properties', intro: 'The board has four railways, each costing NLE200: Port Loko Railway, Central Railway, Railway (upper side) and Old Railway Brookfields. Owning more railways increases the rent.', tables: [{ head: ['Railways owned', 'Rent'], rows: [['1', 'NLE25'], ['2', 'NLE50'], ['3', 'NLE100'], ['4', 'NLE200']] }] },
  { title: 'Utility properties', intro: 'There are two utilities, each costing NLE150: EDSA (electricity) and Guma Valley Water Company (water). Rent is calculated from the dice roll.', tables: [{ head: ['Utilities owned', 'Rent'], rows: [['1 utility', '4 × the dice total'], ['2 utilities', '10 × the dice total']] }], note: 'Example: a player rolls 8 and lands on an opponent’s utility. With one utility the rent is NLE32; with both it is NLE80.' },
  { title: 'Special board spaces', rules: [
    'GO — every time a player passes or lands directly on GO, the player receives NLE200 from the Bank.',
    'Jail / Just Visiting — landing here through normal movement means you are just visiting. No penalty applies.',
    'Going to Jail — when you land on Go To Jail, draw a card telling you to go to Jail, or roll doubles three times in one turn: move directly to Jail, do not collect NLE200 for passing GO, and your turn ends immediately.',
    'Getting out of Jail — (1) pay the NLE50 fine before rolling on your turn; (2) try to roll doubles on each of your next three turns: if you do, move that number of spaces (no extra roll for those doubles); if you fail after three attempts, pay NLE50 and move according to your third roll; or (3) use a Get Out of Jail Free card.',
    'A player in Jail may still collect rent, trade properties, buy houses and hotels, and take part in auctions.',
    'Free Parking — no payment is required and no penalty applies. (House rule, not used here: collecting taxes and fines on Free Parking.)',
    'Chance — draw the top Chance card and follow its instructions, then return it to the bottom of the deck unless you are told to keep it.',
    'Community Chest — draw the top card and follow its instructions. Cards may award money, demand payments, or move you to another location.',
    'Income F.C.C. Tax — pay NLE200 to the Bank.',
    'Luxury F.C.C. Tax — pay NLE100 to the Bank.',
  ] },
  { title: 'Chance and Community Chest card rules', intro: 'Both decks are kept separate. A card can instruct a player to collect money from the Bank, pay the Bank, pay another player, receive money from other players, move forward or backward, move to a named property, go directly to Jail, keep a Get Out of Jail Free card, or pay maintenance or development fees.', rules: [
    'If a card moves you to another property, follow it and complete the action of the destination.',
    'If the card makes you pass GO, you collect NLE200 unless the card says otherwise.',
  ] },
  { title: 'Property trading between players', intro: 'Players may negotiate and trade at any time. A trade may involve one property for another, several properties for one, cash for a property, properties plus cash, or other agreed combinations (including Get Out of Jail Free cards).', steps: [
    'Both players must voluntarily agree.', 'The Banker must be informed (the game records every trade in the log).', 'All agreed payments must be completed.',
    'Property deeds are transferred to the new owners.', 'Mortgaged properties must be clearly identified.', 'A player cannot trade away an asset they do not own.',
  ], note: 'Properties in a colour group that still has buildings cannot be traded — sell the buildings first.' },
  { title: 'Mortgaging properties', rules: [
    'You may mortgage an eligible property to receive its mortgage value (half the purchase price) from the Bank.',
    'The property (and its colour group) must be free of houses and hotels — sell buildings back to the Bank first.',
    'A mortgaged property cannot collect rent. The deed stays with its owner.',
    'To unmortgage, repay the mortgage plus 10% interest. Example: mortgage NLE100 + interest NLE10 = NLE110.',
  ] },
  { title: 'Selling houses and hotels', rules: [
    'The Bank buys buildings back at half their construction price.',
    'Buildings must be sold evenly across the colour group, the same way they were built.',
    'A hotel is converted back into four houses when it is sold (if the Bank has four houses available); otherwise the whole hotel is sold.',
  ] },
  { title: 'Bankruptcy', intro: 'A player is bankrupt when they owe more than they can pay and cannot raise enough funds. First try to sell houses and hotels, mortgage properties, negotiate trades and use available cash.', rules: [
    'Bankruptcy to another player: remaining cash and assets (properties keep their mortgage status; buildings are sold to the Bank and the proceeds go to the creditor) are transferred to the creditor. The bankrupt player leaves the game.',
    'Bankruptcy to the Bank: remaining assets return to the Bank, which auctions the properties to the remaining players. The bankrupt player leaves the game.',
  ] },
  { title: 'Winning the game', rules: [
    'Method A — Last player standing: the game continues until all players except one are bankrupt.',
    'Method B — Timed competition: agree a time limit before starting. When time expires: stop, settle debts, value properties and buildings, count cash, deduct mortgages and liabilities. The highest net worth wins.',
  ] },
  { title: 'Additional rules and fair play', steps: [
    'Players must not move another player’s token.', 'Players must not take money from the Bank without authorization.',
    'All rent and tax payments must be completed immediately.', 'Players must not hide property ownership or outstanding debts.',
    'Players must not interfere with dice rolls.', 'All trades must be voluntary.', 'The Banker must maintain accurate financial records.',
    'Players must follow Chance and Community Chest instructions.', 'Players must not build houses or hotels without meeting the development requirements.',
    'Disputes should be resolved by referring to this rulebook.',
  ] },
  { title: 'Quick reference: board spaces and deeds', tables: [
    { head: ['Board space', 'Price', 'Rent (base / group)', '1-4 houses', 'Hotel', 'House cost', 'Mortgage'], rows: buyable.map((s) => s.type === 'property'
      ? [s.name, nle(s.price!), `${nle(s.rent![0])} / ${nle(s.rent![0] * 2)}`, s.rent!.slice(1, 5).map(nle).join(' · '), nle(s.rent![5]), nle(s.houseCost!), nle(s.mortgage!)]
      : [s.name, nle(s.price!), s.type === 'railway' ? 'NLE25-200 by railways owned' : '4× / 10× dice', '—', '—', '—', nle(s.mortgage!)]) },
    { caption: 'Special payments', head: ['Space', 'Payment'], rows: [['Passing GO', 'Collect NLE200'], ['Landing on GO', 'Collect NLE200'], ['Income F.C.C. Tax', 'Pay NLE200'], ['Luxury F.C.C. Tax', 'Pay NLE100'], ['Getting out of Jail', 'Pay NLE50']] },
  ], note: 'Prices are as printed on the board artwork. Rent schedules follow the recommended development system by price band; the Luxury Tax (NLE100) and Jail fine (NLE50) are the adopted game settings. A hotel costs the same as one house plus the four houses returned.' },
];
