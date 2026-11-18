'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { Icon } from './Icon';

const ALWAYS = [
  { icon: 'user', text: 'Welcome and account emails' },
  { icon: 'wallet', text: 'Wallet top-ups and withdrawal updates' },
  { icon: 'crown', text: 'Dodo Pro receipts' },
] as const;

/** The profile's email card: what Dodo emails you, and the one switch for reminders and invites. */
export function EmailSettings({ email, reminders }: { email: string | null; reminders: boolean }) {
  const setPrefs = useMutation(api.users.setEmailPrefs);
  const [on, setOn] = useState(reminders);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !on;
    setOn(next); setBusy(true); setError('');
    try { await setPrefs({ reminders: next }); }
    catch { setOn(!next); setError('Could not save. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return (
    <section id="emails" className="card reveal scroll-mt-20 p-5" style={{ ['--i' as string]: 2 }}>
      <h2 className="flex items-center gap-2"><span className="icon-badge icon-badge-blue h-9 w-9"><Icon name="mail" size={18} /></span>Emails</h2>
      <p className="mt-1 text-sm text-muted">
        {email ? <>We send emails to <b className="text-heading">{email}</b>.</> : 'Your account has no email address.'}
      </p>

      <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={toggle}
        className="mt-4 flex w-full items-start gap-3 rounded-xl border border-border/60 bg-bg/40 p-3 text-left transition-colors hover:border-primary/50">
        <span aria-hidden className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
        <span>
          <span className="block font-semibold text-heading">Reminders and invites</span>
          <span className="block text-sm text-muted">30 minutes before a game you said you&apos;d join, when a friend invites you to a scheduled game, and 3 days before your Pro ends.</span>
        </span>
      </button>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}

      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Always sent</p>
      <ul className="mt-2 grid gap-1.5 text-sm">
        {ALWAYS.map((a) => (
          <li key={a.text} className="flex items-center gap-2 text-text/80"><Icon name={a.icon} size={15} className="text-muted" />{a.text}</li>
        ))}
      </ul>
    </section>
  );
}
