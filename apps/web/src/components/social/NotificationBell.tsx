'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { sfx } from '@/lib/sound';
import { FollowButton } from './Social';

// The bell in the top bar: follows, game invites, and games hosted or scheduled by people you follow.
// While the app is open in another tab or in the background, new ones also show as system alerts
// (once the player allows them from here).

const KIND_ICON: Record<string, IconName> = {
  follow: 'userPlus', game_invite: 'send', new_game: 'gamepad', game_open: 'play', group_invite: 'users',
};

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

const canAlert = () => typeof window !== 'undefined' && 'Notification' in window;

export function NotificationBell() {
  const data = useQuery(api.social.notifications, {});
  const markRead = useMutation(api.social.markRead);
  const markAll = useMutation(api.social.markAllRead);
  const remove = useMutation(api.social.removeNotification);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { setPerm(canAlert() ? Notification.permission : 'unsupported'); }, []);

  // New unread notifications: a chime, and a system alert if the page is hidden and alerts are allowed.
  useEffect(() => {
    if (!data) return;
    const unread = data.items.filter((n) => !n.read);
    if (seen.current === null) { seen.current = new Set(unread.map((n) => n.id)); return; } // first load: no noise
    const fresh = unread.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (!fresh.length) return;
    sfx('success', 0.6);
    if (document.visibilityState === 'visible' || !canAlert() || Notification.permission !== 'granted') return;
    for (const n of fresh.slice(0, 3)) {
      const opts: NotificationOptions = { body: n.text, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: n.id, data: { url: n.href } };
      navigator.serviceWorker?.getRegistration()
        .then((reg) => { if (reg) return reg.showNotification('Dodo', opts); new Notification('Dodo', opts); })
        .catch(() => {});
    }
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);

  if (data === undefined) return <span className="btn btn-icon" aria-hidden="true"><Icon name="bell" size={20} /></span>;
  const unread = data.unread;

  const go = (id: Id<'notifications'>, href: string, read: boolean) => {
    if (!read) markRead({ id }).catch(() => {});
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn btn-icon relative" aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} title="Notifications" onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[rgb(var(--c-bg))]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          className="pop-in fixed right-2 top-[calc(var(--top-h)+4px)] z-[70] flex max-h-[min(70vh,560px)] w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-border/60 bg-elevated shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <h3 className="flex-1 text-base">Notifications</h3>
            {unread > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => markAll({}).catch(() => {})}><Icon name="check" size={14} />Mark all read</button>}
          </div>
          {perm === 'default' && (
            <button type="button" className="flex items-center gap-2 border-b border-border/60 bg-primary/10 px-3 py-2 text-left text-sm"
              onClick={async () => { setPerm(await Notification.requestPermission()); }}>
              <Icon name="bell" size={16} className="text-primary" />
              <span className="flex-1"><b>Turn on alerts</b><span className="block text-xs text-muted">Hear about invites even when Dodo is in the background.</span></span>
            </button>
          )}
          <ul className="flex-1 overflow-y-auto p-1">
            {data.items.length === 0 && (
              <li className="flex flex-col items-center gap-1.5 p-8 text-center">
                <Icon name="bell" size={28} className="text-muted" />
                <p className="font-semibold">Nothing yet</p>
                <p className="text-xs text-muted">Follow friends to hear when they host a game or invite you to one.</p>
              </li>
            )}
            {data.items.map((n) => (
              <li key={n.id} className={`group relative flex gap-3 rounded-lg p-2 transition-colors hover:bg-hover ${n.read ? '' : 'bg-primary/5'}`}>
                <button type="button" className="absolute inset-0 rounded-lg" aria-label={n.text} onClick={() => go(n.id, n.href, n.read)} />
                <span className="relative shrink-0">
                  {n.actor ? <Avatar id={n.actor.avatar} size={38} /> : <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-primary/20"><Icon name="bell" size={18} /></span>}
                  <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-white ring-2 ring-[rgb(var(--c-elevated))]">
                    <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={11} strokeWidth={2.5} />
                  </span>
                </span>
                <span className="pointer-events-none relative min-w-0 flex-1">
                  <span className={`block text-sm ${n.read ? 'text-text' : 'font-semibold text-heading'}`}>{n.text}</span>
                  <span className="block text-xs text-muted">{ago(n.createdAt)}</span>
                  {n.kind === 'follow' && n.actor && !n.actor.iFollow && (
                    <span className="pointer-events-auto mt-1.5 inline-block">
                      <FollowButton person={{ id: n.actor.id, username: n.actor.username, iFollow: false, followsMe: true }} />
                    </span>
                  )}
                </span>
                {!n.read && <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="New" />}
                <button type="button" className="relative self-start rounded p-1 text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  aria-label="Remove notification" onClick={() => remove({ id: n.id }).catch(() => {})}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
