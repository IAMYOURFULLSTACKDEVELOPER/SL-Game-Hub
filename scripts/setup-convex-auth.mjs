// Sets the environment variables Convex Auth needs on the current Convex deployment:
// JWT_PRIVATE_KEY / JWKS (the key pair that signs session tokens) and SITE_URL.
// Run once per deployment from the repo root:  node scripts/setup-convex-auth.mjs [site-url] [--prod]
// (--prod targets the production deployment instead of your dev one.)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const siteUrl = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3000';
const keys = await generateKeyPair('RS256', { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ');
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] });

// Run the Convex CLI with node directly (no shell), so the key's spaces and the JSON quotes survive on every OS.
const cli = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url));
const set = (name, value) => execFileSync(process.execPath, [cli, 'env', 'set', ...(prod ? ['--prod'] : []), name, '--', value], {
  cwd: fileURLToPath(new URL('../packages/backend/', import.meta.url)), stdio: ['ignore', 'inherit', 'inherit'],
});
set('JWT_PRIVATE_KEY', privateKey);
set('JWKS', jwks);
set('SITE_URL', siteUrl);
console.log('Convex Auth is configured. Set AUTH_RESEND_KEY too if you want password-reset emails.');
