import type { RuleSection } from '../rulebook';
import { DICE_TARGETS, SNAKE_EYES_PENALTY } from './dice';

export const DICE_RULES: RuleSection[] = [
  {
    title: 'Objective',
    rules: [
      'Race the other players to the target score by rolling two dice on your turn.',
      `Choose a target before you start: ${DICE_TARGETS.join(', ')} points. The first player to reach it wins.`,
    ],
  },
  {
    title: 'Scoring',
    rules: [
      'Each roll scores the sum of the two dice.',
      'Doubles score double — rolling two 4s scores 16 points.',
      `Snake eyes (two 1s) cost you ${SNAKE_EYES_PENALTY} points.`,
      'Scores never drop below zero.',
    ],
    tables: [
      {
        caption: 'Examples',
        head: ['Roll', 'Result'],
        rows: [
          ['3 + 4', '+7'],
          ['5 + 5 (doubles)', '+20'],
          ['6 + 6 (doubles)', '+24'],
          ['1 + 1 (snake eyes)', `−${SNAKE_EYES_PENALTY}`],
        ],
      },
    ],
  },
  {
    title: 'Players',
    rules: [
      '2 to 8 players. Play locally on this device or online with friends.',
      'Turns go clockwise. The game ends the moment someone reaches the target.',
    ],
  },
];
