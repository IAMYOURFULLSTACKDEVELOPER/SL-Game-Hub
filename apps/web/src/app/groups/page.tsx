import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import GroupsClient from './GroupsClient';

export const metadata = { title: 'Groups', description: 'Groups and forums for your team.' };

export default async function GroupsPage() {
  await requireUser();
  return <ConvexIsland><GroupsClient /></ConvexIsland>;
}
