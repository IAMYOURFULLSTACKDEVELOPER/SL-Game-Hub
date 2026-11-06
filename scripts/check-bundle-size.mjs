// Fails the build if the JavaScript a first-time visitor downloads for any page exceeds the budget.
// Run after `next build`:  npm run build:web && npm run check:size
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 250); // gzipped JS per page (the 2 MB shell target is far looser)
const dist = join(process.cwd(), 'apps/web/.next');
const manifestPath = join(dist, 'app-build-manifest.json');
if (!existsSync(manifestPath)) { console.error('Run `npm run build:web` first.'); process.exit(2); }

const pages = JSON.parse(readFileSync(manifestPath, 'utf8')).pages;
const size = (f) => (f.endsWith('.js') ? gzipSync(readFileSync(join(dist, f))).length : 0);
let worst = 0, failed = false;
for (const [page, files] of Object.entries(pages)) {
  if (!page.endsWith('/page') && !page.endsWith('/route')) continue;
  const kb = [...new Set(files)].reduce((n, f) => n + size(f), 0) / 1024;
  worst = Math.max(worst, kb);
  const bad = kb > BUDGET_KB; failed ||= bad;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${page.padEnd(32)} ${kb.toFixed(1)} KB gzip JS`);
}
console.log(`Budget ${BUDGET_KB} KB, worst page ${worst.toFixed(1)} KB`);
process.exit(failed ? 1 : 0);
