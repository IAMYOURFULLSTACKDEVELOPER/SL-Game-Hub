'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { GAME_STATUSES, type GameStatus } from '@slgh/shared';
import type { Id, TableNames } from '@slgh/backend/convex/_generated/dataModel';
import { api, errorMessage, mutate } from '@/lib/convex';
import { requireAdmin, requireUser } from '@/lib/session';

// Sign in / sign up / password reset / sign out run in the browser (components/AuthForm.tsx),
// because Convex Auth keeps the session in cookies set by its /api/auth route.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, 300);
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
// Form fields carry document ids as strings; the Convex functions validate them.
const id = <T extends TableNames>(fd: FormData, k: string) => str(fd, k) as Id<T>;

/** Runs a mutation; on failure returns the error message instead of throwing. */
async function attempt(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (e) { return errorMessage(e); }
}

export async function updateProfile(fd: FormData) {
  const me = await requireUser();
  const districtId = str(fd, 'districtId');
  const error = await attempt(() => mutate(api.users.updateProfile, {
    full_name: str(fd, 'fullName'), username: str(fd, 'username'), avatar: str(fd, 'avatar'),
    district_id: districtId || null,
    is_public: me.age_band === 'under_13' ? false : fd.get('isPublic') === 'on',
  }));
  if (error) redirect(`/profile?${qs({ error })}`);
  revalidatePath('/', 'layout');
  redirect(`/profile?${qs({ notice: 'notice.profileSaved' })}`);
}

// ---------- Admin (every action re-checks the role; the Convex function is the second lock) ----------
export async function setGameStatus(fd: FormData) {
  await requireAdmin();
  const status = str(fd, 'status');
  if (GAME_STATUSES.includes(status as GameStatus)) {
    await mutate(api.games.setStatus, { id: id<'games'>(fd, 'id'), status: status as GameStatus });
  }
  revalidatePath('/games'); revalidatePath('/'); revalidatePath('/admin/games');
  redirect('/admin/games');
}

export async function setPlayerBanned(fd: FormData) {
  const admin = await requireAdmin();
  const playerId = str(fd, 'id');
  if (playerId !== admin.id) {                                       // can't suspend yourself
    await mutate(api.users.setBanned, { id: playerId as Id<'users'>, banned: fd.get('banned') === 'true' });
  }
  revalidatePath('/admin/players');
  redirect('/admin/players');
}

export async function resolveReport(fd: FormData) {
  await requireAdmin();
  const status = str(fd, 'status');
  if (status === 'resolved' || status === 'dismissed') {
    await mutate(api.reports.resolve, { id: id<'reports'>(fd, 'id'), status });
  }
  revalidatePath('/admin/reports');
  redirect('/admin/reports');
}

export async function rollbackToVersion(fd: FormData) {
  await requireAdmin();
  const slug = await mutate(api.gameVersions.rollback, { versionId: id<'game_versions'>(fd, 'versionId') }).catch(() => null);
  if (!slug) redirect('/admin/games');
  revalidatePath('/admin/games');
  revalidatePath(`/admin/games/${slug}/versions`);
  redirect(`/admin/games/${slug}/versions`);
}

export async function registerForTournament(fd: FormData) {
  await requireUser();
  const tournamentId = str(fd, 'tournamentId');
  const error = await attempt(() => mutate(api.tournaments.register, { tournamentId: tournamentId as Id<'tournaments'> }));
  if (error) redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error)}`);
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?notice=registered`);
}

// Chat moderation actions
export async function deleteChatMessage(fd: FormData) {
  await requireAdmin();
  await mutate(api.chat.deleteMessage, { messageId: id<'chat_messages'>(fd, 'messageId') });
  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

export async function muteUser(fd: FormData) {
  await requireAdmin();
  const duration = Number(str(fd, 'duration')) || 60; // Default 60 minutes
  await mutate(api.chat.mute, { participantId: id<'chat_participants'>(fd, 'participantId'), minutes: duration });
  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

export async function blockUser(fd: FormData) {
  const admin = await requireAdmin();
  const blockedId = str(fd, 'blockedId');
  if (blockedId !== admin.id) {                                      // can't block yourself
    await mutate(api.chat.block, { blockedId: blockedId as Id<'users'> });
  }
  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

// Rewards system actions
export async function claimDailyBonus() {
  await requireUser();
  const coins = await mutate(api.rewards.claimDailyBonus, {});
  revalidatePath('/shop');
  redirect(`/shop?notice=${coins > 0 ? `claimed_${coins}` : 'already_claimed'}`);
}

export async function purchaseCosmetic(fd: FormData) {
  await requireUser();
  const error = await attempt(() => mutate(api.rewards.purchaseCosmetic, { cosmeticId: id<'cosmetics'>(fd, 'cosmeticId') }));
  if (error) redirect(`/shop?error=${encodeURIComponent(error)}`);
  revalidatePath('/shop');
  redirect('/shop?notice=purchased');
}

export async function equipCosmetic(fd: FormData) {
  await requireUser();
  const error = await attempt(() => mutate(api.rewards.equipCosmetic, { cosmeticId: id<'cosmetics'>(fd, 'cosmeticId') }));
  if (error) redirect(`/shop?error=${encodeURIComponent(error)}`);
  revalidatePath('/shop');
  redirect('/shop?notice=equipped');
}

// Wallet withdrawals (admin). Approving sends the money through Monime straight away.
export async function reviewWithdrawal(fd: FormData) {
  await requireAdmin();
  const withdrawal = id<'withdrawals'>(fd, 'id');
  const error = await attempt(() => str(fd, 'decision') === 'approve'
    ? mutate(api.wallet.approveWithdrawal, { id: withdrawal })
    : mutate(api.wallet.rejectWithdrawal, { id: withdrawal }));
  revalidatePath('/admin/wallet');
  redirect(`/admin/wallet${error ? `?error=${encodeURIComponent(error)}` : ''}`);
}
