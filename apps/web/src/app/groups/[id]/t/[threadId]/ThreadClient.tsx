'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { avatarEmoji } from '@slgh/shared/src/avatars';
import { playerMessage } from '@slgh/shared/src/errors';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A forum thread: posts arrive live, and you can reply or delete your own posts (the owner can delete any). */
export default function ThreadClient({ id }: { id: string }) {
  const router = useRouter();
  const t = useQuery(api.groups.thread, { id });
  const reply = useMutation(api.groups.reply);
  const deletePost = useMutation(api.groups.deletePost);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (t === undefined) return <main className="mx-auto max-w-3xl p-4 text-muted">Loading…</main>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };
  const onReply = (e: FormEvent) => { e.preventDefault(); void run(async () => { await reply({ threadId: id, body }); setBody(''); }); };

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href={`/groups/${t.group.id}`} className="back-link">← {t.group.name}</Link>
      <h1>{t.title}</h1>
      <ol className="space-y-3">
        {t.posts.map((p, i) => (
          <li key={p.id} className="card space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm">
              <span aria-hidden className="text-lg">{avatarEmoji(p.avatar)}</span>
              <b>{p.username}</b><span className="text-muted">{when(p.created_at)}</span>
              {p.canDelete && (
                <button type="button" className="btn btn-ghost btn-sm ml-auto text-danger" disabled={busy}
                  onClick={() => {
                    if (!confirm(i === 0 && t.posts.length === 1 ? 'Delete this post? The thread goes with it.' : 'Delete this post?')) return;
                    void run(async () => { const r = await deletePost({ postId: p.id }); if (r?.threadDeleted) router.push(`/groups/${t.group.id}`); });
                  }}>Delete</button>
              )}
            </p>
            <p className="whitespace-pre-wrap break-words">{p.body}</p>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <form onSubmit={onReply} className="card space-y-3 p-4">
        <textarea className="input min-h-[96px]" required maxLength={2000} placeholder="Write a reply" aria-label="Reply" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !body.trim()}>Reply</button>
      </form>
    </main>
  );
}
