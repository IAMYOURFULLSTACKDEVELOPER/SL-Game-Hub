import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { WELCOME_CREDIT, welcomeEligible } from '@slgh/shared/src/promo';
import { formatLeones } from '@slgh/shared/src/wallet';
import { currentUser, requireActiveUser } from './lib';
import { post, walletAllowed, addBonus } from './wallet';
import { grantPro, isPro } from './pro';

// The welcome credit (see packages/shared/src/promo.ts): players who sign up in November or December 2026
// get SLE 10 and choose once: keep it in the wallet to play for money (18+ only), or a month of Pro.
// Until they choose, the web app keeps asking (WelcomeCredit.tsx). Choosing is final.

const claimOf = (ctx: QueryCtx, user: Doc<'users'>) =>
  ctx.db.query('promo_claims').withIndex('by_user_id_and_promo', (q) => q.eq('user_id', user._id).eq('promo', WELCOME_CREDIT.id)).unique();

/** The offer waiting for the signed-in player, or null (signed out, not eligible, or already chosen). */
export const welcome = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me || me.banned || !welcomeEligible(me._creationTime)) return null;
    if (await claimOf(ctx, me)) return null;
    return {
      amount: WELCOME_CREDIT.amount,
      proDays: WELCOME_CREDIT.proDays,
      canWallet: walletAllowed(me), // the wallet is for players aged 18 and over
      pro: isPro(me),
      username: me.username,
    };
  },
});

async function claim(ctx: MutationCtx, me: Doc<'users'>, choice: 'wallet' | 'pro') {
  if (!welcomeEligible(me._creationTime)) throw new ConvexError('The welcome credit is for players who joined in November or December.');
  if (await claimOf(ctx, me)) throw new ConvexError('You already chose what to do with your welcome credit.');
  const amount = WELCOME_CREDIT.amount;
  if (choice === 'wallet') {
    if (!walletAllowed(me)) throw new ConvexError('The wallet is only for players aged 18 and over. Choose a month of Pro instead.');
    await post(ctx, me._id, 'bonus', { amount }, `Welcome credit: ${formatLeones(amount)} to play with (it can't be withdrawn, but what you win can)`);
    await addBonus(ctx, me._id, amount);
  } else {
    await grantPro(ctx, me._id, 'promo', 0); // a gift: not counted as Pro revenue
  }
  await ctx.db.insert('promo_claims', { user_id: me._id, promo: WELCOME_CREDIT.id, choice, amount });
}

/** Choose what to do with the welcome credit: 'wallet' (SLE 10 to play with) or 'pro' (30 days of Pro). */
export const claimWelcome = mutation({
  args: { choice: v.union(v.literal('wallet'), v.literal('pro')) },
  handler: async (ctx, { choice }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    await claim(ctx, me, choice);
    return { choice };
  },
});
