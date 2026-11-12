'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { PageHeader } from '@/components/PageHeader';

type Room = { id: Id<'chat_rooms'>; name: string; description: string | null };

/** Live chat: messages arrive through a Convex subscription, no polling or refetching. */
export default function ChatClient() {
  const rooms = useQuery(api.chat.rooms);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const messages = useQuery(api.chat.messages, selectedRoom ? { roomId: selectedRoom.id } : 'skip') ?? [];
  const send = useMutation(api.chat.send);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;

    try {
      await send({ roomId: selectedRoom.id, content: newMessage.trim() });
      setNewMessage('');
    } catch (error) {
      alert(error instanceof ConvexError ? String(error.data) : 'Failed to send message');
    }
  };

  if (rooms === undefined) {
    return <div className="p-4">Loading chat rooms...</div>;
  }

  return (
    <main className="mx-auto max-w-5xl h-[calc(100vh-100px)] p-4">
      <div className="mb-4"><PageHeader icon="chat" tone="blue" title="Chat" subtitle="Talk with players across Salone." /></div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100%-4rem)]">
        {/* Room List */}
        <div className="card p-4 overflow-y-auto">
          <h2 className="font-bold mb-4">Rooms</h2>
          <div className="space-y-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`w-full text-left p-3 rounded ${
                  selectedRoom?.id === room.id ? 'bg-primary text-white' : 'bg-bg/70 hover:bg-primary/10'
                }`}
              >
                <div className="font-medium">{room.name}</div>
                {room.description && (
                  <div className="text-xs opacity-75">{room.description}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="md:col-span-3 card flex flex-col">
          {selectedRoom ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <p className="text-center text-muted">No messages yet. Start the conversation!</p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3">
                      <span className="text-2xl">{msg.profiles.avatar}</span>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium">{msg.profiles.username}</span>
                          <span className="text-xs text-muted">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="input flex-1"
                    maxLength={500}
                  />
                  <button type="submit" className="btn btn-primary">
                    Send
                  </button>
                </div>
                <p className="text-xs text-muted mt-2">
                  Be respectful. No profanity or harassment allowed.
                </p>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1">
              <p className="text-muted">Select a room to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
