import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/session';
import { purchaseCosmetic, equipCosmetic, claimDailyBonus } from '@/app/actions';

export default async function ShopPage() {
  const user = await requireUser();
  const supabase = createClient();

  // Get user's coin balance
  const { data: userCoins } = await supabase
    .from('user_coins')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Get user's cosmetics
  const { data: userCosmetics } = await supabase
    .from('user_cosmetics')
    .select('*, cosmetics!inner(slug,name,description,icon,type,rarity,price_coins)')
    .eq('user_id', user.id);

  // Get available cosmetics
  const { data: cosmetics } = await supabase
    .from('cosmetics')
    .select('*')
    .eq('is_active', true)
    .order('rarity');

  // Get daily login info
  const { data: loginStreak } = await supabase
    .from('user_login_streaks')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const canClaimDaily = !loginStreak || loginStreak.last_login_date !== new Date().toISOString().split('T')[0];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Rewards & Shop</h1>

      {/* Coin Balance */}
      <div className="card p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Your Balance</h2>
            <p className="text-muted">Earn coins by playing games, winning tournaments, and completing achievements</p>
          </div>
          <div className="text-4xl font-bold text-yellow-600">
            🪙 {userCoins?.balance || 0}
          </div>
        </div>
      </div>

      {/* Daily Bonus */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Daily Login Bonus</h2>
            <p className="text-muted">
              Current Streak: {loginStreak?.current_streak || 0} days | Longest: {loginStreak?.longest_streak || 0} days
            </p>
          </div>
          <form action={claimDailyBonus}>
            <button
              type="submit"
              className={`btn ${canClaimDaily ? 'btn-primary' : 'btn-secondary'}`}
              disabled={!canClaimDaily}
            >
              {canClaimDaily ? 'Claim Bonus' : 'Already Claimed'}
            </button>
          </form>
        </div>
      </div>

      {/* Cosmetics Shop */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Cosmetics Shop</h2>
        <div className="space-y-6">
          {['avatar', 'frame', 'theme', 'title', 'effect'].map((type) => {
            const typeCosmetics = cosmetics?.filter((c) => c.type === type) || [];
            if (typeCosmetics.length === 0) return null;

            return (
              <div key={type}>
                <h3 className="font-bold mb-3 capitalize">{type}s</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {typeCosmetics.map((cosmetic) => {
                    const owned = userCosmetics?.find((uc) => uc.cosmetic_id === cosmetic.id);
                    const equipped = owned?.is_equipped;

                    return (
                      <CosmeticCard
                        key={cosmetic.id}
                        cosmetic={cosmetic}
                        owned={!!owned}
                        equipped={!!equipped}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Owned Cosmetics */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Your Cosmetics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {userCosmetics?.map((uc) => (
            <div
              key={uc.id}
              className={`p-4 rounded-lg border text-center ${
                uc.is_equipped ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500' : 'bg-gray-50'
              }`}
            >
              <span className="text-5xl block mb-2">{uc.cosmetics.icon}</span>
              <h3 className="font-bold">{uc.cosmetics.name}</h3>
              <p className="text-xs text-muted capitalize">{uc.cosmetics.type}</p>
              {uc.is_equipped && (
                <div className="mt-2 text-xs text-blue-600 font-medium">Equipped</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function CosmeticCard({ cosmetic, owned, equipped }: { cosmetic: any; owned: boolean; equipped: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${
      equipped ? 'bg-blue-50 border-blue-200' :
      owned ? 'bg-green-50 border-green-200' :
      'bg-gray-50'
    }`}>
      <div className="text-center mb-3">
        <span className="text-5xl block mb-2">{cosmetic.icon}</span>
        <h3 className="font-bold">{cosmetic.name}</h3>
        {cosmetic.description && (
          <p className="text-sm text-muted">{cosmetic.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className={`px-2 py-1 text-xs rounded ${
          cosmetic.rarity === 'legendary' ? 'bg-yellow-200 text-yellow-800' :
          cosmetic.rarity === 'epic' ? 'bg-purple-200 text-purple-800' :
          cosmetic.rarity === 'rare' ? 'bg-blue-200 text-blue-800' :
          'bg-gray-200 text-gray-800'
        }`}>
          {cosmetic.rarity}
        </span>
        {!owned && (
          <span className="font-bold text-yellow-600">🪙 {cosmetic.price_coins}</span>
        )}
      </div>

      {owned ? (
        <form action={equipCosmetic}>
          <input type="hidden" name="cosmeticId" value={cosmetic.id} />
          <button
            type="submit"
            className={`btn w-full ${equipped ? 'btn-secondary' : 'btn-primary'}`}
            disabled={equipped}
          >
            {equipped ? 'Equipped' : 'Equip'}
          </button>
        </form>
      ) : (
        <form action={purchaseCosmetic}>
          <input type="hidden" name="cosmeticId" value={cosmetic.id} />
          <button type="submit" className="btn btn-primary w-full">
            Purchase
          </button>
        </form>
      )}
    </div>
  );
}
