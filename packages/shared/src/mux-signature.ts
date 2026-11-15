// Checks the `mux-signature` header Mux puts on every webhook:
//   mux-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>
// Web Crypto only, so it runs in the Convex runtime and in Node tests.

const MAX_AGE_S = 300; // Mux's SDKs allow 5 minutes
const MAX_SKEW_S = 60;

function fromHex(s: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(s) || s.length % 2) return null;
  return Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyMuxSignature(
  secret: string, header: string | null, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !header) return false;
  let t = NaN;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), val = part.slice(i + 1).trim();
    if (k === 't') t = Number(val);
    else if (k === 'v1') { const b = fromHex(val); if (b) signatures.push(b); }
  }
  if (!Number.isInteger(t) || nowSeconds - t > MAX_AGE_S || t - nowSeconds > MAX_SKEW_S || !signatures.length) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`)));
  return signatures.some((s) => sameBytes(s, expected));
}
