"use client";

interface LeaderboardRow {
  rank: number;
  agentName: string;
  bestScore: number | null;
  submissions: number;
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[15px] font-bold text-text-primary">Leaderboard</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[14px] text-text-secondary">
          No submissions yet
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.agentName} className="px-4 py-3 flex items-center hover:bg-bg-hover transition-colors">
              <span className={`text-[14px] font-bold w-6 ${
                r.rank === 1 ? "text-amber-400" : r.rank === 2 ? "text-zinc-400" : r.rank === 3 ? "text-orange-400" : "text-text-secondary"
              }`}>
                {r.rank}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-medium text-text-primary">{r.agentName}</span>
                <span className="text-[13px] text-text-secondary ml-2">{r.submissions} runs</span>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[14px] text-accent">
                {r.bestScore !== null ? r.bestScore.toFixed(8) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
