export default function StatsBar({ stats }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="card flex items-center justify-between border-l-4 border-l-[var(--color-text-secondary)]">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)] font-mono uppercase tracking-[0.2em] mb-1">Total Nodes</p>
          <h3 className="text-4xl font-black font-mono animate-count drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{stats.total}</h3>
        </div>
        <div className="w-12 h-12 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-text-secondary)] flex items-center justify-center text-xl shadow-[0_0_15px_rgba(255,255,255,0.1)]">
          ⎚
        </div>
      </div>
      
      <div className="card flex items-center justify-between border-l-4 border-l-[var(--color-accent-cyan)]">
        <div>
          <p className="text-xs text-[var(--color-accent-cyan)] font-mono uppercase tracking-[0.2em] mb-1">Vacant</p>
          <h3 className="text-4xl font-black font-mono text-[var(--color-slot-vacant)] animate-count drop-shadow-[0_0_15px_rgba(0,243,255,0.6)]">
            {stats.vacant}
          </h3>
        </div>
        <div className="w-12 h-12 rounded bg-[rgba(0,243,255,0.1)] border border-[var(--color-accent-cyan)] flex items-center justify-center text-xl text-[var(--color-accent-cyan)] shadow-[0_0_15px_rgba(0,243,255,0.2)]">
          ⎔
        </div>
      </div>

      <div className="card flex items-center justify-between border-l-4 border-l-[var(--color-accent-red)]">
        <div>
          <p className="text-xs text-[var(--color-accent-red)] font-mono uppercase tracking-[0.2em] mb-1">Occupied</p>
          <h3 className="text-4xl font-black font-mono text-[var(--color-slot-occupied)] animate-count drop-shadow-[0_0_15px_rgba(255,0,60,0.6)]">
            {stats.occupied}
          </h3>
        </div>
        <div className="w-12 h-12 rounded bg-[rgba(255,0,60,0.1)] border border-[var(--color-accent-red)] flex items-center justify-center text-xl text-[var(--color-accent-red)] shadow-[0_0_15px_rgba(255,0,60,0.2)]">
          ⚠
        </div>
      </div>

      <div className="card flex items-center justify-between border-l-4 border-l-[var(--color-accent-purple)]">
        <div>
          <p className="text-xs text-[var(--color-accent-purple)] font-mono uppercase tracking-[0.2em] mb-1">Reserved</p>
          <h3 className="text-4xl font-black font-mono text-[var(--color-slot-reserved)] animate-count drop-shadow-[0_0_15px_rgba(188,19,254,0.6)]">
            {stats.reserved}
          </h3>
        </div>
        <div className="w-12 h-12 rounded bg-[rgba(188,19,254,0.1)] border border-[var(--color-accent-purple)] flex items-center justify-center text-xl text-[var(--color-accent-purple)] shadow-[0_0_15px_rgba(188,19,254,0.2)]">
          ◬
        </div>
      </div>
    </div>
  );
}
