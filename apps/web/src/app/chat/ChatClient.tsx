'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { ChatView, type ChatWhere } from '@/components/chat/ChatView';
import { Icon } from '@/components/Icon';

// Chat: public rooms for everyone, plus a channel list for each of your groups, with unread counts.
// The open conversation is in the address (?room=… or ?channel=…), so it can be shared and survives a reload.
// On phones the list and the conversation take turns on the screen.

const Badge = ({ n }: { n: number }) => (n > 0
  ? <span className="ml-auto grid min-w-[20px] place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{n > 50 ? '50+' : n}</span>
  : null);

export default function ChatClient() {
  const data = useQuery(api.messaging.sidebar);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const where: ChatWhere | null = useMemo(() => {
    const room = params.get('room'), channel = params.get('channel');
    if (room) return { room: room as Id<'chat_rooms'> };
    if (channel) return { channel: channel as Id<'group_channels'> };
    return null;
  }, [params]);

  // On a wide screen, open the first room straight away
  useEffect(() => {
    if (where || !data?.rooms.length || window.matchMedia('(max-width: 1023px)').matches) return;
    router.replace(`${path}?room=${data.rooms[0].id}`, { scroll: false });
  }, [where, data, path, router]);

  const open = (w: ChatWhere) => router.push(`${path}?${'room' in w ? `room=${w.room}` : `channel=${w.channel}`}`, { scroll: false });
  const isOpen = (w: ChatWhere) => !!where && JSON.stringify(where) === JSON.stringify(w);
  const totalUnread = (data?.rooms.reduce((n, r) => n + r.unread, 0) ?? 0)
    + (data?.groups.reduce((n, g) => n + g.channels.reduce((k, c) => k + c.unread, 0), 0) ?? 0);

  const item = (w: ChatWhere, label: string, unread: number, icon: 'chat' | 'hash', sub?: string | null) => (
    <button type="button" onClick={() => open(w)} aria-current={isOpen(w) ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${isOpen(w) ? 'bg-primary/15 font-semibold text-heading' : unread ? 'font-semibold text-heading hover:bg-bg/70' : 'text-muted hover:bg-bg/70 hover:text-text'}`}>
      <Icon name={icon} size={16} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-xs font-normal text-muted">{sub}</span>}
      </span>
      <Badge n={unread} />
    </button>
  );

  return (
    <main className="mx-auto flex h-[calc(100dvh-var(--top-h)-6rem)] max-w-6xl gap-3 p-2 sm:p-4 lg:h-[calc(100dvh-var(--top-h)-1rem)]">
      {/* the list */}
      <aside className={`card min-h-0 w-full flex-col overflow-hidden lg:flex lg:w-72 lg:shrink-0 ${where ? 'hidden' : 'flex'}`} aria-label="Conversations">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <h1 className="text-lg">Chat</h1>
          {totalUnread > 0 && <span className="chip chip-muted text-xs">{totalUnread > 50 ? '50+' : totalUnread} unread</span>}
        </div>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
          {data === undefined ? <p className="p-3 text-sm text-muted"><span className="loading-dots">Loading</span></p> : (
            <>
              {data.invites > 0 && (
                <Link href="/groups" className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 p-2.5 text-sm font-semibold">
                  <Icon name="mail" size={16} />{data.invites === 1 ? 'You have a group invite' : `You have ${data.invites} group invites`}
                </Link>
              )}
              <section>
                <p className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Public rooms</p>
                {data.rooms.length === 0 ? <p className="px-2.5 text-sm text-muted">No rooms yet.</p> : data.rooms.map((r) => (
                  <div key={r.id}>{item({ room: r.id }, r.name, r.unread, 'chat', r.description)}</div>
                ))}
              </section>
              <section>
                <div className="flex items-center px-2.5 pb-1">
                  <p className="flex-1 text-[11px] font-bold uppercase tracking-wide text-muted">Your groups</p>
                  <Link href="/groups" className="text-xs font-semibold text-secondary">Manage</Link>
                </div>
                {data.groups.length === 0 ? (
                  <p className="px-2.5 text-sm text-muted">Join or start a group to chat with your team. <Link href="/groups" className="font-semibold text-secondary">Groups</Link></p>
                ) : data.groups.map((g) => {
                  const unread = g.channels.reduce((n, c) => n + c.unread, 0);
                  const shut = collapsed[g.id];
                  return (
                    <div key={g.id} className="mb-1">
                      <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !shut }))} aria-expanded={!shut}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-bold text-heading hover:bg-bg/70">
                        <span className={`text-xs transition-transform ${shut ? '-rotate-90' : ''}`} aria-hidden>▾</span>
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        {shut && <Badge n={unread} />}
                      </button>
                      {!shut && (
                        <div className="ml-3 border-l border-border/60 pl-1">
                          {g.channels.map((c) => <div key={c.id}>{item({ channel: c.id }, c.name, c.unread, 'hash')}</div>)}
                          <Link href={`/groups/${g.id}`} className="block px-2.5 py-1 text-xs text-muted hover:text-text">Open group →</Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </nav>
      </aside>

      {/* the conversation */}
      <div className={`card min-h-0 flex-1 flex-col overflow-hidden ${where ? 'flex' : 'hidden lg:flex'}`}>
        {where ? (
          <>
            <button type="button" className="flex items-center gap-1 border-b border-border/60 px-3 py-2 text-sm font-semibold text-secondary lg:hidden" onClick={() => router.push(path)}>
              ← All conversations
            </button>
            <ChatView key={JSON.stringify(where)} where={where} className="min-h-0 flex-1" />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted">
            <Icon name="chat" size={32} />
            <p>Pick a room or one of your group&apos;s channels.</p>
          </div>
        )}
      </div>
    </main>
  );
}
