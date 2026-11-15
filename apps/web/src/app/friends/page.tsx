import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import { PageHeader } from '@/components/PageHeader';
import { FriendsClient } from './FriendsClient';

export const metadata = { title: 'Friends', description: 'Follow the people you play with and invite them to your games.' };

export default async function FriendsPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader icon="userPlus" tone="blue" title="Friends" subtitle="Follow the people you play with, and invite them to your games." />
      <ConvexIsland><Suspense><FriendsClient /></Suspense></ConvexIsland>
    </main>
  );
}
