import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import Resend from '@auth/core/providers/resend';
import { ConvexError } from 'convex/values';
import { USERNAME_RE, isAgeBand, isEmail } from '@slgh/shared/src/validation';
import type { DataModel } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Emails a 6-digit code; the player types it in with their new password. */
const PasswordResetCode = Resend({
  id: 'password-reset-code',
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 15 * 60,
  async generateVerificationToken() {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    return String(n).padStart(6, '0');
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? 'SL Game Hub <onboarding@resend.dev>',
        to: [email],
        subject: 'Your SL Game Hub password reset code',
        text: `Your password reset code is ${token}. It expires in 15 minutes. If you did not ask for this, ignore this email.`,
      }),
    });
    if (!res.ok) throw new Error(`Could not send reset email: ${await res.text()}`);
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      // Runs for every flow; only sign-up carries (and must validate) the profile fields.
      profile(params) {
        const email = str(params.email).toLowerCase();
        if (params.flow !== 'signUp') return { email } as never;
        const full_name = str(params.fullName), username = str(params.username), age_band = str(params.ageBand);
        if (!isEmail(email)) throw new ConvexError('errors.emailInvalid');
        if (full_name.length < 2 || full_name.length > 80) throw new ConvexError('errors.fullNameRequired');
        if (!USERNAME_RE.test(username)) throw new ConvexError('errors.usernameInvalid');
        if (!isAgeBand(age_band)) throw new ConvexError('errors.ageRequired');
        return { email, full_name, username, age_band } as never;
      },
      validatePasswordRequirements(password) {
        if (password.length < 8 || password.length > 72) throw new ConvexError('errors.passwordShort');
      },
      reset: PasswordResetCode,
    }),
  ],
  callbacks: {
    // Replaces the handle_new_user trigger: the user row IS the player profile.
    async createOrUpdateUser(genericCtx, { existingUserId, profile }) {
      if (existingUserId) return existingUserId;
      const ctx = genericCtx as unknown as MutationCtx;
      const p = profile as { email: string; full_name?: string; username?: string; age_band?: string };
      if (!p.full_name || !p.username || !p.age_band || !isAgeBand(p.age_band)) throw new ConvexError('errors.generic');
      const username_lower = p.username.toLowerCase();
      const taken = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username_lower)).first();
      if (taken) throw new ConvexError('errors.usernameTaken');
      return ctx.db.insert('users', {
        email: p.email, full_name: p.full_name, username: p.username, username_lower,
        avatar: 'av_lion', country: 'SL', age_band: p.age_band, role: 'player',
        is_public: p.age_band !== 'under_13', banned: false, updated_at: Date.now(),
      });
    },
  },
});
