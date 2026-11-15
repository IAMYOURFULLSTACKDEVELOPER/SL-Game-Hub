'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { PRO_PERKS, PRO_DAYS } from '@slgh/shared/src/pro';
import { formatLeones, ussdHref } from '@slgh/shared/src/wallet';
import { playerMessage } from '@slgh/shared/src/errors';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/Icon';
import { sfx } from '@/lib/sound';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ProClient() {
  const s = useQuery(api.pro.status);
  const buyWallet = useMutation(api.pro.buyWithWallet);
  const buyUssd = useMutation(api.pro.buyWithUssd);
  const cancel = useMutation(api.wallet.cancelDeposit);
  const refresh = useAction(api.monime.refreshDeposit);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (s === undefined) return <main className="mx-auto max-w-3xl p-4">Loading…</main>;
  if (s === null) return <main className="mx-auto max-w-3xl p-4">Please sign in again.</main>;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setNote(null);
    try { await fn(); if (done) { setNote({ ok: true, text: done }); sfx('success'); } } catch (e) { setNote({ ok: false, text: playerMessage(e) }); }
    setBusy(false);
  };
  const daysLeft = s.proUntil ? Math.max(0, Math.ceil((s.proUntil - Date.now()) / 86_400_000)) : 0;
  const price = formatLeones(s.price);
  const short = s.walletBalance < s.price;
  const pending = s.pendingUssd;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader icon="star" tone="gold" title="Dodo Pro" subtitle={`${price} for ${PRO_DAYS} days. No automatic renewal.`} />

      <section className="card space-y-2 p-5">
        {s.pro ? (
          <>
            <p className="flex items-center gap-2 text-xl font-bold"><span className="icon-badge icon-badge-gold h-8 w-8"><Icon name="star" size={16} /></span>You're Pro until {day(s.proUntil!)}</p>
            <p className="text-muted">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left. Paying again adds {PRO_DAYS} more days on top.</p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold">You're on the free plan</p>
            <p className="text-muted">
              You can make {s.roomsLeft} more of your {s.freeDailyRooms} free online rooms today. Rejoining your rooms and playing in them is always unlimited, and so are games against bots.
            </p>
          </>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xl font-bold">What you get</h2>
        <ul className="space-y-2">
          {PRO_PERKS.map((p) => <li key={p} className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 text-success" strokeWidth={2.6} />{p}</li>)}
        </ul>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-xl font-bold">{s.pro ? `Add ${PRO_DAYS} more days` : `Get Pro for ${price}`}</h2>

        {s.canUseWallet && (
          <div className="space-y-1">
            <button className="btn btn-primary w-full" disabled={busy || short} onClick={() => {
              if (confirm(`Pay ${price} from your wallet for ${PRO_DAYS} days of Pro?`)) void run(() => buyWallet({}), `Done! You're Pro for ${PRO_DAYS} more days.`);
            }}>Pay {price} from my wallet</button>
            <p className="hint">
              Wallet: <b>{formatLeones(s.walletBalance)}</b>{short && <> · <Link href="/wallet" className="font-semibold text-secondary">Top up first</Link></>}
            </p>
          </div>
        )}

        {pending?.status === 'pending' && pending.ussd_code ? (
          <div className="space-y-3 rounded-2xl border border-primary/40 p-4">
            <p className="text-sm text-muted">Dial this code on the phone with your mobile money account to pay {formatLeones(pending.charge)} ({price} plus a small mobile money fee):</p>
            <p className="font-mono text-3xl font-extrabold tracking-wider">{pending.ussd_code}</p>
            <div className="flex flex-wrap gap-2">
              <a href={ussdHref(pending.ussd_code)} className="btn btn-primary btn-sm"><Icon name="phone" size={16} />Dial now</a>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run(async () => {
                const st = await refresh({ id: pending.id as Id<'deposits'> });
                if (st === 'pending' || st === 'processing') setNote({ ok: false, text: 'Not paid yet. It can take a minute after you approve on your phone.' });
              })}>I've paid, check now</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(() => cancel({ id: pending.id as Id<'deposits'> }))}>Cancel</button>
            </div>
            <p className="hint">Pro switches on by itself once the payment goes through. Anyone can pay, e.g. a parent.</p>
          </div>
        ) : pending?.status === 'creating' ? (
          <p className="text-muted">Getting your USSD code…</p>
        ) : s.ussdAvailable ? (
          <button className={`btn w-full ${s.canUseWallet ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={() => void run(() => buyUssd({}))}>
            Pay {formatLeones(s.ussdCharge)} with mobile money (USSD, includes a small mobile money fee)
          </button>
        ) : !s.canUseWallet && (
          <p className="text-muted">Paying by mobile money isn't switched on yet. Check back soon.</p>
        )}

        {note && <p role={note.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${note.ok ? 'text-primary' : 'text-danger'}`}>{note.text}</p>}
      </section>
    </main>
  );
}
