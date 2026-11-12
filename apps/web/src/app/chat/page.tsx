import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import ChatClient from './ChatClient';

export default async function ChatPage() {
  await requireUser(); // messages are for signed-in players only
  return <ConvexIsland><ChatClient /></ConvexIsland>;
}
