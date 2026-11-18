// The emails Dodo sends, as plain functions: data in, { subject, html, text } out.
// No Convex imports, so they can be rendered and previewed anywhere. Sending lives in convex/emails.ts.
//
// Email HTML is its own world: tables for layout, inline styles only, no web fonts or CSS variables,
// and a light card so it reads the same in Gmail, Outlook and phone mail apps.

export type Mail = { subject: string; html: string; text: string };
/** Who the email is for, and where the site lives (links are absolute). */
export type Who = { site: string; name: string; username: string };

const C = {
  page: '#eef0f3', card: '#ffffff', ink: '#1e1f22', body: '#4e5058', muted: '#80848e', line: '#e3e5e8',
  brand: '#5865f2', green: '#23a55a', gold: '#d4a017', red: '#e03c31', rail: '#1e1f22',
};
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (who: Who, path: string) => `${who.site}${path}`;

/** 23276123456 -> +232 76 123 456 */
export const prettyPhone = (msisdn: string) => {
  const m = /^232(\d{2})(\d{3})(\d{3})$/.exec(msisdn);
  return m ? `+232 ${m[1]} ${m[2]} ${m[3]}` : msisdn;
};

type Tone = 'brand' | 'green' | 'gold' | 'red';
type Row = [label: string, value: string, strong?: boolean];
type Block = { p: string } | { rows: Row[] } | { note: string };

type Spec = {
  subject: string;
  preheader: string; // the grey preview line in the inbox
  tag: string; // small label above the heading
  tone: Tone;
  heading: string;
  blocks: Block[];
  cta?: { label: string; path: string };
  /** Reminder-type emails say how to turn them off; account and money emails don't (they always go). */
  optional?: boolean;
};

