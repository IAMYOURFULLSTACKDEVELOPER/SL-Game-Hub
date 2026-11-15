import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import ProClient from './ProClient';

export const metadata = { title: 'Pro', description: 'Dodo Pro: unlimited online rooms, team groups and voice chat.' };

export default async function ProPage() {
  await requireUser();
  // Live, so Pro switches on the moment a USSD payment is confirmed.
  return <ConvexIsland><ProClient /></ConvexIsland>;
}
