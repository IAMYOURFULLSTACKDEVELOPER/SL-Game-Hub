'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  GAME_STATUSES, isAvatarId, isEmail, USERNAME_RE, validatePasswords, validateSignUp,
} from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, requireUser } from '@/lib/session';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, 300);
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
// Only same-site relative paths are allowed as post-login destinations (prevents open redirects).
const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/');
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function signIn(fd: FormData) {
  const email = str(fd, 'email').trim(), password = str(fd, 'password'), next = safeNext(str(fd, 'next'));
  if (!isEmail(email) || !password) redirect(`/login?${qs({ error: 'errors.invalidCredentials', next })}`);
  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?${qs({ error: 'errors.invalidCredentials', next })}`);
  redirect(next);
}

export async function signUp(fd: FormData) {
  const input = {
    fullName: str(fd, 'fullName'), username: str(fd, 'username'), email: str(fd, 'email'),
    password: str(fd, 'password'), confirmPassword: str(fd, 'confirmPassword'), ageBand: str(fd, 'ageBand'),
  };
  // Re-fill non-secret fields on error (saves retyping on slow phones). Never includes passwords.
  const keep = { fullName: input.fullName, username: input.username, email: input.email, ageBand: input.ageBand };
  const errors = validateSignUp(input);
  const first = Object.values(errors)[0];
  if (first) redirect(`/signup?${qs({ ...keep, error: first })}`);

  const supabase = createClient();
  const { data: free } = await supabase.rpc('username_available', { u: input.username.trim() });
  if (free === false) redirect(`/signup?${qs({ ...keep, error: 'errors.usernameTaken' })}`);

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(), password: input.password,
    options: {
      emailRedirectTo: `${SITE()}/auth/callback`,
      data: { full_name: input.fullName.trim(), username: input.username.trim(), age_band: input.ageBand },
    },
  });
  if (error) redirect(`/signup?${qs({ ...keep, error: 'errors.generic' })}`);
  if (data.session) redirect('/');                                  // email confirmation OFF
  redirect(`/login?${qs({ notice: 'notice.checkEmail' })}`);         // email confirmation ON
}

export async function requestPasswordReset(fd: FormData) {
  const email = str(fd, 'email').trim();
  if (isEmail(email)) {
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${SITE()}/auth/callback?next=/reset-password` });
  }
  // Same answer whether or not the email exists (no account enumeration).
  redirect(`/forgot-password?${qs({ notice: 'notice.resetSent' })}`);
}

export async function updatePassword(fd: FormData) {
  const password = str(fd, 'password'), confirm = str(fd, 'confirmPassword');
  const errs = validatePasswords(password, confirm);
  const first = Object.values(errs)[0];
  if (first) redirect(`/reset-password?${qs({ error: first })}`);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/forgot-password?${qs({ error: 'errors.linkExpired' })}`);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/reset-password?${qs({ error: 'errors.generic' })}`);
  await supabase.auth.signOut();
  redirect(`/login?${qs({ notice: 'notice.passwordUpdated' })}`);
}

export async function signOut() {
  await createClient().auth.signOut();
  redirect('/');
}

export async function updateProfile(fd: FormData) {
  const me = await requireUser();
  const fullName = str(fd, 'fullName').trim(), username = str(fd, 'username').trim();
  const avatar = str(fd, 'avatar'), districtRaw = str(fd, 'districtId');
  if (fullName.length < 2 || fullName.length > 80) redirect(`/profile?${qs({ error: 'errors.fullNameRequired' })}`);
  if (!USERNAME_RE.test(username)) redirect(`/profile?${qs({ error: 'errors.usernameInvalid' })}`);
  if (!isAvatarId(avatar)) redirect(`/profile?${qs({ error: 'errors.generic' })}`);
  const districtId = districtRaw ? Number(districtRaw) : null;
  if (districtId !== null && !Number.isInteger(districtId)) redirect(`/profile?${qs({ error: 'errors.generic' })}`);

  const { error } = await createClient().from('profiles').update({
    full_name: fullName, username, avatar, district_id: districtId,
    is_public: me.age_band === 'under_13' ? false : fd.get('isPublic') === 'on',
  }).eq('id', me.id);
  if (error) redirect(`/profile?${qs({ error: error.code === '23505' ? 'errors.usernameTaken' : 'errors.generic' })}`);
  revalidatePath('/', 'layout');
  redirect(`/profile?${qs({ notice: 'notice.profileSaved' })}`);
}

