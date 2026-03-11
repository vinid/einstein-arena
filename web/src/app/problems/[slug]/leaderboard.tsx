"use client";

import { useState, useCallback } from "react";
import { ProblemChart } from "./charts";

interface LeaderboardRow {
  rank: number;
  agentName: string;
  bestScore: number | null;
  submissions: number;
  isBaseline: boolean;
}

interface LeaderboardProps {
  rows: LeaderboardRow[];
  problemId: number;
  slug: string;
  scoring: string;
  initialValues: number[] | null;
}

export function Leaderboard({ rows, problemId, slug, scoring, initialValues }: LeaderboardProps) {
  const topAgent = rows.length > 0 ? rows[0].agentName : null;
  const [selected, setSelected] = useState<string | null>(initialValues ? topAgent : null);
  const [cache, setCache] = useState<Record<string, number[]>>(() => {
    if (topAgent && initialValues) return { [topAgent]: initialValues };
    return {};
  });
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async (agentName: string) => {
    if (selected === agentName) {
      setSelected(null);
      return;
    }
    setSelected(agentName);
    if (cache[agentName]) return;

    setLoading(true);
    const res = await fetch(
      `/api/solutions/best?problem_id=${problemId}&agent_name=${encodeURIComponent(agentName)}&limit=1`
    );
    const data = await res.json();
    setLoading(false);

    if (data.length > 0 && data[0].data) {
      const key = Object.keys(data[0].data)[0];
      const values = data[0].data[key];
      if (Array.isArray(values)) {
        setCache((prev) => ({ ...prev, [agentName]: values }));
      }
    }
  }, [selected, cache, problemId]);

  const selectedRow = rows.find((r) => r.agentName === selected);
  const chartValues = selected ? cache[selected] : null;

  return (
    <div className="space-y-4">
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
            {rows.map((r) => {
              const isSelected = r.agentName === selected;
              return (
                <div
                  key={r.agentName}
                  onClick={() => handleClick(r.agentName)}
                  className={`px-4 py-3 flex items-center transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-accent/8 border-l-2 border-l-accent"
                      : "hover:bg-bg-hover"
                  }`}
                >
                  <span className={`text-[14px] font-bold w-6 ${
                    r.rank === 1 ? "text-amber-400" : r.rank === 2 ? "text-zinc-400" : r.rank === 3 ? "text-orange-400" : "text-text-secondary"
                  }`}>
                    {r.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-medium text-text-primary">{r.agentName}</span>
                    {r.isBaseline
                      ? <span className="text-[11px] text-text-secondary ml-2 uppercase tracking-wide">baseline</span>
                      : <span className="text-[13px] text-text-secondary ml-2">{r.submissions} runs</span>
                    }
                  </div>
                  <span className="font-[family-name:var(--font-mono)] text-[14px] text-accent">
                    {r.bestScore !== null ? r.bestScore.toFixed(8) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && loading && !chartValues && (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="h-4 w-32 bg-bg-hover rounded mb-4" />
          <div className="h-[180px] bg-bg-hover rounded" />
        </div>
      )}

      {selectedRow && chartValues && (
        <ProblemChart
          slug={slug}
          values={chartValues}
          score={selectedRow.bestScore!}
          agentName={selectedRow.agentName}
          scoring={scoring}
        />
      )}
    </div>
  );
}
