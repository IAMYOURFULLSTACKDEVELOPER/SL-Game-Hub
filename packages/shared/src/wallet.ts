// Real-money wallet helpers used by the Convex backend, the web app and the mobile app.
// Every amount is an integer in minor units, the way Monime counts money: SLE 1 = 100.
// (Coins in the shop are separate and are never worth real money.)

export const CURRENCY = 'SLE';

export const WALLET_LIMITS = {
  minDeposit: 500, //          SLE 5
  maxDeposit: 500_000, //      SLE 5,000 per USSD code
  minStake: 100, //            SLE 1
  maxStake: 100_000, //        SLE 1,000
  minWithdrawal: 1_000, //     SLE 10
  maxWithdrawal: 500_000, //   SLE 5,000
  maxPendingDeposits: 3,
} as const;

/** Mobile money networks Monime can collect from and pay out to. */
export const MOMO_PROVIDERS = [
  { id: 'm17', name: 'Orange Money' },
  { id: 'm18', name: 'Africell Money' },
] as const;
export type MomoProvider = (typeof MOMO_PROVIDERS)[number]['id'];
export const isMomoProvider = (s: string): s is MomoProvider => MOMO_PROVIDERS.some((p) => p.id === s);
export const providerName = (id: string) => MOMO_PROVIDERS.find((p) => p.id === id)?.name ?? id;

/** 1234 -> "SLE 12.34", 500 -> "SLE 5". */
export function formatLeones(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  const cents = abs % 100;
  return `${sign}${CURRENCY} ${Math.floor(abs / 100).toLocaleString('en-US')}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** What a player types ("25", "1,000", "Le 12.50") -> minor units, or null when it isn't an amount. */
export function parseLeones(input: string): number | null {
  const s = input.trim().replace(/^(SLE|Le)\s*/i, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Sierra Leone mobile number in any common form ("076 123 456", "+232 76 123456") -> "23276123456". */
export function normalizeSlPhone(input: string): string | null {
  const m = /^(?:\+?232|0)?([2-9]\d{7})$/.exec(input.replace(/[\s\-().]/g, ''));
  return m ? `232${m[1]}` : null;
}

/** "23276123456" -> "076 123 456" for display. */
export const displaySlPhone = (msisdn: string) =>
  /^232\d{8}$/.test(msisdn) ? `0${msisdn.slice(3, 5)} ${msisdn.slice(5, 8)} ${msisdn.slice(8)}` : msisdn;

/** A tel: link that opens the phone dialer with a USSD code (the # must be escaped). */
export const ussdHref = (code: string) => `tel:${code.replace(/#/g, '%23')}`;

/** How a pot is paid out. The fee is in basis points (250 = 2.5%) and is rounded down. */
export function splitPot(total: number, feeBps: number) {
  const fee = Math.floor((total * Math.max(0, Math.min(feeBps, 10_000))) / 10_000);
  return { fee, prize: total - fee };
}
