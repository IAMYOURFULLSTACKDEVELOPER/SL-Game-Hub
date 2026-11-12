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
      className={`flash mb-4 flex items-start gap-3 rounded-2xl border p-3.5 font-semibold ${e ? 'border-danger/40 bg-danger/10 text-danger' : 'border-primary/40 bg-primary/10 text-primary'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${e ? 'bg-danger/15' : 'bg-primary/15'}`}>
        <Icon name={e ? 'close' : 'check'} size={16} strokeWidth={3} />
      </span>
      <span className="pt-0.5">{t((e ?? n)!)}</span>
    </p>
  );
}
