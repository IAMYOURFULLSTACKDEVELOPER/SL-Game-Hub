'use client';

import type { ReactNode } from 'react';
import { signOut } from '@/lib/auth-client';

export function SignOutButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className}
      onClick={async () => { await signOut().catch(() => {}); window.location.assign('/'); }}>
      {children}
    </button>
  );
}
