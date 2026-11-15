'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { displaySlPhone, formatLeones, parseLeones, providerName } from '@slgh/shared/src/wallet';
import { playerMessage } from '@slgh/shared/src/errors';
import { Icon } from '@/components/Icon';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card space-y-3 p-4"><h2 className="text-lg font-bold">{title}</h2>{children}</section>;
}

/** One player: everything about their account and wallet, plus the admin actions. Every action needs a reason (audit log). */
export default function PlayerAdmin({ id }: { id: string }) {
  const p = useQuery(api.admin.player, { id });
  const adjust = useMutation(api.admin.adjustWallet);
  const setPro = useMutation(api.admin.setPro);
  const setRole = useMutation(api.admin.setRole);
  const setSuspended = useMutation(api.admin.setSuspended);
  const [money, setMoney] = useState({ dir: 'credit', amount: '', reason: '' });
  const [pro, setProForm] = useState({ days: '30', reason: '' });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (p === undefined) return <p className="text-muted">Loading…</p>;
  if (p === null) return <p className="card p-4">Player not found. <Link href="/admin/players" className="text-secondary">Back to players</Link></p>;
  const userId = p.id as Id<'users'>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: playerMessage(e) }); }
    setBusy(false);
  };
  const onMoney = (e: FormEvent) => {
    e.preventDefault();
    const minor = parseLeones(money.amount);
    if (!minor) { setMsg({ ok: false, text: 'Enter an amount in leones, e.g. 25.' }); return; }
    const signed = money.dir === 'credit' ? minor : -minor;
    if (!confirm(`${money.dir === 'credit' ? 'Add' : 'Take'} ${formatLeones(minor)} ${money.dir === 'credit' ? 'to' : 'from'} ${p.username}'s wallet?`)) return;
    void run(async () => { await adjust({ userId, amount: signed, reason: money.reason }); setMoney({ dir: money.dir, amount: '', reason: '' }); },
      `${formatLeones(minor)} ${money.dir === 'credit' ? 'added to' : 'taken from'} the wallet.`);
  };
  const onPro = (e: FormEvent) => {
    e.preventDefault();
    const days = Number(pro.days);
    void run(async () => { await setPro({ userId, days, reason: pro.reason }); setProForm({ days: '30', reason: '' }); },
      days === 0 ? 'Pro ended.' : `${days} days of Pro added.`);
  };

  return (
    <div className="space-y-4">
      <Link href="/admin/players" className="back-link">← Players</Link>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2">{p.username}</h1>
        {p.role === 'admin' && <span className="chip chip-muted">Admin</span>}
        {p.pro && <span className="chip chip-accent"><Icon name="star" size={12} />Pro until {when(p.pro_until!)}</span>}
        {p.banned && <span className="chip border-danger/40 text-danger">Suspended</span>}
      </header>
      <p className="text-sm text-muted">
        {p.full_name} · {p.email ?? 'no email'} · {p.age_band.replace('_', ' ')} · joined {when(p.created_at)} · {p.gamesToday} online games today · owns {p.groupsOwned} group{p.groupsOwned === 1 ? '' : 's'}
      </p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`card p-3 font-semibold ${msg.ok ? 'text-primary' : 'text-danger'}`}>{msg.text}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={`Wallet: ${formatLeones(p.balance)}${p.held ? ` (+${formatLeones(p.held)} held)` : ''}`}>
          <form onSubmit={onMoney} className="space-y-2">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Credit or debit">
              {(['credit', 'debit'] as const).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={money.dir === d} onClick={() => setMoney({ ...money, dir: d })}
                  className={`btn btn-sm ${money.dir === d ? 'btn-primary' : 'btn-outline'}`}>{d === 'credit' ? 'Add money' : 'Take money'}</button>
              ))}
            </div>
            <input className="input" inputMode="decimal" placeholder="Amount (SLE)" aria-label="Amount" value={money.amount} onChange={(e) => setMoney({ ...money, amount: e.target.value })} />
            <input className="input" placeholder="Reason (kept in the audit log)" aria-label="Reason" value={money.reason} onChange={(e) => setMoney({ ...money, reason: e.target.value })} />
            <button className="btn btn-primary w-full" disabled={busy || !money.amount || money.reason.trim().length < 3}>
              {money.dir === 'credit' ? 'Add to wallet' : 'Take from wallet'}
            </button>
          </form>
        </Panel>

        <Panel title={p.pro ? `Pro until ${when(p.pro_until!)}` : 'Pro: not active'}>
          <form onSubmit={onPro} className="space-y-2">
            <label className="label" htmlFor="pro-days">Days to add (0 ends Pro now)</label>
            <input id="pro-days" className="input" inputMode="numeric" value={pro.days} onChange={(e) => setProForm({ ...pro, days: e.target.value.replace(/\D/g, '') })} />
            <input className="input" placeholder="Reason (e.g. tournament prize)" aria-label="Pro reason" value={pro.reason} onChange={(e) => setProForm({ ...pro, reason: e.target.value })} />
            <button className="btn btn-primary w-full" disabled={busy || pro.days === '' || pro.reason.trim().length < 3}>{pro.days === '0' ? 'End Pro' : 'Give Pro days'}</button>
          </form>
        </Panel>

        <Panel title="Account">
          <input className="input" placeholder="Reason for the change below" aria-label="Account reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`btn btn-sm ${p.banned ? 'btn-primary' : 'btn-outline text-danger'}`} disabled={busy || reason.trim().length < 3}
              onClick={() => void run(async () => { await setSuspended({ userId, banned: !p.banned, reason }); setReason(''); }, p.banned ? 'Account restored.' : 'Account suspended.')}>
              {p.banned ? 'Restore account' : 'Suspend account'}
            </button>
            <button type="button" className="btn btn-sm btn-outline" disabled={busy || reason.trim().length < 3}
              onClick={() => {
                const role = p.role === 'admin' ? 'player' : 'admin';
                if (!confirm(role === 'admin' ? `Make ${p.username} an admin? Admins can move money and manage every player.` : `Remove ${p.username}'s admin access?`)) return;
                void run(async () => { await setRole({ userId, role, reason }); setReason(''); }, role === 'admin' ? 'Now an admin.' : 'Now a player.');
              }}>
              {p.role === 'admin' ? 'Remove admin' : 'Make admin'}
            </button>
          </div>
          <p className="hint">Suspended players can't play online, chat, move money or post.</p>
        </Panel>

        <Panel title="Admin history for this player">
          {p.actions.length === 0 ? <p className="text-sm text-muted">No admin actions yet.</p> : (
            <ul className="space-y-1 text-sm">
              {p.actions.map((a) => <li key={a.id}><b>{a.admin}</b> · {a.action}: {a.details}<span className="block text-xs text-muted">{when(a.at)}</span></li>)}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Wallet history">
        {p.transactions.length === 0 ? <p className="text-sm text-muted">No transactions.</p> : (
          <ul className="divide-y divide-border text-sm">
            {p.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">{t.description}<span className="block text-xs text-muted">{when(t.at)} · balance after {formatLeones(t.balance_after)}</span></span>
                <b className={t.amount > 0 ? 'text-primary' : t.amount < 0 ? 'text-danger' : 'text-muted'}>
                  {t.amount !== 0 ? `${t.amount > 0 ? '+' : ''}${formatLeones(t.amount)}` : `held ${formatLeones(t.held_change)}`}
                </b>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Payments in">
          {p.deposits.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="space-y-1 text-sm">{p.deposits.map((d) => <li key={d.id}>{formatLeones(d.amount)} {d.purpose === 'pro' ? 'for Pro' : 'top-up'} · {d.status} · <span className="text-muted">{when(d.at)}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Withdrawals">
          {p.withdrawals.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="space-y-1 text-sm">{p.withdrawals.map((w) => <li key={w.id}>{formatLeones(w.amount)} → {providerName(w.provider)} {displaySlPhone(w.phone)} · {w.status} · <span className="text-muted">{when(w.at)}</span></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
