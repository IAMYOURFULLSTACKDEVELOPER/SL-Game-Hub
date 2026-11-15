'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { formatLeones } from '@slgh/shared/src/wallet';
import { playerMessage } from '@slgh/shared/src/errors';
import { Icon } from '@/components/Icon';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Every online room, live. Closing a room returns any stakes still held and removes everyone. */
export default function RoomsAdmin() {
  const rooms = useQuery(api.admin.rooms);
  const close = useMutation(api.admin.closeRoom);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onClose = async (id: string, code: string, money: boolean) => {
    const reason = prompt(`Why close room ${code}?${money ? ' Stakes still held go back to the players.' : ''} (kept in the audit log)`);
    if (!reason) return;
    setMsg(null);
    try { await close({ roomId: id as Id<'play_rooms'>, reason }); setMsg({ ok: true, text: `Room ${code} closed.` }); } catch (e) { setMsg({ ok: false, text: playerMessage(e) }); }
  };

  return (
    <div className="space-y-4">
      <h1>Live rooms</h1>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`card p-3 font-semibold ${msg.ok ? 'text-primary' : 'text-danger'}`}>{msg.text}</p>}
      {rooms === undefined ? <p className="text-muted">Loading…</p> : rooms.length === 0 ? <p className="card p-4 text-muted">No rooms open right now.</p> : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <b>{r.game}</b> · <span className="font-mono">{r.code}</span>
                {r.playing ? <span className="chip chip-muted ml-2">Playing</span> : <span className="chip chip-muted ml-2">Waiting</span>}
                {r.isPublic && <span className="chip chip-muted ml-2">Listed</span>}
                {r.stake !== null && <span className="chip ml-2 border-accent/50"><Icon name="coins" size={12} />{formatLeones(r.stake)} stake{r.pot ? ` · pot ${formatLeones(r.pot.total)}` : ''}</span>}
                <span className="block truncate text-xs text-muted">{r.players.length ? r.players.join(', ') : 'nobody in the room'} · opened {when(r.created_at)}</span>
              </span>
              <button type="button" className="btn btn-sm btn-outline text-danger" onClick={() => void onClose(r.id, r.code, r.stake !== null)}>Close room</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
