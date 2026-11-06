import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/session';
import { deleteChatMessage, muteUser, blockUser } from '@/app/actions';

export default async function AdminChatPage() {
  await requireAdmin();
  const supabase = createClient();

  // Get flagged messages
  const { data: flaggedMessages } = await supabase
    .from('chat_messages')
    .select('*, profiles!inner(username,avatar), chat_rooms!inner(name)')
    .eq('is_flagged', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(50);

  // Get muted users
  const { data: mutedUsers } = await supabase
    .from('chat_participants')
    .select('*, profiles!inner(username,avatar), chat_rooms!inner(name)')
    .eq('is_muted', true)
    .order('muted_until', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Chat Moderation</h1>

      {/* Flagged Messages */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Flagged Messages ({flaggedMessages?.length || 0})</h2>
        {flaggedMessages && flaggedMessages.length > 0 ? (
          <div className="space-y-4">
            {flaggedMessages.map((msg: any) => (
              <div key={msg.id} className="p-4 border rounded bg-red-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{msg.profiles.avatar}</span>
                      <span className="font-medium">{msg.profiles.username}</span>
                      <span className="text-muted">in {msg.chat_rooms.name}</span>
                      <span className="text-xs text-muted">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                  <form action={deleteChatMessage}>
                    <input type="hidden" name="messageId" value={msg.id} />
                    <button className="btn btn-danger btn-sm">Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">No flagged messages</p>
        )}
      </div>

      {/* Muted Users */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Muted Users ({mutedUsers?.length || 0})</h2>
        {mutedUsers && mutedUsers.length > 0 ? (
          <div className="space-y-4">
            {mutedUsers.map((mute: any) => (
              <div key={mute.id} className="p-4 border rounded flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{mute.profiles.avatar}</span>
                  <div>
                    <div className="font-medium">{mute.profiles.username}</div>
                    <div className="text-sm text-muted">
                      Muted in {mute.chat_rooms.name}
                      {mute.muted_until && ` until ${new Date(mute.muted_until).toLocaleString()}`}
                    </div>
                  </div>
                </div>
                <form action={muteUser}>
                  <input type="hidden" name="participantId" value={mute.id} />
                  <button className="btn btn-secondary btn-sm">Unmute</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">No muted users</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <form action={muteUser} className="space-y-2">
            <input type="hidden" name="userId" placeholder="User ID" className="input" required />
            <input type="hidden" name="roomId" placeholder="Room ID" className="input" required />
            <input type="number" name="duration" placeholder="Duration (minutes)" className="input" required />
            <button className="btn btn-secondary w-full">Mute User</button>
          </form>
          <form action={blockUser} className="space-y-2">
            <input type="hidden" name="blockedId" placeholder="User ID to block" className="input" required />
            <button className="btn btn-danger w-full">Block User</button>
          </form>
        </div>
      </div>
    </main>
  );
}