function render(who: Who, s: Spec): Mail {
  const tone = C[s.tone];
  const blockHtml = s.blocks.map((b) => {
    if ('p' in b) return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.body}">${b.p}</p>`;
    if ('note' in b) {
      return `<p style="margin:4px 0 14px;padding:12px 14px;border-radius:10px;background:#f6f7f9;font-size:13px;line-height:1.55;color:${C.muted}">${b.note}</p>`;
    }
    const rows = b.rows.map(([k, v, strong], i) => `
          <tr>
            <td style="padding:10px 14px;font-size:14px;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ''}">${esc(k)}</td>
            <td align="right" style="padding:10px 14px;font-size:14px;color:${C.ink};font-weight:${strong ? 800 : 600};${i ? `border-top:1px solid ${C.line};` : ''}">${v}</td>
          </tr>`).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate">${rows}
        </table>`;
  }).join('\n');

  const cta = s.cta ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
          <td style="border-radius:10px;background:${C.brand}">
            <a href="${esc(link(who, s.cta.path))}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(s.cta.label)}</a>
          </td>
        </tr></table>` : '';

  const why = s.optional
    ? `You're getting this because you have reminders on. <a href="${esc(link(who, '/profile#emails'))}" style="color:${C.muted}">Turn off reminder emails</a>.`
    : `You're getting this because it's about your Dodo account.`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(s.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(s.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 14px">
      <a href="${esc(who.site)}" style="text-decoration:none">
        <img src="${esc(link(who, '/icons/icon-192.png'))}" width="36" height="36" alt="" style="vertical-align:middle;border-radius:10px;border:0">
        <span style="vertical-align:middle;margin-left:8px;font-size:20px;font-weight:900;letter-spacing:-.02em;color:${C.ink}">Dodo</span>
      </a>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="height:5px;background:${tone};border-radius:16px 16px 0 0"></div>
      <div style="padding:26px 26px 22px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${tone}">${esc(s.tag)}</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:900;letter-spacing:-.01em;color:${C.ink}">${s.heading}</h1>
        ${blockHtml}
        ${cta}
      </div>
    </td></tr>
    <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
      ${why}<br>
      Dodo · Games from Salone · <a href="${esc(who.site)}" style="color:${C.muted}">${esc(who.site.replace(/^https?:\/\//, ''))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  // The plain-text part: same words, no markup
  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const text = [
    strip(s.heading), '',
    ...s.blocks.map((b) => ('p' in b ? strip(b.p) : 'note' in b ? strip(b.note) : b.rows.map(([k, v]) => `${k}: ${strip(v)}`).join('\n'))),
    ...(s.cta ? ['', `${s.cta.label}: ${link(who, s.cta.path)}`] : []),
    '', '--', strip(why), `Dodo · ${who.site}`,
  ].join('\n');

  return { subject: s.subject, html, text };
}

const hi = (who: Who) => `Hi ${esc(who.name)},`;
const b = (s: string) => `<strong style="color:${C.ink}">${esc(s)}</strong>`;

// ---------------------------------------------------------------------------------------------
// Account

export const welcome = (who: Who, o: { welcomeCredit?: string; walletOk?: boolean }): Mail => render(who, {
  subject: 'Welcome to Dodo',
  preheader: 'Your account is ready. Pick a game and play.',
  tag: 'Welcome', tone: 'brand',
  heading: `Welcome to Dodo, ${esc(who.name)}!`,
  blocks: [
    { p: `Your account ${b('@' + who.username)} is ready. Play UNO, Chess, Checkers, Scrabble, Salone-Poly and more, on your own, against the computer, or online with friends.` },
    ...(o.welcomeCredit
      ? [{ p: o.walletOk
        ? `As a welcome gift you can claim ${b(o.welcomeCredit)}: take it as wallet credit to play with, or as 30 days of Dodo Pro. Find it on your home page.`
        : `As a welcome gift you can claim ${b('30 days of Dodo Pro')} for free. Find it on your home page.` }]
      : []),
    { rows: [
      ['Play with friends', 'Create a room and share the code'],
      ['Come back anytime', 'Your recent rooms stay open for 7 days'],
      ['Climb the ranks', 'Every win counts on the leaderboard'],
    ] },
  ],
  cta: { label: 'Start playing', path: '/games' },
});

// ---------------------------------------------------------------------------------------------
// Money

export const topUp = (who: Who, o: { amount: string; balance: string }): Mail => render(who, {
  subject: `${o.amount} added to your Dodo wallet`,
  preheader: `Your mobile money top-up arrived. Balance: ${o.balance}.`,
  tag: 'Top-up received', tone: 'green',
  heading: `${esc(o.amount)} is in your wallet`,
  blocks: [
    { p: `${hi(who)} your mobile money payment came through and the money is ready to play with.` },
    { rows: [['Added', esc(o.amount)], ['Wallet balance', esc(o.balance), true]] },
  ],
  cta: { label: 'Open your wallet', path: '/wallet' },
});

export const proActive = (who: Who, o: { until: string; paid?: string; gift?: boolean }): Mail => render(who, {
  subject: o.gift ? 'Your Dodo Pro gift is active' : 'Dodo Pro is active',
  preheader: `Pro is on until ${o.until}.`,
  tag: 'Dodo Pro', tone: 'gold',
  heading: o.gift ? 'Enjoy 30 days of Pro, on us' : 'Thanks for going Pro!',
  blocks: [
    { p: `${hi(who)} Dodo Pro is now active on ${b('@' + who.username)}.` },
    { rows: [
      ...(o.paid ? [['Paid', esc(o.paid)] as Row] : []),
      ['Pro until', esc(o.until), true],
    ] },
    { p: 'With Pro you can create unlimited online rooms, start groups, talk in voice chat, and withdraw with a lower fee.' },
    { note: 'Pro never renews by itself. We\'ll email you a few days before it ends.' },
  ],
  cta: { label: 'Play now', path: '/games' },
});

type Payout = { amount: string; fee: string; receive: string; phone: string; provider: string };
const payoutRows = (o: Payout): Row[] => [
  ['Amount', esc(o.amount)],
  ['Fee', esc(o.fee)],
  ['You receive', esc(o.receive), true],
  ['To', `${esc(o.provider)} ${esc(prettyPhone(o.phone))}`],
];

export const withdrawalRequested = (who: Who, o: Payout): Mail => render(who, {
  subject: `We got your withdrawal request for ${o.receive}`,
  preheader: 'It is waiting for approval. We\'ll email you when it is paid.',
  tag: 'Withdrawal requested', tone: 'brand',
  heading: 'Your withdrawal is on its way to review',
  blocks: [
    { p: `${hi(who)} we received your request. The money is held from your wallet while a Dodo admin checks it, and we'll email you when it is paid.` },
    { rows: payoutRows(o) },
    { note: 'Changed your mind? You can cancel from your wallet until it is approved. If you didn\'t ask for this, change your password and contact us right away.' },
  ],
  cta: { label: 'View in your wallet', path: '/wallet' },
});

export const withdrawalPaid = (who: Who, o: Payout): Mail => render(who, {
  subject: `${o.receive} sent to your ${o.provider}`,
  preheader: `Your withdrawal is paid to ${prettyPhone(o.phone)}.`,
  tag: 'Withdrawal paid', tone: 'green',
  heading: `${esc(o.receive)} is on your phone`,
  blocks: [
    { p: `${hi(who)} your withdrawal has been paid. It should show in your ${esc(o.provider)} account now.` },
    { rows: payoutRows(o) },
  ],
  cta: { label: 'View in your wallet', path: '/wallet' },
});

export const withdrawalReturned = (who: Who, o: { amount: string; declined: boolean; balance: string }): Mail => render(who, {
  subject: o.declined ? 'Your withdrawal was declined' : 'Your withdrawal didn\'t go through',
  preheader: `${o.amount} is back in your Dodo wallet.`,
  tag: o.declined ? 'Withdrawal declined' : 'Withdrawal failed', tone: 'red',
  heading: `${esc(o.amount)} is back in your wallet`,
  blocks: [
    { p: o.declined
      ? `${hi(who)} a Dodo admin declined your withdrawal, so the full amount has been returned to your wallet.`
      : `${hi(who)} the mobile money payout failed, so the full amount has been returned to your wallet. Check your number and try again.` },
    { rows: [['Returned', esc(o.amount)], ['Wallet balance', esc(o.balance), true]] },
  ],
  cta: { label: 'Open your wallet', path: '/wallet' },
});

export const adminWithdrawal = (who: Who, o: Payout & { player: string }): Mail => render(who, {
  subject: `Withdrawal to approve: ${o.amount} from @${o.player}`,
  preheader: `${o.player} asked to withdraw ${o.amount}.`,
  tag: 'Admin · needs approval', tone: 'gold',
  heading: 'A withdrawal is waiting for you',
  blocks: [
    { p: `${b('@' + o.player)} asked to withdraw money. Check it and approve or decline it.` },
    { rows: payoutRows(o) },
  ],
  cta: { label: 'Review withdrawals', path: '/admin/wallet' },
});

// ---------------------------------------------------------------------------------------------
// Reminders and invites (optional: players can turn these off)

type Game = { title: string; gameName: string; when: string; host: string; tournament: boolean };

export const gameReminder = (who: Who, o: Game & { minutes: number; isHost: boolean; path: string }): Mail => render(who, {
  subject: `Starting in ${o.minutes} min: ${o.title}`,
  preheader: `${o.gameName} at ${o.when}.`,
  tag: 'Starting soon', tone: 'brand',
  heading: `${esc(o.title)} starts in ${o.minutes} minutes`,
  blocks: [
    { p: o.isHost
      ? `${hi(who)} the ${o.tournament ? 'tournament' : 'game'} you scheduled is almost here. Open the room so your players can join.`
      : `${hi(who)} the ${o.tournament ? 'tournament' : 'game'} you said you'd join is almost here.` },
    { rows: [['Game', esc(o.gameName)], ['Starts', esc(o.when), true], ['Host', esc('@' + o.host)]] },
  ],
  cta: { label: o.isHost ? 'Open the room' : 'Get ready', path: o.path },
  optional: true,
});

export const scheduleInvite = (who: Who, o: Game): Mail => render(who, {
  subject: `@${o.host} invited you: ${o.title}`,
  preheader: `${o.gameName}, ${o.when}. Say if you're coming.`,
  tag: 'You\'re invited', tone: 'brand',
  heading: `Join ${esc('@' + o.host)} for ${esc(o.title)}`,
  blocks: [
    { p: `${hi(who)} ${b('@' + o.host)} invited you to ${o.tournament ? 'a tournament' : 'a game'}.` },
    { rows: [['Game', esc(o.gameName)], ['When', esc(o.when), true]] },
    { p: 'Say if you\'re coming and we\'ll remind you 30 minutes before it starts.' },
  ],
  cta: { label: 'Answer the invite', path: '/schedule' },
  optional: true,
});

export const proEnding = (who: Who, o: { until: string; price: string }): Mail => render(who, {
  subject: 'Your Dodo Pro ends soon',
  preheader: `Pro ends ${o.until}. Renew to keep unlimited rooms.`,
  tag: 'Dodo Pro', tone: 'gold',
  heading: `Your Pro ends on ${esc(o.until)}`,
  blocks: [
    { p: `${hi(who)} Dodo Pro on ${b('@' + who.username)} ends on ${b(o.until)}. After that you go back to 10 new rooms a day, and groups and voice chat need Pro again.` },
    { p: `Renew for ${b(o.price)} to add 30 more days. Your days add on, so renewing early loses nothing.` },
  ],
  cta: { label: 'Renew Pro', path: '/pro' },
  optional: true,
});
