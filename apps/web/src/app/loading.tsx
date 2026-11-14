// Skeleton of a typical page (banner + card grid) so the layout doesn't jump when content arrives.
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6 sm:pt-6" aria-busy="true">
      <p className="sr-only" role="status">Loading…</p>
      <div className="skeleton h-44 w-full rounded-lg sm:h-56" />
      <div className="skeleton h-6 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card overflow-hidden" style={{ animationDelay: `${i * 120}ms` }}>
            <div className="skeleton aspect-[16/9] rounded-none" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
