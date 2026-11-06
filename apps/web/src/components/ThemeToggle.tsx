'use client';
export function ThemeToggle({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-outline btn-sm" aria-label={label} title={label}
      onClick={() => {
        const d = document.documentElement;
        const next = d.dataset.theme === 'dark' ? 'light' : 'dark';
        d.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch { /* private mode */ }
      }}>◐</button>
  );
}
