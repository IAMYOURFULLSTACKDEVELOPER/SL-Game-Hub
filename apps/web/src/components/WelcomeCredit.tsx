'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { formatLeones } from '@slgh/shared/src/wallet';
import { PRO_PERKS } from '@slgh/shared/src/pro';
import { playerMessage } from '@slgh/shared/src/errors';
import { Icon } from './Icon';
import { Portal } from './Portal';
import { sfx } from '@/lib/sound';

// The welcome credit (SLE 10 for players who join in November or December): a pop-up right after
// sign-up or sign-in asks what to do with it, keep it in the wallet to play for money, or a month of Pro.
// Until they choose it keeps coming back: on every visit, and again a few minutes after "Remind me later"
// when they move to another page. A gift button in the top bar opens it any time. Never shown mid-game.

const SNOOZE_KEY = 'slgh-welcome-snooze';
const REMIND_MS = 3 * 60_000; // after "Remind me later", ask again on the next page after this long

const quietPath = (p: string) => /^\/games\/[^/]+\/play/.test(p) || /^\/(login|signup|forgot-password|reset-password)/.test(p);
const readSnooze = () => { try { return Number(sessionStorage.getItem(SNOOZE_KEY) ?? 0); } catch { return 0; } };
const writeSnooze = (t: number) => { try { sessionStorage.setItem(SNOOZE_KEY, String(t)); } catch { /* private mode */ } };

export function WelcomeCredit() {
  const offer = useQuery(api.promo.welcome, {});
  const claim = useMutation(api.promo.claimWelcome);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<'wallet' | 'pro' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'wallet' | 'pro' | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Ask on arrival and on each new page once the snooze has run out (never during a game).
  useEffect(() => {
    if (!offer || done || quietPath(path)) return;
    if (Date.now() - readSnooze() >= REMIND_MS) setOpen(true);
  }, [offer, path, done]);
  useEffect(() => { if (offer && !offer.canWallet) setPick('pro'); }, [offer]);
  useEffect(() => { if (open) dialog.current?.focus(); }, [open]);

  if (!offer && !done) return null;
  const amount = formatLeones(offer?.amount ?? 1_000);

  const later = () => { writeSnooze(Date.now()); setOpen(false); setError(''); };
  const confirm = async () => {
    if (!pick) return;
    setBusy(true); setError('');
    try { await claim({ choice: pick }); setDone(pick); sfx('success'); } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };

  return (
    <>
      {offer && (
        <button type="button" onClick={() => { setOpen(true); sfx('click'); }}
          className="btn btn-sm gap-1.5 rounded-full bg-accent/20 px-3 font-bold text-heading ring-1 ring-accent/50 hover:bg-accent/30"
          title="Your welcome credit is waiting" aria-label={`Choose what to do with your ${amount} welcome credit`}>
          <span className="relative flex">
            <Icon name="gift" size={16} className="text-accent" />
            <span className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-accent" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">{amount} for you</span>
        </button>
      )}

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !done) later(); }}>
            <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title"
              onKeyDown={(e) => { if (e.key === 'Escape') { if (done) setOpen(false); else later(); } }}
              className="pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-elevated shadow-2xl outline-none">
              {done ? (
                <div className="space-y-4 p-6 text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary"><Icon name="check" size={34} strokeWidth={2.5} /></span>
                  <h2 id="welcome-title" className="text-2xl">{done === 'wallet' ? `${amount} is in your wallet` : 'Welcome to Dodo Pro'}</h2>
                  <p className="text-muted">
                    {done === 'wallet'
                      ? 'Use it as your stake in a money game. It can’t be withdrawn, but anything you win with it can.'
                      : `You have Pro for ${offer?.proDays ?? 30} days${offer?.pro ? ', added on to the time you already had' : ''}. Enjoy the extras.`}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href={done === 'wallet' ? '/wallet' : '/pro'} className="btn btn-primary" onClick={() => setOpen(false)}>
                      <Icon name={done === 'wallet' ? 'wallet' : 'star'} size={16} />{done === 'wallet' ? 'Open my wallet' : 'See my Pro perks'}
                    </Link>
                    <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Start playing</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative overflow-hidden bg-gradient-to-br from-accent/30 via-primary/20 to-transparent px-6 pb-5 pt-6 text-center">
                    <span className="pop-in mx-auto mb-2 grid h-16 w-16 place-items-center rounded-2xl bg-accent text-white shadow-lg"><Icon name="gift" size={34} /></span>
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted">Welcome{offer ? `, ${offer.username}` : ''}</p>
                    <h2 id="welcome-title" className="text-3xl">You get {amount}!</h2>
                    <p className="mt-1 text-sm text-muted">A gift for joining Dodo in November or December. Choose what to do with it:</p>
                  </div>

                  <div className="space-y-3 p-4 sm:p-5" role="radiogroup" aria-label="What to do with your welcome credit">
                    <button type="button" role="radio" aria-checked={pick === 'wallet'} disabled={!offer?.canWallet} onClick={() => setPick('wallet')}
                      className={`flex w-full gap-3 rounded-xl border-2 p-4 text-left transition ${pick === 'wallet' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent"><Icon name="wallet" size={22} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-heading">Keep {amount} in my wallet</span>
                        <span className="block text-sm text-muted">
                          {offer?.canWallet
                            ? 'Use it as your stake in money games. It can’t be withdrawn, but what you win with it can.'
                            : 'Playing for money is for players aged 18 and over, so this isn’t available on your account.'}
                        </span>
                      </span>
                      <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${pick === 'wallet' ? 'border-[6px] border-primary' : 'border-border'}`} aria-hidden="true" />
                    </button>

                    <button type="button" role="radio" aria-checked={pick === 'pro'} onClick={() => setPick('pro')}
                      className={`flex w-full gap-3 rounded-xl border-2 p-4 text-left transition ${pick === 'pro' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary"><Icon name="star" size={22} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-heading">Get a month of Pro <span className="chip chip-accent ml-1 px-1.5 py-0 text-[10px]">{offer?.proDays ?? 30} DAYS</span></span>
                        <span className="block text-sm text-muted">{offer?.pro ? 'Added on to the Pro time you already have.' : 'Worth the same as paying for it. You get:'}</span>
                        <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                          {PRO_PERKS.slice(0, 4).map((p) => <li key={p} className="flex gap-1.5"><Icon name="check" size={13} className="mt-px text-primary" />{p}</li>)}
                        </ul>
                      </span>
                      <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${pick === 'pro' ? 'border-[6px] border-primary' : 'border-border'}`} aria-hidden="true" />
                    </button>

                    {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
                    <button type="button" className="btn btn-primary btn-lg w-full" disabled={!pick || busy} onClick={confirm}>
                      {busy ? 'Saving…' : pick === 'wallet' ? `Put ${amount} in my wallet` : pick === 'pro' ? 'Start my month of Pro' : 'Choose an option'}
                    </button>
                    <p className="text-center text-xs text-muted">You can only choose once.</p>
                    <button type="button" className="btn btn-ghost w-full" onClick={later}>Remind me later</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
