import en from './en.json';

type Dict = { [k: string]: unknown };
const dicts: Record<string, Dict> = { en }; // add `kri: kri` here when Krio is ready

/** t('auth.email') or t('library.players', {min: 2, max: 4}). Falls back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>, locale = 'en'): string {
  const find = (d: Dict) =>
    key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Dict)[k] : undefined), d);
  const v = find(dicts[locale] ?? en) ?? find(en);
  if (typeof v !== 'string') return key;
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : v;
}
