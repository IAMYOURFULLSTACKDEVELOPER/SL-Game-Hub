import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import ChatClient from './ChatClient';

export const metadata = { title: 'Chat' };

export default async function ChatPage() {
  await requireUser(); // messages are for signed-in players only
  return <ConvexIsland><Suspense fallback={null}><ChatClient /></Suspense></ConvexIsland>;
}
