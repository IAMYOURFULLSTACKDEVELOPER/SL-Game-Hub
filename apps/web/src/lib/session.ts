import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { FunctionReturnType } from 'convex/server';
import { api, query } from './convex';

export type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;

/** One lookup per request, shared by layout and page. */
export const getMe = cache(async (): Promise<Me | null> => query(api.users.me, {}));

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
