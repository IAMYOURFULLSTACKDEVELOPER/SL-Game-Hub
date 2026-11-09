import type { RuleSection } from '../rulebook';

export const SNAKE_RULES: RuleSection[] = [
  {
    title: 'Objective',
    rules: [
      'Guide the snake around the board. Eat food to grow and score points, and try to survive as long as possible.',
      'Every piece of food eaten scores 10 points and makes the snake one cell longer.',
    ],
  },
  {
    title: 'Controls',
    rules: [
      'Steer with the Arrow keys or WASD (W/A/S/D).',
      'You cannot reverse directly into your own neck — the snake only turns 90°.',
    ],
  },
  {
    title: 'Losing',
    rules: [
      'Hitting a wall ends the game.',
      'Running into any part of your own body ends the game.',
    ],
  },
  {
    title: 'Tips',
    rules: [
      'The snake speeds up as the game goes on — plan several moves ahead.',
      'Use the AI Play option to watch the computer play, and try the Easy, Medium and Hard difficulties.',
      'Your best game is saved automatically — use Save & Exit to keep your progress.',
    ],
  },
];
