import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export interface Me {
  id: string; username: string; full_name: string; avatar: string; role: 'player' | 'admin';
  age_band: 'under_13' | '13_17' | '18_plus'; banned: boolean; is_public: boolean;
  district_id: number | null; created_at: string;
}

/** One lookup per request, shared by layout and page. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser(); // validates the token with Supabase Auth
  if (!user) return null;
  const { data } = await supabase.from('profiles')
    .select('id,username,full_name,avatar,role,age_band,banned,is_public,district_id,created_at')
    .eq('id', user.id).single();
  return (data as Me | null) ?? null;
});

export async function requireUser() {
  const me = await getMe();
  if (!me) redirect('/login');
  return me;
}
export async function requireAdmin() {
  const me = await requireUser();
  if (me.role !== 'admin' || me.banned) redirect('/');
  return me;
}
