import { v } from 'convex/values';
import { query, internalMutation } from './_generated/server';
import { requireUser } from './lib';
import { addCoins } from './rewards';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

/** Everything the achievements page shows for the signed-in player. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const achievements = await ctx.db.query('achievements').withIndex('by_active_type', (q) => q.eq('is_active', true)).collect();
    const badges = (await ctx.db.query('badges').withIndex('by_active_rarity', (q) => q.eq('is_active', true)).collect())
      .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    const earned = (await ctx.db.query('user_achievements').withIndex('by_user_achievement', (q) => q.eq('user_id', me._id)).collect())
      .filter((ua) => ua.earned_at !== undefined);
    const ownedBadges = await ctx.db.query('user_badges').withIndex('by_user_badge', (q) => q.eq('user_id', me._id)).collect();

    return {
      achievements: achievements.map((a) => ({
        id: a._id, name: a.name, description: a.description, icon: a.icon, type: a.type, reward_coins: a.reward_coins,
      })),
      earned: earned.map((ua) => ({
        achievement_id: ua.achievement_id, earned_at: new Date(ua.earned_at!).toISOString(),
        reward_coins: achievements.find((a) => a._id === ua.achievement_id)?.reward_coins ?? 0,
      })),
      badges: badges.map((b) => ({ id: b._id, name: b.name, description: b.description ?? null, icon: b.icon, rarity: b.rarity })),
      ownedBadges: ownedBadges.map((ub) => ({ badge_id: ub.badge_id, is_equipped: ub.is_equipped })),
    };
  },
});

/**
 * Was check_achievement_progress: records progress and awards the achievement (plus its badge and coins)
 * once every requirement is met. Internal, so only trusted server code can report progress.
 */
export const checkProgress = internalMutation({
  args: { userId: v.id('users'), achievementId: v.id('achievements'), progress: v.record(v.string(), v.number()) },
  handler: async (ctx, { userId, achievementId, progress }) => {
    const a = await ctx.db.get(achievementId);
    if (!a || !a.is_active) return false;
    const row = await ctx.db.query('user_achievements')
      .withIndex('by_user_achievement', (q) => q.eq('user_id', userId).eq('achievement_id', achievementId)).unique();
    if (row?.earned_at !== undefined) return true;

    const met = Object.entries(a.requirement).every(([k, need]) => (progress[k] ?? 0) >= need);
    const earned_at = met ? Date.now() : undefined;
    if (row) await ctx.db.patch(row._id, { progress, earned_at });
    else await ctx.db.insert('user_achievements', { user_id: userId, achievement_id: achievementId, progress, earned_at });
    if (!met) return false;

    if (a.reward_badge_id) {
      const badgeId = a.reward_badge_id;
      const has = await ctx.db.query('user_badges').withIndex('by_user_badge', (q) => q.eq('user_id', userId).eq('badge_id', badgeId)).unique();
      if (!has) await ctx.db.insert('user_badges', {
        user_id: userId, badge_id: badgeId, is_equipped: false, obtained_at: Date.now(), source_type: 'achievement', source_id: achievementId,
      });
    }
    if (a.reward_coins > 0) await addCoins(ctx, userId, a.reward_coins, 'achievement', `Achievement: ${a.name}`, { achievement_id: achievementId });
    return true;
  },
});
