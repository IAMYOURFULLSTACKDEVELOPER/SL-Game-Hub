import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireActiveUser, requireUser, today } from './lib';

export async function addCoins(
  ctx: MutationCtx, userId: Id<'users'>, amount: number, type: string, description?: string, metadata?: unknown,
) {
  if (amount <= 0) throw new ConvexError('amount must be positive');
  const c = await ctx.db.query('user_coins').withIndex('by_user', (q) => q.eq('user_id', userId)).unique();
  if (c) await ctx.db.patch(c._id, { balance: c.balance + amount, total_earned: c.total_earned + amount, updated_at: Date.now() });
  else await ctx.db.insert('user_coins', { user_id: userId, balance: amount, total_earned: amount, total_spent: 0, updated_at: Date.now() });
  await ctx.db.insert('coin_transactions', { user_id: userId, amount, type, description, metadata });
}

/** Returns false (and changes nothing) when the balance is too low. */
export async function spendCoins(
  ctx: MutationCtx, userId: Id<'users'>, amount: number, type: string, description?: string, metadata?: unknown,
) {
  if (amount < 0) throw new ConvexError('amount must be positive');
  const c = await ctx.db.query('user_coins').withIndex('by_user', (q) => q.eq('user_id', userId)).unique();
  if (amount === 0) return true; // free items
  if (!c || c.balance < amount) return false;
  await ctx.db.patch(c._id, { balance: c.balance - amount, total_spent: c.total_spent + amount, updated_at: Date.now() });
  await ctx.db.insert('coin_transactions', { user_id: userId, amount: -amount, type, description, metadata });
  return true;
}

/** Everything the shop page shows for the signed-in player. */
export const shop = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const coins = await ctx.db.query('user_coins').withIndex('by_user', (q) => q.eq('user_id', me._id)).unique();
    const streak = await ctx.db.query('user_login_streaks').withIndex('by_user', (q) => q.eq('user_id', me._id)).unique();
    const cosmetics = await ctx.db.query('cosmetics').withIndex('by_active_rarity', (q) => q.eq('is_active', true)).collect();
    const owned = await ctx.db.query('user_cosmetics')
      .withIndex('by_user_cosmetic', (q) => q.eq('user_id', me._id)).collect();
    return {
      balance: coins?.balance ?? 0,
      streak: streak && { current_streak: streak.current_streak, longest_streak: streak.longest_streak },
      canClaimDaily: streak?.last_login_date !== today(),
      cosmetics: cosmetics.map((c) => ({
        id: c._id, name: c.name, description: c.description ?? null, icon: c.icon, type: c.type,
        rarity: c.rarity, price_coins: c.price_coins,
      })),
      owned: await Promise.all(owned.map(async (uc) => {
        const c = await ctx.db.get(uc.cosmetic_id);
        return { id: uc._id, cosmetic_id: uc.cosmetic_id, is_equipped: uc.is_equipped, cosmetics: { name: c?.name ?? '', icon: c?.icon ?? '✨', type: c?.type ?? 'avatar' } };
      })),
    };
  },
});

export const purchaseCosmetic = mutation({
  args: { cosmeticId: v.id('cosmetics') },
  handler: async (ctx, { cosmeticId }) => {
    const me = await requireActiveUser(ctx, 'account banned');
    const c = await ctx.db.get(cosmeticId);
    if (!c || !c.is_active) throw new ConvexError('cosmetic not found');
    const now = Date.now();
    if (c.is_limited && c.available_from && now < c.available_from) throw new ConvexError('cosmetic not yet available');
    if (c.is_limited && c.available_until && now > c.available_until) throw new ConvexError('cosmetic no longer available');
    const owned = await ctx.db.query('user_cosmetics')
      .withIndex('by_user_cosmetic', (q) => q.eq('user_id', me._id).eq('cosmetic_id', cosmeticId)).unique();
    if (owned) throw new ConvexError('already owned');
    if (!await spendCoins(ctx, me._id, c.price_coins, 'purchase', `Purchased: ${c.name}`, { cosmetic_id: cosmeticId })) {
      throw new ConvexError('insufficient coins');
    }
    await ctx.db.insert('user_cosmetics', {
      user_id: me._id, cosmetic_id: cosmeticId, is_equipped: false, obtained_at: now, source_type: 'purchase', source_id: cosmeticId,
    });
  },
});

/** Equips one cosmetic and unequips the others of the same type. */
export const equipCosmetic = mutation({
  args: { cosmeticId: v.id('cosmetics') },
  handler: async (ctx, { cosmeticId }) => {
    const me = await requireUser(ctx);
    const c = await ctx.db.get(cosmeticId);
    if (!c) throw new ConvexError('cosmetic not found');
    const mine = await ctx.db.query('user_cosmetics').withIndex('by_user_cosmetic', (q) => q.eq('user_id', me._id)).collect();
    if (!mine.some((uc) => uc.cosmetic_id === cosmeticId)) throw new ConvexError('do not own this cosmetic');
    for (const uc of mine) {
      if (uc.cosmetic_id === cosmeticId) { if (!uc.is_equipped) await ctx.db.patch(uc._id, { is_equipped: true }); continue; }
      if (uc.is_equipped && (await ctx.db.get(uc.cosmetic_id))?.type === c.type) await ctx.db.patch(uc._id, { is_equipped: false });
    }
  },
});

/** Was process_daily_login: returns the coins awarded, or 0 if today's bonus was already claimed. */
export const claimDailyBonus = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const day = today();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    let s = await ctx.db.query('user_login_streaks').withIndex('by_user', (q) => q.eq('user_id', me._id)).unique();
    if (!s) {
      const id = await ctx.db.insert('user_login_streaks', {
        user_id: me._id, current_streak: 1, longest_streak: 1, last_login_date: day, total_logins: 1, updated_at: Date.now(),
      });
      s = (await ctx.db.get(id))!;
    } else {
      if (s.last_login_date === day) return 0;
      const current = s.last_login_date === yesterday ? s.current_streak + 1 : 1; // a missed day resets the streak
      await ctx.db.patch(s._id, {
        current_streak: current, longest_streak: Math.max(s.longest_streak, current),
        last_login_date: day, total_logins: s.total_logins + 1, updated_at: Date.now(),
      });
      s = (await ctx.db.get(s._id))!;
    }

    const dayNumber = Math.min(s.current_streak, 30);
    const reward = await ctx.db.query('daily_login_rewards').withIndex('by_day', (q) => q.eq('day_number', dayNumber)).unique();
    if (!reward?.is_active) return 0;
    if (reward.coins > 0) await addCoins(ctx, me._id, reward.coins, 'daily_login', `Day ${dayNumber} login bonus`);
    if (reward.cosmetic_id) {
      const cosmeticId = reward.cosmetic_id;
      const owned = await ctx.db.query('user_cosmetics')
        .withIndex('by_user_cosmetic', (q) => q.eq('user_id', me._id).eq('cosmetic_id', cosmeticId)).unique();
      if (!owned) await ctx.db.insert('user_cosmetics', {
        user_id: me._id, cosmetic_id: cosmeticId, is_equipped: false, obtained_at: Date.now(), source_type: 'daily_login', source_id: s._id,
      });
    }
    return reward.coins;
  },
});
