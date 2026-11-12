import type { RuleSection } from '../rulebook';

export const UNO_RULES: RuleSection[] = [
  { title: 'Objective', intro: 'Be the first player to get rid of all your cards. When you win, you score points for the cards still in everyone else\'s hands.' },
  { title: 'The deck', rules: [
    '108 cards in four colours: red, yellow, green and blue.',
    'Each colour has one 0, two of each number 1–9, and two each of Skip, Reverse and Draw Two.',
    'There are 4 Wild cards and 4 Wild Draw Four cards.',
  ] },
  { title: 'Getting started', steps: [
    'Every player is dealt 7 cards. The rest of the deck is placed face down.',
    'The top card is turned over to start the discard pile (a wild card is put back and another is turned over).',
    'If the starting card is an action card, it acts on the first player: Skip skips them, Draw Two makes them draw 2 and lose their turn, Reverse changes the direction.',
  ] },
  { title: 'Your turn', steps: [
    'Play one card that matches the top card by colour, number or symbol, or play a Wild card.',
    'If you can\'t (or don\'t want to) play, draw one card. If the drawn card can be played you may play it straight away; otherwise your turn ends.',
    'Play then passes to the next player in the current direction.',
  ] },
  { title: 'Action cards', tables: [{
    head: ['Card', 'What it does'],
    rows: [
      ['Skip', 'The next player loses their turn.'],
      ['Reverse', 'Play changes direction. With two players it works like Skip.'],
      ['Draw Two', 'The next player draws 2 cards and loses their turn.'],
      ['Wild', 'Choose the colour that play continues in.'],
      ['Wild Draw Four', 'Choose the colour; the next player draws 4 cards and loses their turn. You may only play it when you have no card of the current colour.'],
    ],
  }] },
  { title: 'Calling UNO', rules: [
    'When you play your second-to-last card, press the UNO! button before playing it.',
    'If you forget, you draw 2 cards as a penalty.',
  ] },
  { title: 'Running out of cards', intro: 'When the draw pile is empty, the discard pile (except its top card) is shuffled to make a new draw pile.' },
  { title: 'Scoring', tables: [{
    head: ['Cards left in other hands', 'Points to the winner'],
    rows: [['Number cards', 'Face value (0–9)'], ['Skip, Reverse, Draw Two', '20 each'], ['Wild, Wild Draw Four', '50 each']],
  }] },
  { title: 'Ways to play', rules: [
    'Against bots: you and 1–3 computer players on easy, medium or hard.',
    'Pass and play: 2–4 people share one phone. The screen hides each hand until the next player taps to see theirs.',
    'Online: create a room, share its 6-letter code (or link) with friends, and fill empty seats with bots. If someone disconnects, a bot finishes their game.',
  ] },
];
