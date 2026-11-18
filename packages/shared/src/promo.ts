// The welcome credit: every player who signs up in November or December 2026 gets SLE 10 and chooses,
// once, what to do with it: keep it in their wallet to play for money, or turn it into a month of Pro.
// Wallet credit can be staked (or spent on Pro) but not withdrawn; what you win with it is yours to withdraw.
// Amounts are minor units like the wallet (100 = SLE 1). Sierra Leone is on UTC, so the dates are UTC.

import { PRO_DAYS, PRO_PRICE } from './pro';

export const WELCOME_CREDIT = {
  id: 'welcome-2026-nov-dec',
  amount: 1_000, // SLE 10
  /** Sign-ups from 1 November 2026 ... */
  from: Date.UTC(2026, 10, 1),
  /** ... up to (not including) 1 January 2027 */
  until: Date.UTC(2027, 0, 1),
  /** The Pro choice: one month, the same as paying SLE 10 for it */
  proDays: PRO_DAYS,
} as const;

// The Pro choice is worth exactly one month because the credit equals the Pro price.
export const WELCOME_MATCHES_PRO = WELCOME_CREDIT.amount === PRO_PRICE;

/** Did this account sign up during the offer? (`createdAt`: the account's creation time in ms) */
export const welcomeEligible = (createdAt: number) => createdAt >= WELCOME_CREDIT.from && createdAt < WELCOME_CREDIT.until;

/** Money in a wallet that can be withdrawn: the balance minus any welcome credit not yet played. */
export const withdrawable = (balance: number, bonus: number | undefined) => Math.max(0, balance - Math.max(0, bonus ?? 0));
