import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/session';

export default async function AchievementsPage() {
  const user = await requireUser();
  const supabase = createClient();

  // Get user's achievements
  const { data: userAchievements } = await supabase
    .from('user_achievements')
    .select('*, achievements!inner(slug,name,description,icon,type,reward_coins)')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false });

  // Get all available achievements
  const { data: allAchievements } = await supabase
    .from('achievements')
    .select('*')
    .eq('is_active', true)
    .order('type');

  // Get user's badges
  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('*, badges!inner(slug,name,description,icon,rarity)')
    .eq('user_id', user.id)
    .order('obtained_at', { ascending: false });

  // Get all available badges
  const { data: allBadges } = await supabase
    .from('badges')
    .select('*')
    .eq('is_active', true)
    .order('rarity');

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Achievements & Badges</h1>

      {/* Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-primary">{userAchievements?.length || 0}</div>
          <div className="text-muted">Achievements Earned</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-primary">{userBadges?.length || 0}</div>
          <div className="text-muted">Badges Collected</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-primary">
            {userAchievements?.reduce((sum, a) => sum + (a.achievements.reward_coins || 0), 0) || 0}
          </div>
          <div className="text-muted">Coins from Achievements</div>
        </div>
      </div>

      {/* Achievements */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Achievements ({userAchievements?.length || 0} / {allAchievements?.length || 0})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allAchievements?.map((achievement) => {
            const earned = userAchievements?.find((ua) => ua.achievement_id === achievement.id);
            return (
              <AchievementCard key={achievement.id} achievement={achievement} earned={!!earned} earnedAt={earned?.earned_at} />
            );
          })}
        </div>
      </div>

      {/* Badges */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Badges ({userBadges?.length || 0} / {allBadges?.length || 0})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {allBadges?.map((badge) => {
            const owned = userBadges?.find((ub) => ub.badge_id === badge.id);
            return (
              <BadgeCard key={badge.id} badge={badge} owned={!!owned} equipped={owned?.is_equipped} />
            );
          })}
        </div>
      </div>
    </main>
  );
}

function AchievementCard({ achievement, earned, earnedAt }: { achievement: any; earned: boolean; earnedAt?: string }) {
  return (
    <div className={`p-4 rounded-lg border ${earned ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
      <div className="flex items-start gap-3">
        <span className="text-4xl">{achievement.icon}</span>
        <div className="flex-1">
          <h3 className="font-bold">{achievement.name}</h3>
          <p className="text-sm text-muted">{achievement.description}</p>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="px-2 py-1 bg-gray-200 rounded">{achievement.type}</span>
            {achievement.reward_coins > 0 && (
              <span className="text-yellow-600">🪙 {achievement.reward_coins}</span>
            )}
          </div>
          {earned && earnedAt && (
            <p className="text-xs text-muted mt-2">
              Earned: {new Date(earnedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BadgeCard({ badge, owned, equipped }: { badge: any; owned: boolean; equipped?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border text-center ${
      equipped ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500' :
      owned ? 'bg-green-50 border-green-200' :
      'bg-gray-50 border-gray-200 opacity-50'
    }`}>
      <span className="text-5xl block mb-2">{badge.icon}</span>
      <h3 className="font-bold">{badge.name}</h3>
      <p className="text-xs text-muted mb-2">{badge.description}</p>
      <span className={`px-2 py-1 text-xs rounded ${
        badge.rarity === 'legendary' ? 'bg-yellow-200 text-yellow-800' :
        badge.rarity === 'epic' ? 'bg-purple-200 text-purple-800' :
        badge.rarity === 'rare' ? 'bg-blue-200 text-blue-800' :
        'bg-gray-200 text-gray-800'
      }`}>
        {badge.rarity}
      </span>
      {equipped && (
        <div className="mt-2 text-xs text-blue-600 font-medium">Equipped</div>
      )}
    </div>
  );
}
