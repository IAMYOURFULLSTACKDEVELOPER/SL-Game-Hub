'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import {
  MOMO_PROVIDERS, WALLET_LIMITS, displaySlPhone, formatLeones, parseLeones, providerName, ussdHref,
} from '@slgh/shared/src/wallet';
import { PageHeader } from '@/components/PageHeader';

const message = (e: unknown) => (e instanceof ConvexError ? String(e.data) : 'Something went wrong. Check your connection and try again.');
const QUICK = [1_000, 2_500, 5_000, 10_000];

const STATUS: Record<string, string> = {
  requested: 'Waiting for approval', processing: 'Sending', completed: 'Paid', failed: 'Failed, money returned',
  rejected: 'Declined, money returned', cancelled: 'Cancelled',
};

function useNow(every = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

/** One USSD top-up code: dial it, approve on the phone, and the balance updates by itself. */
function PendingDeposit({ d }: {
  d: { id: Id<'deposits'>; amount: number; status: string; ussd_code: string | null; expires_at: number | null; error: string | null };
}) {
  const refresh = useAction(api.monime.refreshDeposit);
  const cancel = useMutation(api.wallet.cancelDeposit);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const now = useNow();
  const minutes = d.expires_at ? Math.max(0, Math.ceil((d.expires_at - now) / 60_000)) : null;

  const check = async () => {
    setBusy(true); setNote('');
    try {
      const s = await refresh({ id: d.id });
      if (s === 'pending' || s === 'processing') setNote('Not paid yet. It can take a minute after you approve on your phone.');
    } catch (e) { setNote(message(e)); }
    setTimeout(() => setBusy(false), 10_000); // don't hammer the payment provider
  };

  if (d.status === 'creating') return <div className="card p-4 text-muted">Getting a USSD code for {formatLeones(d.amount)}…</div>;
  return (
    <div className="card space-y-3 border-primary/50 p-4">
      <p className="text-sm text-muted">Top up {formatLeones(d.amount)}: dial this code on the phone with your mobile money account</p>
      <p className="font-mono text-3xl font-extrabold tracking-wider" data-testid="ussd-code">{d.ussd_code}</p>
      <div className="flex flex-wrap gap-2">
        {d.ussd_code && <a href={ussdHref(d.ussd_code)} className="btn btn-primary btn-sm">📞 Dial now</a>}
        {d.ussd_code && (
          <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(d.ussd_code!).then(() => setNote('Code copied.'))}>
            Copy code
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={check} disabled={busy}>I&apos;ve paid, check now</button>
        <button className="btn btn-ghost btn-sm" onClick={() => cancel({ id: d.id }).catch((e) => setNote(message(e)))}>Cancel</button>
      </div>
      <p className="text-xs text-muted">
        Follow the prompts and enter your mobile money PIN. Your balance updates automatically once it is paid.
        {minutes !== null && ` The code expires in ${minutes} min.`}
      </p>
      {d.error && <p className="text-sm font-semibold text-danger">{d.error}</p>}
      {note && <p className="text-sm font-semibold" aria-live="polite">{note}</p>}
    </div>
  );
}

function TopUp({ configured }: { configured: boolean }) {
  const create = useMutation(api.wallet.createDeposit);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minor = parseLeones(amount);
    if (minor === null) { setError('Enter an amount in leones, e.g. 25.'); return; }
    setBusy(true); setError('');
    try { await create({ amount: minor }); setAmount(''); } catch (err) { setError(message(err)); }
    setBusy(false);
  };

  if (!configured) return <p className="text-muted">Mobile money top-ups are not switched on yet.</p>;
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn btn-outline btn-sm" onClick={() => setAmount(String(q / 100))}>{formatLeones(q)}</button>
        ))}
      </div>
      <label className="label" htmlFor="topup">Amount (SLE)</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="topup" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input min-w-0 flex-1"
          placeholder={`${WALLET_LIMITS.minDeposit / 100} – ${(WALLET_LIMITS.maxDeposit / 100).toLocaleString('en-US')}`} />
        <button className="btn btn-primary" disabled={busy || !amount}>Get USSD code</button>
      </div>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </form>
  );
}