// ---------- Admin (every action re-checks the role; RLS is the second lock) ----------
export async function setGameStatus(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id'), status = str(fd, 'status');
  if (!GAME_STATUSES.includes(status as never)) redirect('/admin/games');
  await createClient().from('games').update({
    status, published_at: status === 'published' ? new Date().toISOString() : null,
  }).eq('id', id);
  revalidatePath('/games'); revalidatePath('/'); revalidatePath('/admin/games');
  redirect('/admin/games');
}

export async function setPlayerBanned(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, 'id');
  if (id === admin.id) redirect('/admin/players');                  // can't suspend yourself
  await createClient().from('profiles').update({ banned: fd.get('banned') === 'true' }).eq('id', id);
  revalidatePath('/admin/players');
  redirect('/admin/players');
}

export async function resolveReport(fd: FormData) {
  const admin = await requireAdmin();
  const status = str(fd, 'status');
  if (status !== 'resolved' && status !== 'dismissed') redirect('/admin/reports');
  await createClient().from('reports').update({ status, resolved_by: admin.id }).eq('id', str(fd, 'id'));
  revalidatePath('/admin/reports');
  redirect('/admin/reports');
}

export async function rollbackToVersion(fd: FormData) {
  await requireAdmin();
  const versionId = str(fd, 'versionId');
  const gameId = str(fd, 'gameId');
  const supabase = createClient();

  // Get the version to rollback to
  const { data: version } = await supabase
    .from('game_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (!version) {
    redirect('/admin/games');
  }

  // Update the game to use this version
  await supabase
    .from('games')
    .update({
      version: version.version,
      thumbnail_url: version.thumbnail_path,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  // Mark this version as current
  await supabase
    .from('game_versions')
    .update({ is_current: true })
    .eq('id', versionId);

  revalidatePath('/admin/games');
  revalidatePath(`/admin/games/${version.manifest.id}/versions`);
  redirect(`/admin/games/${version.manifest.id}/versions`);
}

export async function registerForTournament(fd: FormData) {
  const user = await requireUser();
  const tournamentId = str(fd, 'tournamentId');
  const supabase = createClient();

  const { error } = await supabase.rpc('register_for_tournament', { p_tournament_id: tournamentId });

  if (error) {
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?notice=registered`);
}

// Chat moderation actions
export async function deleteChatMessage(fd: FormData) {
  await requireAdmin();
  const messageId = str(fd, 'messageId');
  const supabase = createClient();

  await supabase
    .from('chat_messages')
    .update({ is_deleted: true })
    .eq('id', messageId);

  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

export async function muteUser(fd: FormData) {
  await requireAdmin();
  const participantId = str(fd, 'participantId');
  const duration = Number(str(fd, 'duration')) || 60; // Default 60 minutes
  const supabase = createClient();

  const mutedUntil = new Date(Date.now() + duration * 60 * 1000).toISOString();

  await supabase
    .from('chat_participants')
    .update({ is_muted: true, muted_until: mutedUntil })
    .eq('id', participantId);

  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

export async function blockUser(fd: FormData) {
  const admin = await requireAdmin();
  const blockedId = str(fd, 'blockedId');
  const supabase = createClient();

  if (blockedId === admin.id) {
    redirect('/admin/chat'); // Can't block yourself
  }

  await supabase
    .from('user_blocks')
    .insert({ blocker_id: admin.id, blocked_id });

  revalidatePath('/admin/chat');
  redirect('/admin/chat');
}

// Rewards system actions
export async function claimDailyBonus(fd: FormData) {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase.rpc('process_daily_login');

  revalidatePath('/shop');
  redirect(`/shop?notice=${data > 0 ? `claimed_${data}` : 'already_claimed'}`);
}

export async function purchaseCosmetic(fd: FormData) {
  const user = await requireUser();
  const cosmeticId = str(fd, 'cosmeticId');
  const supabase = createClient();

  const { error } = await supabase.rpc('purchase_cosmetic', { p_cosmetic_id: cosmeticId });

  if (error) {
    redirect(`/shop?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/shop');
  redirect('/shop?notice=purchased');
}

export async function equipCosmetic(fd: FormData) {
  const user = await requireUser();
  const cosmeticId = str(fd, 'cosmeticId');
  const supabase = createClient();

  const { error } = await supabase.rpc('equip_cosmetic', { p_cosmetic_id: cosmeticId });

  if (error) {
    redirect(`/shop?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/shop');
  redirect('/shop?notice=equipped');
}
