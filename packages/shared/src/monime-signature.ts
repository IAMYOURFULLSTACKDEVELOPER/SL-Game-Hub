// Checks the `monime-signature` header Monime puts on every webhook (HMAC-SHA256 method):
//   monime-signature: t=<unix seconds>,v1=<base64 HMAC-SHA256 of `${t}_${rawBody}`>
// Uses Web Crypto only, so it runs in the Convex runtime and in Node tests.

const MAX_AGE_S = 300; // reject deliveries older than 5 minutes (replays)
const MAX_SKEW_S = 60; // or from more than a minute in the future

function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return null; }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyMonimeSignature(
  secret: string, header: string | null, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !header) return false;
  let t = NaN;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), val = part.slice(i + 1).trim();
    if (k === 't') t = Number(val);
    else if (k === 'v1') { const b = fromBase64(val); if (b) signatures.push(b); }
  }
  if (!Number.isInteger(t) || nowSeconds - t > MAX_AGE_S || t - nowSeconds > MAX_SKEW_S || !signatures.length) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}_${rawBody}`)));
  return signatures.some((s) => sameBytes(s, expected));
}