function Withdraw({ balance }: { balance: number }) {
  const request = useMutation(api.wallet.requestWithdrawal);
  const [form, setForm] = useState({ amount: '', phone: '', provider: MOMO_PROVIDERS[0].id as string });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minor = parseLeones(form.amount);
    if (minor === null) { setError('Enter an amount in leones, e.g. 25.'); return; }
    if (!confirm(`Send ${formatLeones(minor)} to ${providerName(form.provider)} ${form.phone}?`)) return;
    setBusy(true); setError(''); setDone('');
    try {
      await request({ amount: minor, phone: form.phone, provider: form.provider });
      setForm({ ...form, amount: '' });
      setDone('Request received. The money is set aside and is sent once it has been approved.');
    } catch (err) { setError(message(err)); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="w-amount">Amount (SLE)</label>
          <input id="w-amount" inputMode="decimal" required value={form.amount} className="input"
            onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={`max ${formatLeones(balance)}`} /></div>
        <div><label className="label" htmlFor="w-phone">Mobile number</label>
          <input id="w-phone" type="tel" required value={form.phone} className="input" placeholder="076 123 456"
            onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className="label" htmlFor="w-provider">Network</label>
          <select id="w-provider" value={form.provider} className="input" onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            {MOMO_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
      </div>
      <button className="btn btn-primary" disabled={busy || balance < WALLET_LIMITS.minWithdrawal}>Withdraw to mobile money</button>
      <p className="text-xs text-muted">Minimum {formatLeones(WALLET_LIMITS.minWithdrawal)}. Withdrawals are checked by our team before they are sent.</p>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {done && <p className="text-sm font-semibold text-primary">{done}</p>}
    </form>
  );
}

export default function WalletClient() {
  const w = useQuery(api.wallet.summary);
  const cancelWithdrawal = useMutation(api.wallet.cancelWithdrawal);

  if (w === undefined) return <main className="mx-auto max-w-3xl p-4">Loading wallet…</main>;
  if (w === null) return <main className="mx-auto max-w-3xl p-4">Please sign in again.</main>;

  const open = w.deposits.filter((d) => d.status === 'creating' || d.status === 'pending');
  const recentFailure = w.deposits.find((d) => d.status === 'failed' && Date.now() - d.created_at < 10 * 60_000);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader icon="wallet" tone="gold" title="Wallet" subtitle="Top up with mobile money, stake on games, cash out your winnings." />

      {!w.eligible ? (
        <div className="card p-5">
          <h2 className="font-bold">The wallet is for players aged 18 and over</h2>
          <p className="text-muted">Playing for money isn&apos;t available on your account. Every game is still free to play.</p>
        </div>
      ) : (
        <>
          <section className="card grid gap-4 bg-gradient-to-r from-accent/15 to-accent/5 p-4 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="text-sm text-muted">Available</p>
              <p className="text-4xl font-extrabold" data-testid="wallet-balance">{formatLeones(w.balance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Held (stakes in games and withdrawals on the way)</p>
              <p className="text-2xl font-bold">{formatLeones(w.held)}</p>
            </div>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-xl font-bold">Top up</h2>
            {open.map((d) => <PendingDeposit key={d.id} d={d} />)}
            {recentFailure && <p className="text-sm font-semibold text-danger">{recentFailure.error}</p>}
            <TopUp configured={w.configured} />
          </section>

          <section className="card space-y-2 p-5">
            <h2 className="text-xl font-bold">Play for money</h2>
            <p className="text-muted">
              Open <Link href="/games/dice/play" className="font-semibold text-primary underline">Dice → Online</Link> and create a money room.
              Everyone who joins puts in the same stake; it is held until the game ends and the winner gets the whole pot.
              Your winnings land here, ready to stake again or withdraw.
            </p>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-xl font-bold">Withdraw</h2>
            <Withdraw balance={w.balance} />
            {w.withdrawals.length > 0 && (
              <ul className="divide-y divide-border">
                {w.withdrawals.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{formatLeones(x.amount)} → {providerName(x.provider)} {displaySlPhone(x.phone)}</span>
                    <span className="flex items-center gap-2">
                      <span className="chip chip-muted">{STATUS[x.status] ?? x.status}</span>
                      {x.status === 'requested' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => cancelWithdrawal({ id: x.id }).catch((e) => alert(message(e)))}>Cancel</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {w.transactions.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 text-xl font-bold">History</h2>
          <ul className="divide-y divide-border">
            {w.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {t.description}
                  <span className="block text-xs text-muted">{new Date(t.created_at).toLocaleString('en-GB')}</span>
                </span>
                <span className={`whitespace-nowrap font-bold ${t.amount > 0 ? 'text-primary' : t.amount < 0 ? 'text-danger' : 'text-muted'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount !== 0 ? formatLeones(t.amount) : `held ${formatLeones(t.held_change)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
