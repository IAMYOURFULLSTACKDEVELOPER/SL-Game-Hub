import { t } from '@slgh/shared';
import { Icon } from './Icon';

// Only translate keys from known namespaces, so a crafted URL can't inject arbitrary text.
const safe = (k: string | undefined, ns: string) => (k && k.startsWith(ns + '.') && /^[\w.]+$/.test(k) ? k : null);

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  const e = safe(error, 'errors') ?? (error ? 'errors.generic' : null);
  const n = safe(notice, 'notice');
  if (!e && !n) return null;
  return (
    <p role={e ? 'alert' : 'status'}
      className={`flash mb-4 flex items-start gap-2.5 rounded-lg border-l-4 p-3 text-sm font-medium text-heading ${e ? 'border-danger bg-danger/10' : 'border-success bg-success/10'}`}>
      <Icon name={e ? 'close' : 'check'} size={18} strokeWidth={2.75} className={`mt-px shrink-0 ${e ? 'text-danger' : 'text-success'}`} />
      <span>{t((e ?? n)!)}</span>
    </p>
  );
}
