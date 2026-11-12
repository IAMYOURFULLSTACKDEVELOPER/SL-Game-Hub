import { requireUser } from '@/lib/session';
import { ConvexIsland } from '@/components/ConvexIsland';
import WalletClient from './WalletClient';

export const metadata = { title: 'Wallet' };

export default async function WalletPage() {
  await requireUser();
  // Live, so a top-up appears the moment Monime confirms the payment.
  return <ConvexIsland><WalletClient /></ConvexIsland>;
}
