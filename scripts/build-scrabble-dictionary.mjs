// Builds the Scrabble dictionary served at /games/scrabble/words.txt (lazy-loaded by the Scrabble screen only)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import wordListPath from 'word-list';

const out = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/games/scrabble/words.txt');
if (existsSync(out) && !process.argv.includes('--force')) process.exit(0);
const words = readFileSync(wordListPath, 'utf8').split('\n').map((w) => w.trim().toUpperCase()).filter((w) => /^[A-Z]{2,15}$/.test(w));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Array.from(new Set(words)).sort().join('\n'));
console.log(`Scrabble dictionary: ${words.length} words -> ${out}`);
