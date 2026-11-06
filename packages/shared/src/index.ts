export * from './types';
export * from './validation';
export * from './avatars';
export * from './game-upload';
export * from './game-sdk';
export * from './games';
export * from './games/snake';
export * from './games/snake-and-ladder';
export * from './games/checkers';
export * from './games/word-search';
export * from './games/chess';
export * from './games/scrabble';
export * from './games/uno';
export * from './games/monopoly';
export * from './games/dice';
export * from './multiplayer';
export * from './friends';
export * from './rooms';
export * from './matchmaking';
export * from './realtime';
export * from './history';
export * from './anticheat';
export { t } from './i18n';
export { default as tokens } from './tokens.json';

// Register all games
import './games/index';
