import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Me {
  id: string; username: string; full_name: string; avatar: string; role: 'player' | 'admin';
  age_band: 'under_13' | '13_17' | '18_plus'; banned: boolean; is_public: boolean; district_id: number | null;
}
interface AuthState { session: Session | null; me: Me | null; loading: boolean; refreshMe: () => Promise<void>; }
const Ctx = createContext<AuthState>({ session: null, me: null, loading: true, refreshMe: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async (s: Session | null) => {
    if (!s) { setMe(null); return; }
    const { data } = await supabase.from('profiles')
      .select('id,username,full_name,avatar,role,age_band,banned,is_public,district_id').eq('id', s.user.id).single();
    setMe((data as Me | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); loadMe(data.session).finally(() => setLoading(false)); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); loadMe(s); });
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  return <Ctx.Provider value={{ session, me, loading, refreshMe: () => loadMe(session) }}>{children}</Ctx.Provider>;
}
