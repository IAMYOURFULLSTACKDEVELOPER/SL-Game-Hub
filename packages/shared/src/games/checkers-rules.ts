import type { RuleSection } from '../rulebook';

export const CHECKERS_RULES: RuleSection[] = [
  { title: 'Introduction', intro: 'Checkers (draughts) is a two-player game on an 8 × 8 board. Each player has 12 discs — Red and Black — and tries to capture or block all of the opponent’s pieces.' },
  { title: 'Objective', rules: [
    'Win by capturing all of your opponent’s pieces, or by leaving them with no legal move on their turn.',
  ] },
  { title: 'Set-up', rules: [
    'The board is placed so each player has a light square in the bottom-right corner. Only the dark squares are used.',
    'Red’s 12 discs fill the dark squares of the three rows nearest Red; Black’s 12 discs fill the three rows nearest Black.',
    'On SL Game Hub, Red moves first, then players alternate turns.',
  ] },
  { title: 'Moving', rules: [
    'An ordinary piece (a “man”) moves one square diagonally forward onto an empty dark square.',
    'Men can never move backwards.',
  ] },
  { title: 'Capturing (jumping)', rules: [
    'Capture by jumping diagonally over an adjacent opponent piece onto the empty square directly beyond it. The jumped piece is removed.',
    'Capturing is compulsory: if you can jump, you must jump.',
    'Multiple jumps: if after a jump the same piece can jump again, it must continue jumping in the same turn. You may choose which path to take.',
    'Men capture forwards only; kings capture forwards and backwards.',
  ] },
  { title: 'Kings', rules: [
    'When a man reaches the far row (the opponent’s back row) it is crowned a king (shown with a ♛ crown).',
    'A king moves and captures diagonally both forwards and backwards, one square at a time.',
    'A man that is crowned during a jump ends its turn there.',
  ] },
  { title: 'End of the game', rules: [
    'You win when your opponent has no pieces left, or cannot make any legal move.',
    'Draw: if 40 moves pass for each player with no capture and no new king, or if both players agree to a draw.',
  ] },
  { title: 'Playing on SL Game Hub', rules: [
    'Tap a piece to see where it can go (highlighted), then tap the destination. Pieces that must capture are outlined.',
    'Play against a bot (Easy, Medium or Hard) or pass the device between two players.',
    'Undo, Offer draw and Resign are available. Your game is saved on this device.',
  ] },
];
