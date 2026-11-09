import type { RuleSection } from '../rulebook';

export const CHESS_RULES: RuleSection[] = [
  { title: 'Introduction', intro: 'Chess is a two-player strategy game played on an 8 × 8 board of 64 squares. On the SL Game Hub board the Gold army plays against the Black army.' },
  { title: 'Objective', rules: [
    'Checkmate the opposing king: attack it so that it cannot escape capture.',
    'A game can also end in a draw (stalemate, 50-move rule or agreement) or by resignation.',
  ] },
  { title: 'The board and set-up', rules: [
    'Files are labelled A-H (left to right) and ranks 1-8 (bottom to top) from Gold’s side.',
    'Each player has 16 pieces: 1 king, 1 queen, 2 rooks, 2 bishops, 2 knights and 8 pawns.',
    'Rooks go in the corners, then knights, then bishops. The queen starts on her own colour (Gold queen on D1, Black queen on D8); the king takes the remaining centre square.',
    'Pawns fill the second rank (Gold) and seventh rank (Black). Gold always moves first.',
  ] },
  { title: 'How the pieces move', tables: [{ head: ['Piece', 'Movement', 'Value'], rows: [
    ['King ♚', 'One square in any direction', '—'],
    ['Queen ♛', 'Any number of squares in a straight line or diagonal', '9'],
    ['Rook ♜', 'Any number of squares horizontally or vertically', '5'],
    ['Bishop ♝', 'Any number of squares diagonally', '3'],
    ['Knight ♞', 'An “L”: two squares one way then one square at a right angle. It can jump over pieces', '3'],
    ['Pawn ♟', 'Forward one square (two on its first move). Captures one square diagonally forward', '1'],
  ] }], rules: [
    'No piece except the knight may jump over other pieces.',
    'You capture by moving onto a square occupied by an opponent’s piece, which is removed from the board.',
  ] },
  { title: 'Special moves', rules: [
    'Castling: move the king two squares towards a rook and place that rook on the square the king crossed. Allowed only if neither piece has moved, the squares between them are empty, and the king is not in check, does not pass through check and does not land in check.',
    'En passant: if a pawn advances two squares and lands beside an enemy pawn, that enemy pawn may capture it as if it had moved one square — only on the very next move.',
    'Promotion: a pawn reaching the far rank must be exchanged for a queen, rook, bishop or knight of the same colour.',
  ] },
  { title: 'Check, checkmate and stalemate', rules: [
    'Check: the king is under attack. You must get out of check immediately by moving the king, blocking, or capturing the attacker.',
    'You may never make a move that leaves your own king in check — the game will not allow it.',
    'Checkmate: the king is in check and there is no legal escape. The player who delivers checkmate wins.',
    'Stalemate: the player to move is not in check but has no legal move. The game is a draw.',
  ] },
  { title: 'Draws', rules: [
    'Stalemate.',
    '50-move rule: 50 moves by each player without a pawn move or capture.',
    'Agreement: both players agree to a draw.',
  ] },
  { title: 'Playing on SL Game Hub', rules: [
    'Tap or click a piece to see its legal moves (dots), then tap the destination square.',
    'Play against a bot (Easy, Medium or Hard) or pass the device between two players.',
    'Use Undo (vs bot), Offer draw and Resign as needed. Your game is saved on this device.',
  ] },
  { title: 'Etiquette', rules: [
    'Touch-move: in friendly over-the-board play, a piece you touch should be the piece you move.',
    'Be a good sport — shake hands (or say “good game”) at the end.',
  ] },
];
