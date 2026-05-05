/**
 * Top-level loading skeleton for /dashboard while server components fetch.
 * Each individual page can override with its own loading.tsx for finer skeletons.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="h-4 w-72 bg-zinc-900 rounded" />
        </div>
        <div className="h-10 w-32 bg-zinc-800 rounded" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2"
          >
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="h-7 w-16 bg-zinc-800 rounded" />
            <div className="h-3 w-24 bg-zinc-900 rounded" />
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-10 w-10 bg-zinc-800 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-zinc-800 rounded" />
              <div className="h-3 w-1/2 bg-zinc-900 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
