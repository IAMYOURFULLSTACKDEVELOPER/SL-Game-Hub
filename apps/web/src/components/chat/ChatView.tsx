'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { playerMessage } from '@slgh/shared/src/errors';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { sfx } from '@/lib/sound';

// One conversation: a public chat room or a group channel. Live through a Convex subscription.
// Reply to a message, react with an emoji, edit or delete your own messages, see who is typing,
// mention someone with @name, and tap links. Enter sends, Shift+Enter starts a new line,
// Esc cancels a reply or edit, and ↑ in an empty box edits your last message.

export type ChatWhere = { room: Id<'chat_rooms'> } | { channel: Id<'group_channels'> };
type List = NonNullable<ReturnType<typeof useQuery<typeof api.messaging.list>>>;
type Msg = List['messages'][number];

const MAX = 500;
const GROUP_GAP_MS = 5 * 60_000; // messages this close from the same person are shown together
const TYPING_PING_MS = 3000;

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function dayLabel(ms: number) {
  const d = new Date(ms), today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Links become tappable and @mentions stand out (yours most of all). */
function RichText({ text, me }: { text: string; me: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+|@[A-Za-z0-9_]{2,20})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p)) {
          const href = p.replace(/[.,!?)]+$/, '');
          return <Fragment key={i}><a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold text-secondary underline">{href}</a>{p.slice(href.length)}</Fragment>;
        }
        if (/^@[A-Za-z0-9_]{2,20}$/.test(p)) {
          const mine = p.slice(1).toLowerCase() === me.toLowerCase();
          return <span key={i} className={`rounded px-0.5 font-semibold ${mine ? 'bg-accent/25 text-heading' : 'bg-primary/15 text-primary'}`}>{p}</span>;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function ChatView({ where, header, className = '' }: { where: ChatWhere; header?: ReactNode; className?: string }) {
  const data = useQuery(api.messaging.list, { where });
  const sendM = useMutation(api.messaging.send);
  const editM = useMutation(api.messaging.edit);
  const removeM = useMutation(api.messaging.remove);
  const reactM = useMutation(api.messaging.react);
  const typingM = useMutation(api.messaging.typing);
  const markReadM = useMutation(api.messaging.markRead);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: Id<'chat_messages'>; author: string; text: string } | null>(null);
  const [editing, setEditing] = useState<Id<'chat_messages'> | null>(null);
  const [active, setActive] = useState<string | null>(null); // message whose actions are open (tap on phones)
  const [picker, setPicker] = useState<string | null>(null); // message whose emoji picker is open
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [mentionAt, setMentionAt] = useState(0);

  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastPing = useRef(0);
  const lastCount = useRef(0);
  const whereKey = 'room' in where ? `r${where.room}` : `c${where.channel}`;

  // Starting a new conversation: clear the box and jump to the newest message
  useEffect(() => {
    setText(''); setReplyTo(null); setEditing(null); setError(''); setUnseen(0); lastCount.current = 0;
  }, [whereKey]);

  const messages = data?.messages ?? [];
  const me = data?.me.username ?? '';

  // Stick to the bottom when new messages come in, unless you scrolled up to read
  useEffect(() => {
    const el = scroller.current;
    if (!el || !data) return;
    const grew = messages.length - lastCount.current;
    const first = lastCount.current === 0;
    lastCount.current = messages.length;
    const lastMine = messages.at(-1)?.mine;
    if (first || atBottom || lastMine) el.scrollTo({ top: el.scrollHeight, behavior: first ? 'auto' : 'smooth' });
    else if (grew > 0) setUnseen((n) => n + grew);
  }, [messages.length, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading the latest messages clears the unread count
  useEffect(() => {
    if (!data || !atBottom || document.visibilityState !== 'visible') return;
    const t = setTimeout(() => { markReadM({ where }).catch(() => {}); }, 600);
    return () => clearTimeout(t);
  }, [messages.length, atBottom, whereKey, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  // "is typing" fades out on its own: re-check the clock while anyone is typing
  const typingNow = (data?.typing ?? []).filter((t) => t.until > now);
  useEffect(() => {
    if (!data?.typing.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data?.typing.length]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
  };
  const toBottom = () => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); setUnseen(0); };

  // Grow the box with what you type (up to a few lines)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const pingTyping = () => {
    const t = Date.now();
    if (t - lastPing.current < TYPING_PING_MS) return;
    lastPing.current = t;
    typingM({ where }).catch(() => {});
  };

  // @mention suggestions from the people in this conversation
  const people = useMemo(() => [...new Set(messages.map((m) => m.author.username))].filter((u) => u !== me), [messages, me]);
  const mention = (() => {
    const upto = text.slice(0, box.current?.selectionStart ?? text.length);
    const m = /(?:^|\s)@([A-Za-z0-9_]{0,20})$/.exec(upto);
    if (!m) return null;
    const q = m[1].toLowerCase();
    const list = people.filter((u) => u.toLowerCase().startsWith(q)).slice(0, 5);
    return list.length ? { q, list, start: upto.length - m[1].length - 1 } : null;
  })();
  const pickMention = (u: string) => {
    if (!mention) return;
    const pos = box.current?.selectionStart ?? text.length;
    setText(`${text.slice(0, mention.start)}@${u} ${text.slice(pos)}`);
    setMentionAt(0);
    box.current?.focus();
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true); setError('');
    try {
      if (editing) await editM({ messageId: editing, content });
      else await sendM({ where, content, ...(replyTo ? { replyTo: replyTo.id } : {}) });
      setText(''); setReplyTo(null); setEditing(null);
      sfx(editing ? 'click' : 'pop');
    } catch (e) {
      setError(playerMessage(e));
    } finally {
      setSending(false);
    }
  };

  const startEdit = useCallback((m: Msg) => {
    setEditing(m.id); setReplyTo(null); setText(m.content); setActive(null);
    setTimeout(() => box.current?.focus(), 0);
  }, []);
  const startReply = (m: Msg) => {
    setReplyTo({ id: m.id, author: m.author.username, text: m.content.slice(0, 120) });
    setEditing(null); setActive(null);
    box.current?.focus();
  };
  const react = (m: Msg, emoji: string) => {
    setPicker(null); setActive(null);
    reactM({ messageId: m.id, emoji }).then(() => sfx('pop')).catch((e) => setError(playerMessage(e)));
  };
  const remove = (m: Msg) => {
    setActive(null);
    if (!confirm(m.mine ? 'Delete your message?' : `Delete ${m.author.username}'s message?`)) return;
    removeM({ messageId: m.id }).catch((e) => setError(playerMessage(e)));
  };
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-accent');
    setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 1400);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); pickMention(mention.list[mentionAt % mention.list.length]); return; }
    if (mention && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setMentionAt((i) => i + (e.key === 'ArrowDown' ? 1 : mention.list.length - 1)); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); return; }
    if (e.key === 'Escape') { setReplyTo(null); if (editing) { setEditing(null); setText(''); } return; }
    if (e.key === 'ArrowUp' && !text) {
      const last = [...messages].reverse().find((m) => m.mine);
      if (last) { e.preventDefault(); startEdit(last); }
    }
  };

  if (data === undefined) {
    return <div className={`flex items-center justify-center text-muted ${className}`}><span className="loading-dots">Loading messages</span></div>;
  }

  return (
    <section className={`relative flex min-h-0 flex-col ${className}`} aria-label={`${data.title} chat`}>
      {header ?? (
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Icon name={'room' in where ? 'chat' : 'hash'} size={18} className="text-muted" />
          <h2 className="truncate text-base">{data.title.replace(/^#/, '')}</h2>
          {data.topic && <span className="hidden truncate text-sm text-muted sm:inline">· {data.topic}</span>}
        </header>
      )}

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="icon-badge icon-badge-blue h-14 w-14 rounded-2xl"><Icon name="chat" size={28} /></span>
            <p className="font-semibold">Welcome to {data.title}!</p>
            <p className="text-sm text-muted">No messages yet. Say hello 👋</p>
          </div>
        ) : messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const joined = !newDay && !m.reply && prev && prev.author.id === m.author.id && m.createdAt - prev.createdAt < GROUP_GAP_MS;
          const mentionsMe = !!me && new RegExp(`@${me}\\b`, 'i').test(m.content);
          const open = active === m.id;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-xs font-semibold text-muted" role="separator">
                  <span className="h-px flex-1 bg-border/70" />{dayLabel(m.createdAt)}<span className="h-px flex-1 bg-border/70" />
                </div>
              )}
              <div
                id={`msg-${m.id}`}
                className={`group relative flex gap-3 rounded-xl px-2 transition-colors ${joined ? 'py-0.5' : 'mt-2 py-1'} ${mentionsMe ? 'border-l-2 border-accent bg-accent/10' : 'hover:bg-bg/60'} ${open ? 'bg-bg/60' : ''}`}
                onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; setActive(open ? null : m.id); setPicker(null); }}
              >
                <div className="w-9 shrink-0">
                  {joined ? <span className="invisible block pt-1 text-[10px] text-muted group-hover:visible">{time(m.createdAt)}</span> : <Avatar id={m.author.avatar} size={36} />}
                </div>
                <div className="min-w-0 flex-1">
                  {m.reply && (
                    <button type="button" onClick={() => jumpTo(m.reply!.id)} className="mb-0.5 flex max-w-full items-center gap-1 truncate text-xs text-muted hover:text-text">
                      <span aria-hidden>↱</span><b className="shrink-0">@{m.reply.author}</b><span className="truncate">{m.reply.text}</span>
                    </button>
                  )}
                  {!joined && (
                    <div className="flex items-baseline gap-2">
                      <span className={`font-semibold ${m.mine ? 'text-primary' : 'text-heading'}`}>{m.author.username}</span>
                      <span className="text-xs text-muted">{time(m.createdAt)}</span>
                    </div>
                  )}
                  <p className={`whitespace-pre-wrap break-words text-[15px] leading-snug ${editing === m.id ? 'opacity-50' : ''}`}>
                    <RichText text={m.content} me={me} />
                    {m.edited && <span className="ml-1 text-[11px] text-muted">(edited)</span>}
                  </p>
                  {m.reactions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.reactions.map((r) => (
                        <button key={r.emoji} type="button" onClick={() => react(m, r.emoji)} aria-pressed={r.mine}
                          aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition active:scale-95 ${r.mine ? 'border-primary/60 bg-primary/15' : 'border-border bg-surface hover:border-primary/40'}`}>
                          <span>{r.emoji}</span><span className="text-xs font-semibold">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* actions: on hover with a mouse, on tap on phones */}
                <div className={`absolute -top-3 right-2 z-10 items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5 shadow-lg ${open ? 'flex' : 'hidden [@media(hover:hover)]:group-hover:flex'}`}>
                  {data.reactions.slice(0, 3).map((e) => (
                    <button key={e} type="button" className="grid h-8 w-8 place-items-center rounded-lg text-base hover:bg-bg" onClick={() => react(m, e)} aria-label={`React ${e}`}>{e}</button>
                  ))}
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bg" onClick={() => setPicker(picker === m.id ? null : m.id)} aria-label="More reactions" aria-expanded={picker === m.id}>
                    <Icon name="plus" size={16} />
                  </button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bg" onClick={() => startReply(m)} aria-label="Reply">
                    <span aria-hidden className="text-base">↩</span>
                  </button>
                  {m.mine && (
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bg" onClick={() => startEdit(m)} aria-label="Edit">
                      <Icon name="pencil" size={15} />
                    </button>
                  )}
                  {m.canDelete && (
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10" onClick={() => remove(m)} aria-label="Delete">
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                {picker === m.id && (
                  <div className="absolute right-2 top-7 z-20 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-xl" role="menu" aria-label="Reactions">
                    {data.reactions.map((e) => (
                      <button key={e} type="button" role="menuitem" className="grid h-9 w-9 place-items-center rounded-lg text-lg transition hover:scale-110 hover:bg-bg" onClick={() => react(m, e)}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {unseen > 0 && (
        <button type="button" onClick={toBottom} className="pop-in absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
          {unseen} new {unseen === 1 ? 'message' : 'messages'} ↓
        </button>
      )}

      <div className="border-t border-border/60 p-2 sm:p-3">
        <p className="h-5 px-1 text-xs text-muted" aria-live="polite">
          {typingNow.length > 0 && (
            <span className="loading-dots">
              {typingNow.length === 1 ? `${typingNow[0].username} is typing` : typingNow.length === 2 ? `${typingNow[0].username} and ${typingNow[1].username} are typing` : 'Several people are typing'}
            </span>
          )}
        </p>
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-bg/70 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {editing ? <><Icon name="pencil" size={13} className="mr-1 inline-block" />Editing your message</> : <>Replying to <b>@{replyTo!.author}</b>: <span className="text-muted">{replyTo!.text}</span></>}
            </span>
            <button type="button" className="text-muted hover:text-text" aria-label="Cancel" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(''); } }}><Icon name="close" size={16} /></button>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-sm font-semibold text-danger">{error}</p>}
        <div className="relative flex items-end gap-2">
          {mention && (
            <ul className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl" role="listbox" aria-label="Mention someone">
              {mention.list.map((u, i) => (
                <li key={u}>
                  <button type="button" role="option" aria-selected={i === mentionAt % mention.list.length}
                    className={`w-full px-3 py-2 text-left text-sm ${i === mentionAt % mention.list.length ? 'bg-primary/15' : 'hover:bg-bg'}`}
                    onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>@{u}</button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={box}
            rows={1}
            value={text}
            maxLength={MAX}
            onChange={(e) => { setText(e.target.value); setError(''); setMentionAt(0); if (e.target.value) pingTyping(); }}
            onKeyDown={onKey}
            placeholder={`Message ${data.title}`}
            aria-label={`Message ${data.title}`}
            className="input max-h-[140px] min-h-[44px] flex-1 resize-none py-2.5"
          />
          <button type="button" onClick={() => void submit()} disabled={!text.trim() || sending}
            className="btn btn-primary h-11 min-h-0 w-11 shrink-0 rounded-xl p-0" aria-label={editing ? 'Save' : 'Send'}>
            {editing ? <Icon name="check" size={18} /> : <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>}
          </button>
        </div>
        <p className="mt-1 flex justify-between px-1 text-[11px] text-muted">
          <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · @ to mention</span>
          {text.length > MAX - 80 && <span className={text.length >= MAX ? 'text-danger' : ''}>{text.length}/{MAX}</span>}
        </p>
      </div>
    </section>
  );
}
