import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import ThreadClient from './ThreadClient';

export const metadata = { title: 'Thread' };

export default async function ThreadPage({ params }: { params: { threadId: string } }) {
  await requireUser();
  return <ConvexIsland><ThreadClient id={params.threadId} /></ConvexIsland>;
}
