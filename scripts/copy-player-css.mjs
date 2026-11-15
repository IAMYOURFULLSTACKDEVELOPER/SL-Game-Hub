// Copies the video player's skin stylesheets (@videojs/react) to apps/web/public/vendor/videojs/.
//
// They can't be imported from a component: the skins wrap their rules in native CSS cascade layers
// (`@layer base { ... }`), which Tailwind 3's PostCSS plugin refuses to compile. Layered rules would also lose
// to Tailwind's unlayered reset (preflight) anyway, whatever their specificity, and the controls would break.
// So the layer wrappers are removed here (their contents keep their order) and the page loads the files with
// a <link> (components/BroadcastPlayer.tsx). Runs before `dev` and `build`; the output is git-ignored.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/web/package.json'));
const out = join(root, 'apps/web/public/vendor/videojs');

/** Replaces every `@layer name { body }` with `body` and drops `@layer a, b;` order statements. */
export function unlayer(css) {
  let res = '';
  let i = 0;
  const closers = []; // for each open brace: true when it belongs to an @layer block being removed
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { // comment
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      res += css.slice(i, stop); i = stop; continue;
    }
    if (c === '"' || c === "'") { // string
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      res += css.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '@' && css.startsWith('@layer', i) && !/[\w-]/.test(css[i + 6] ?? '')) {
      let j = i + 6;
      while (j < css.length && css[j] !== '{' && css[j] !== ';') j++;
      if (css[j] === ';') { i = j + 1; continue; } // `@layer a, b;`
      closers.push(true); i = j + 1; continue; // `@layer a {`: keep only the body
    }
    if (c === '{') closers.push(false);
    if (c === '}') {
      if (closers.pop()) { i++; continue; }
    }
    res += c; i++;
  }
  return res;
}

mkdirSync(out, { recursive: true });
for (const preset of ['live-video', 'video']) {
  const src = require.resolve(`@videojs/react/${preset}/skin.css`);
  const css = unlayer(readFileSync(src, 'utf8'));
  if (/@layer\b/.test(css)) throw new Error(`copy-player-css: @layer left in ${preset}/skin.css`);
  writeFileSync(join(out, `${preset}-skin.css`), css);
}
console.log('copy-player-css: video player styles copied to apps/web/public/vendor/videojs');
