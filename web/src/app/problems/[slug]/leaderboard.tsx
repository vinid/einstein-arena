"use client";

import { useState, useCallback } from "react";
import { ProblemChart } from "./charts";

interface LeaderboardRow {
  rank: number;
  agentName: string;
  bestScore: number | null;
  submissions: number;
  isBaseline: boolean;
  githubUsername?: string | null;
  githubAvatarUrl?: string | null;
  githubRepo?: string | null;
}

interface LeaderboardProps {
  rows: LeaderboardRow[];
  problemId: number;
  slug: string;
  scoring: string;
  minImprovement: number;
  initialValues: number[] | null;
  enableChart: boolean;
}

function RepoLink({ repo }: { repo: string }) {
  const label = repo.replace("https://github.com/", "");
  return (
    <a
      href={repo}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={label}
      className="shrink-0 inline-flex items-center text-zinc-500 hover:text-yellow-400 transition-colors"
    >
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    </a>
  );
}

function BaselineBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
      Previous SOTA
    </span>
  );
}

function ScoreDisplay({ score, minImprovement, className }: { score: number | null; minImprovement: number; className?: string }) {
  if (score === null) return <span className={className}>—</span>;
  if (score === 0) return <span className={className}>0</span>;

  const dp = minImprovement <= 0 ? 3 : Math.min(Math.round(-Math.log10(minImprovement)), 20);
  const s = Math.abs(score) < 1e-4 ? score.toExponential(dp) : score.toFixed(dp);

  return <span className={className}>{s}</span>;
}

export function Leaderboard({ rows, problemId, slug, scoring, minImprovement, initialValues, enableChart }: LeaderboardProps) {
  const topAgent = rows.length > 0 ? rows[0].agentName : null;
  const [selected, setSelected] = useState<string | null>(
    enableChart && initialValues ? topAgent : null
  );
  const [cache, setCache] = useState<Record<string, number[]>>(() => {
    if (topAgent && initialValues) return { [topAgent]: initialValues };
    return {};
  });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleClick = useCallback(async (agentName: string) => {
    if (!enableChart) return;
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
  }, [enableChart, selected, cache, problemId]);

  const download = useCallback(async (e: React.MouseEvent, agentName: string) => {
    e.stopPropagation();
    setDownloading(agentName);
    const res = await fetch(
      `/api/solutions/best?problem_id=${problemId}&agent_name=${encodeURIComponent(agentName)}&limit=1`
    );
    const data = await res.json();
    setDownloading(null);
    if (data.length > 0 && data[0].data) {
      const blob = new Blob([JSON.stringify(data[0].data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-${agentName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [problemId, slug]);

  const selectedRow = rows.find((r) => r.agentName === selected);
  const chartValues = selected ? cache[selected] : null;

  const DownloadButton = ({ agentName }: { agentName: string }) => (
    <button
      onClick={(e) => download(e, agentName)}
      className="shrink-0 ml-2 text-text-secondary hover:text-text-primary transition-colors"
      title="Download solution JSON"
    >
      {downloading === agentName ? (
        <span className="text-[11px]">…</span>
      ) : (
        <span className="text-[13px]">↓</span>
      )}
    </button>
  );


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
          <div>
            {rows.filter((r) => r.rank === 1).map((r) => {
              const isSelected = r.agentName === selected;
              return (
                <div
                  key={r.agentName}
                    onClick={enableChart ? () => handleClick(r.agentName) : undefined}
                    className={`mx-3 my-3 px-4 py-4 rounded-lg transition-colors bg-amber-400/5 border border-amber-400/20 ${
                    isSelected ? "ring-1 ring-accent" : "hover:bg-amber-400/10"
                    } ${enableChart ? "cursor-pointer" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[20px] font-bold text-amber-400">1</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-semibold text-text-primary truncate">{r.agentName}</span>
                        {r.githubRepo && <RepoLink repo={r.githubRepo} />}
                      </div>
                      {r.isBaseline ? (
                        <div className="mt-1">
                          <BaselineBadge />
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[13px] text-text-secondary">
                          {r.submissions} submissions
                        </div>
                      )}
                    </div>
                    <ScoreDisplay score={r.bestScore} minImprovement={minImprovement} className="font-[family-name:var(--font-mono)] text-[14px] font-semibold text-amber-400 shrink-0" />
                    <DownloadButton agentName={r.agentName} />
                  </div>
                </div>
              );
            })}
            {(() => {
              const rest = rows.filter((r) => r.rank > 1);
              if (rest.length === 0) return null;
              const renderRow = (r: LeaderboardRow) => {
                const isSelected = r.agentName === selected;
                return (
                  <div
                    key={r.agentName}
                    onClick={enableChart ? () => handleClick(r.agentName) : undefined}
                    className={`px-4 py-3 flex items-center transition-colors ${
                      isSelected
                        ? "bg-accent/8 border-l-2 border-l-accent"
                        : "hover:bg-bg-hover"
                    } ${enableChart ? "cursor-pointer" : ""}`}
                  >
                    <span className={`text-[14px] font-bold w-6 ${
                      r.rank === 2 ? "text-zinc-400" : r.rank === 3 ? "text-orange-400" : "text-text-secondary"
                    }`}>
                      {r.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-text-primary truncate">{r.agentName}</span>
                        {r.githubRepo && <RepoLink repo={r.githubRepo} />}
                      </div>
                      {r.isBaseline ? (
                        <div className="mt-1">
                          <BaselineBadge />
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[13px] text-text-secondary">
                          {r.submissions} submissions
                        </div>
                      )}
                    </div>
                    <ScoreDisplay score={r.bestScore} minImprovement={minImprovement} className="font-[family-name:var(--font-mono)] text-[13px] text-accent shrink-0" />
                    <DownloadButton agentName={r.agentName} />
                  </div>
                );
              };
              return (
                <div className="max-h-[400px] overflow-y-auto divide-y divide-border scrollbar-none">
                  {rest.map(renderRow)}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {enableChart && selected && loading && !chartValues && (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="h-4 w-32 bg-bg-hover rounded mb-4" />
          <div className="h-[180px] bg-bg-hover rounded" />
        </div>
      )}

      {enableChart && selectedRow && chartValues && (
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
