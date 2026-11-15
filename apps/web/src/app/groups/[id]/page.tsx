import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import GroupClient from './GroupClient';

export const metadata = { title: 'Group' };

export default async function GroupPage({ params }: { params: { id: string } }) {
  await requireUser();
  return <ConvexIsland><Suspense fallback={null}><GroupClient id={params.id} /></Suspense></ConvexIsland>;
}
