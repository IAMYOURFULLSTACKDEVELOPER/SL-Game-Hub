import React, { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '@slgh/shared';
import {
  MOMO_PROVIDERS, WALLET_LIMITS, displaySlPhone, formatLeones, parseLeones, providerName, ussdHref,
} from '@slgh/shared/src/wallet';
import { api } from '@/convex';
import { useAuth } from '@/auth';
import { useColors } from '@/theme';
import { Banner, Button, Card, Chip, Field, Loading, Screen, Txt } from '@/ui';

const message = (e: unknown) => (e instanceof ConvexError ? String(e.data) : t('common.offline'));
const QUICK = [1_000, 2_500, 5_000, 10_000];

/** Wallet: top up by dialling a Monime USSD code straight from the app, withdraw to mobile money. */
export default function Wallet() {
  const router = useRouter();
  const c = useColors();
  const { me, loading } = useAuth();
  const w = useQuery(api.wallet.summary, me ? {} : 'skip');
  const createDeposit = useMutation(api.wallet.createDeposit);
  const cancelDeposit = useMutation(api.wallet.cancelDeposit);
  const refresh = useAction(api.monime.refreshDeposit);
  const requestWithdrawal = useMutation(api.wallet.requestWithdrawal);
  const [amount, setAmount] = useState('');
  const [out, setOut] = useState({ amount: '', phone: '', provider: MOMO_PROVIDERS[0].id as string });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading || (me && w === undefined)) return <Screen><Loading /></Screen>;
  if (!me || !w) return (
    <Screen><Card><Txt>Sign in to use your wallet.</Txt>
      <Button title={t('nav.signIn')} onPress={() => router.push('/login')} /></Card></Screen>);
  if (!w.eligible) return (
    <Screen><Card><Txt bold>The wallet is for players aged 18 and over.</Txt>
      <Txt muted>Every game is still free to play.</Txt></Card></Screen>);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setErr(''); setOk(''); setBusy(true);
    try { await fn(); if (done) setOk(done); } catch (e) { setErr(message(e)); }
    setBusy(false);
  };
  const topUp = () => {
    const minor = parseLeones(amount);
    if (minor === null) { setErr('Enter an amount in leones, e.g. 25.'); return; }
    void run(async () => { await createDeposit({ amount: minor }); setAmount(''); });
  };
  const withdraw = () => {
    const minor = parseLeones(out.amount);
    if (minor === null) { setErr('Enter an amount in leones, e.g. 25.'); return; }
    void run(async () => {
      await requestWithdrawal({ amount: minor, phone: out.phone, provider: out.provider });
      setOut({ ...out, amount: '' });
    }, 'Request received. It is sent once it has been approved.');
  };
  const pending = w.deposits.filter((d) => d.status === 'creating' || d.status === 'pending');

  return (
    <Screen>
      <Card>
        <Txt muted>Available</Txt>
        <Txt size={36} bold>{formatLeones(w.balance)}</Txt>
        <Txt muted>Held in games and withdrawals: {formatLeones(w.held)}</Txt>
      </Card>
      <Banner text={err} /><Banner kind="ok" text={ok} />

      {pending.map((d) => (
        <Card key={d.id}>
          {d.status === 'creating' ? <Txt muted>Getting a USSD code for {formatLeones(d.amount)}…</Txt> : (
            <>
              <Txt muted>Top up {formatLeones(d.amount)}: dial</Txt>
              <Txt size={30} bold color={c.primary}>{d.ussd_code}</Txt>
              <Button title="📞 Dial now" onPress={() => d.ussd_code && void Linking.openURL(ussdHref(d.ussd_code))} />
              <Txt size={14} muted>Enter your mobile money PIN when asked. Your balance updates by itself once it is paid.</Txt>
              <Button variant="outline" title="I've paid, check now" loading={busy}
                onPress={() => void run(async () => {
                  const s = await refresh({ id: d.id });
                  if (s === 'pending' || s === 'processing') throw new ConvexError('Not paid yet. It can take a minute after you approve.');
                })} />
              <Button variant="outline" title="Cancel" onPress={() => void run(() => cancelDeposit({ id: d.id }))} />
            </>
          )}
        </Card>
      ))}

      <Card>
        <Txt size={20} bold>Top up with mobile money</Txt>
        {!w.configured ? <Txt muted>Mobile money top-ups are not switched on yet.</Txt> : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK.map((q) => <Chip key={q} label={formatLeones(q)} selected={parseLeones(amount) === q} onPress={() => setAmount(String(q / 100))} />)}
            </View>
            <Field label="Amount (SLE)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              hint={`${formatLeones(WALLET_LIMITS.minDeposit)} to ${formatLeones(WALLET_LIMITS.maxDeposit)}`} />
            <Button title="Get USSD code" onPress={topUp} loading={busy} disabled={!amount} />
          </>
        )}
      </Card>

      <Card>
        <Txt size={20} bold>Withdraw</Txt>
        <Field label="Amount (SLE)" value={out.amount} onChangeText={(v) => setOut({ ...out, amount: v })} keyboardType="decimal-pad" />
        <Field label="Mobile number" value={out.phone} onChangeText={(v) => setOut({ ...out, phone: v })} keyboardType="phone-pad" placeholder="076 123 456" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MOMO_PROVIDERS.map((p) => <Chip key={p.id} label={p.name} selected={out.provider === p.id} onPress={() => setOut({ ...out, provider: p.id })} />)}
        </View>
        <Button title="Withdraw to mobile money" onPress={withdraw} loading={busy} disabled={w.balance < WALLET_LIMITS.minWithdrawal} />
        {w.withdrawals.slice(0, 5).map((x) => (
          <Txt key={x.id} size={14} muted>{formatLeones(x.amount)} → {providerName(x.provider)} {displaySlPhone(x.phone)} · {x.status}</Txt>
        ))}
      </Card>

      <Card>
        <Txt size={20} bold>History</Txt>
        {w.transactions.length === 0 ? <Txt muted>Nothing yet.</Txt> : w.transactions.slice(0, 15).map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}><Txt size={15}>{x.description}</Txt></View>
            <Txt size={15} bold color={x.amount > 0 ? c.primary : x.amount < 0 ? c.danger : c.muted}>
              {x.amount > 0 ? '+' : ''}{x.amount !== 0 ? formatLeones(x.amount) : `held ${formatLeones(x.held_change)}`}
            </Txt>
          </View>
        ))}
      </Card>
      <Txt size={14} muted>To play for money, open Dice → Online on the website and create a money room.</Txt>
    </Screen>
  );
}
