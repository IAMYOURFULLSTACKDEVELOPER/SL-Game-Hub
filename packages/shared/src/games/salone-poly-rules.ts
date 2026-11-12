import type { RuleSection } from '../rulebook';
import { SALONE_POLY, SALONE_POLY_BOARD, SALONE_POLY_GROUPS } from './salone-poly';

const leones = (n: number) => `Le${n.toLocaleString('en-US')}`;
const groupNames = (Object.keys(SALONE_POLY_GROUPS) as (keyof typeof SALONE_POLY_GROUPS)[])
  .map((g) => `${SALONE_POLY_GROUPS[g].label}: ${SALONE_POLY_GROUPS[g].spaces.map((i) => SALONE_POLY_BOARD[i].name).join(', ')}`);

export const SALONE_POLY_RULES: RuleSection[] = [
  { title: 'Objective', intro: `Travel around Sierra Leone buying landmarks, collecting rent and building houses and hotels. Everyone starts with ${leones(SALONE_POLY.startingCash)}. The last player who isn't bankrupt wins. In a timed game, the richest player when time runs out wins (cash plus the value of property and buildings, minus mortgages).` },
  { title: 'The board', rules: [
    '22 landmarks in 8 colour groups, 4 transport hubs, 2 utilities, Luck and Osusu card spaces, 2 taxes, Jail, Attaya Break and Go To Jail.',
    ...groupNames,
    'Transport: Lungi Ferry, Poda-Poda Park, Lungi Airport and Government Wharf. Utilities: Bumbuna Power and Guma Valley Water.',
  ] },
  { title: 'Your turn', steps: [
    'Roll both dice and move clockwise that many spaces.',
    `Passing or landing on Start pays you ${leones(SALONE_POLY.goSalary)}.`,
    'Follow the space you land on: buy it, pay rent, take a card or pay tax.',
    'Rolled a double? Roll again after your move. Three doubles in a row send you straight to Jail.',
    'When you are done, press End Turn.',
  ] },
  { title: 'Buying and auctions', rules: [
    'Land on a landmark, transport hub or utility nobody owns and you may buy it for the listed price.',
    'If you decline (or can\'t afford it), it goes to auction. Everyone still in the game may bid; the highest bid wins.',
  ] },
  { title: 'Rent', rules: [
    'Landing on someone else\'s property means paying them rent. Mortgaged property pays no rent.',
    'Own a whole colour group and rent on its empty landmarks doubles.',
    `Transport rent depends on how many hubs the owner has: ${SALONE_POLY.transportRent.slice(1).map(leones).join(', ')}.`,
    `Utility rent is the dice total × ${SALONE_POLY.utilityMultiplier[1]} (or × ${SALONE_POLY.utilityMultiplier[2]} if the owner has both).`,
  ] },
  { title: 'Houses and hotels', rules: [
    'Own a complete colour group (with nothing mortgaged) to build. Tap a landmark you own to build on it.',
    'Build evenly: no landmark can have two more houses than another in its group.',
    'After 4 houses, the next purchase is a hotel. One hotel per landmark.',
    `The bank only has ${SALONE_POLY.houses} houses and ${SALONE_POLY.hotels} hotels.`,
    'Buildings sell back to the bank for half their cost.',
  ] },
  { title: 'Luck and Osusu cards', rules: [
    'Luck cards move you around the country, pay you or cost you.',
    'Osusu cards are mostly about money: savings, school fees, birthdays and gifts.',
    'A bail card gets you out of jail free. Keep it until you need it, or trade it.',
  ] },
  { title: 'Jail', rules: [
    'You go to Jail by landing on Go To Jail, drawing a jail card, or rolling three doubles in a row. You don\'t collect money for passing Start on the way.',
    `To get out: pay ${leones(SALONE_POLY.jailFine)} before rolling, use a bail card, or roll a double. After three failed rolls you pay the fine and move.`,
    'In Jail you still collect rent, build and trade.',
    'Landing on Jail by a normal move means you are just visiting.',
  ] },
  { title: 'Short of money', rules: [
    'If you owe more cash than you have, sell buildings, mortgage property or trade to raise it, then pay.',
    `A mortgage gives you half the property's price. Paying it off costs that amount plus 10%.`,
    'If you still can\'t pay, you are bankrupt: everything you own goes to whoever you owe (or back to the bank) and you leave the game.',
  ] },
  { title: 'Trading', rules: [
    'On your turn you may offer another player a trade of property, cash and bail cards.',
    'Properties being traded must have no buildings in their colour group.',
    'Bots accept a trade only if it is good for them. Online, the other player gets your offer and chooses to accept or decline.',
  ] },
  { title: 'Ways to play', rules: [
    'Against bots: you and 1–5 computer players on easy, medium or hard.',
    'Pass and play: friends share one phone and take turns.',
    'Online: create a room, share its code (or link) and fill empty seats with bots. If someone disconnects, a bot carries on for them.',
  ] },
];
