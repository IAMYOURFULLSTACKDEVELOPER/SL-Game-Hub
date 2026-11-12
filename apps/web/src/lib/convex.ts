import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { ConvexError } from 'convex/values';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

export { api } from '@slgh/backend/convex/_generated/api';

// Server-side Convex calls made as the signed-in player (the auth cookie's token).
// Convex functions check access themselves, the way Row Level Security used to.

export async function query<Q extends FunctionReference<'query'>>(fn: Q, args: FunctionArgs<Q>): Promise<FunctionReturnType<Q>> {
  return fetchQuery(fn, args as never, { token: await convexAuthNextjsToken() });
}

export async function mutate<M extends FunctionReference<'mutation'>>(fn: M, args: FunctionArgs<M>): Promise<FunctionReturnType<M>> {
  return fetchMutation(fn, args as never, { token: await convexAuthNextjsToken() });
}

/** The message a Convex function threw on purpose (an i18n key or a short sentence), else a generic key. */
export const errorMessage = (e: unknown) => (e instanceof ConvexError && typeof e.data === 'string' ? e.data : 'errors.generic');
