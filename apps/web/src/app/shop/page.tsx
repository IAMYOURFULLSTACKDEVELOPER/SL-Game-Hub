import { api, query } from '@/lib/convex';
import { requireUser } from '@/lib/session';
import { purchaseCosmetic, equipCosmetic, claimDailyBonus } from '@/app/actions';
import { PageHeader } from '@/components/PageHeader';

export default async function ShopPage() {
  await requireUser();

  // Balance, login streak, the catalog and what this player owns
  const { balance, streak: loginStreak, canClaimDaily, cosmetics, owned: userCosmetics } = await query(api.rewards.shop, {});

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <PageHeader icon="bag" tone="gold" title="Rewards & Shop" subtitle="Spend your coins on avatars, themes and more." />

      {/* Coin Balance */}
      <div className="card p-6 bg-gradient-to-r from-accent/15 to-accent/5 border-accent/40">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Your Balance</h2>
            <p className="text-muted">Earn coins by playing games, winning tournaments, and completing achievements</p>
          </div>
          <div className="text-4xl font-bold text-yellow-600">
            🪙 {balance}
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
                uc.is_equipped ? 'bg-secondary/10 border-secondary/30 ring-2 ring-secondary' : 'bg-bg/60'
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
      equipped ? 'bg-secondary/10 border-secondary/30' :
      owned ? 'bg-primary/10 border-primary/30' :
      'bg-bg/60'
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
