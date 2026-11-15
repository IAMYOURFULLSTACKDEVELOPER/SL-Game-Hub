import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import { PageHeader } from '@/components/PageHeader';
import { Schedule } from '@/components/schedule/Schedule';

export const metadata = { title: 'Schedule', description: 'Plan online games and tournaments, and see who is coming.' };

export default async function SchedulePage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader icon="calendar" tone="green" title="Schedule" subtitle="Game nights and tournaments, planned ahead." />
      <ConvexIsland><Schedule /></ConvexIsland>
    </main>
  );
}
