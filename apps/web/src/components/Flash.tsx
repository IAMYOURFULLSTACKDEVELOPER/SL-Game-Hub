import { t } from '@slgh/shared';

// Only translate keys from known namespaces, so a crafted URL can't inject arbitrary text.
const safe = (k: string | undefined, ns: string) => (k && k.startsWith(ns + '.') && /^[\w.]+$/.test(k) ? k : null);

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  const e = safe(error, 'errors') ?? (error ? 'errors.generic' : null);
  const n = safe(notice, 'notice');
  if (!e && !n) return null;
  return (
    <p role={e ? 'alert' : 'status'}
      className={`mb-4 rounded-lg border-2 p-3 font-semibold ${e ? 'border-danger text-danger' : 'border-primary text-primary'}`}>
      {t((e ?? n)!)}
    </p>
  );
}
