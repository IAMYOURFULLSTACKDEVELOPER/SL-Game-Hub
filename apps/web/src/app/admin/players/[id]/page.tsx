import { ConvexIsland } from '@/components/ConvexIsland';
import PlayerAdmin from './PlayerAdmin';

export default function AdminPlayerPage({ params }: { params: { id: string } }) {
  // The admin layout has already checked the role; the Convex functions check it again.
  return <ConvexIsland><PlayerAdmin id={params.id} /></ConvexIsland>;
}
