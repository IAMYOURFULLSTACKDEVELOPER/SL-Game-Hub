import Link from 'next/link';
import { LostArt } from '@/components/Art';
import { Icon } from '@/components/Icon';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-4 py-16 text-center">
      <LostArt />
      <h1 className="mt-6">This square is empty</h1>
      <p className="mt-2 text-muted">The page you rolled for doesn&apos;t exist, or it moved.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-outline"><Icon name="home" size={18} />Home</Link>
        <Link href="/games" className="btn btn-primary"><Icon name="gamepad" size={18} />Browse games</Link>
      </div>
    </main>
  );
}
