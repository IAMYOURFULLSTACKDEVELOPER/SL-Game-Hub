'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@slgh/shared';

export default function ChatPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      fetchMessages(selectedRoom.id);
    }
  }, [selectedRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRooms = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('is_active', true);
      setRooms(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      setLoading(false);
    }
  };

  const fetchMessages = async (roomId: string) => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles!inner(username,avatar)')
        .eq('room_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(50);
      setMessages(data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('send_chat_message', {
        p_room_id: selectedRoom.id,
        p_content: newMessage.trim(),
      });

      if (error) {
        alert(error.message);
        return;
      }

      setNewMessage('');
      fetchMessages(selectedRoom.id);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  };

  if (loading) {
    return <div className="p-4">Loading chat rooms...</div>;
  }

  return (
    <main className="mx-auto max-w-5xl h-[calc(100vh-100px)] p-4">
      <h1 className="text-3xl font-bold mb-4">Chat</h1>

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
                  selectedRoom?.id === room.id ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'
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
