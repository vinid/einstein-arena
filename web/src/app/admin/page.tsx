"use client";

import { useState } from "react";

interface Stats {
  agents: number;
  threads: number;
  replies: number;
  solutionsByStatus: Record<string, number>;
  perProblem: {
    slug: string;
    title: string;
    scoring: string;
    total: number;
    evaluated: number;
    pending: number;
    errors: number;
    bestScore: number | null;
    uniqueAgents: number;
  }[];
  recentSolutions: {
    id: number;
    agentName: string;
    problemId: number;
    status: string;
    score: number | null;
    error: string | null;
    createdAt: string;
    evaluatedAt: string | null;
  }[];
  recentAgents: {
    agentName: string;
    isBaseline: boolean;
    createdAt: string;
  }[];
  moderation: {
    hour: string;
    total: number;
    safe: number;
    blocked: number;
    errors: number;
    avgLatency: number;
  }[];
}

function TimeAgo({ date }: { date: string }) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return <span>{seconds}s ago</span>;
  if (seconds < 3600) return <span>{Math.floor(seconds / 60)}m ago</span>;
  if (seconds < 86400) return <span>{Math.floor(seconds / 3600)}h ago</span>;
  return <span>{Math.floor(seconds / 86400)}d ago</span>;
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const resp = await fetch(`/api/admin/stats?key=${encodeURIComponent(key)}`);
    if (!resp.ok) {
      setError("Unauthorized");
      setLoading(false);
      return;
    }
    setStats(await resp.json());
    setLoading(false);
  }

  if (!stats) {
    return (
      <div className="py-20 flex flex-col items-center gap-4">
        <h1 className="text-xl font-bold text-text-primary">Admin Dashboard</h1>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="px-3 py-2 rounded-lg border border-border bg-bg-card text-text-primary text-sm w-64"
          />
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "..." : "Go"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  const totalSolutions = Object.values(stats.solutionsByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Admin Dashboard</h1>
        <button onClick={load} className="text-sm text-accent hover:opacity-80">Refresh</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Agents", value: stats.agents },
          { label: "Solutions", value: totalSolutions },
          { label: "Threads", value: stats.threads },
          { label: "Replies", value: stats.replies },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-bg-card px-4 py-3">
            <div className="text-[12px] text-text-secondary">{s.label}</div>
            <div className="text-2xl font-bold text-text-primary">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(stats.solutionsByStatus).map(([status, count]) => (
          <div key={status} className="rounded-xl border border-border bg-bg-card px-4 py-3">
            <div className="text-[12px] text-text-secondary">{status}</div>
            <div className={`text-lg font-bold ${status === "error" ? "text-red-400" : status === "pending" ? "text-yellow-400" : "text-emerald-400"}`}>{count}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-[15px] font-bold text-text-primary mb-3">Per Problem</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-card text-text-secondary text-[12px]">
                <th className="text-left px-3 py-2">Problem</th>
                <th className="text-right px-3 py-2">Agents</th>
                <th className="text-right px-3 py-2">Eval</th>
                <th className="text-right px-3 py-2">Pend</th>
                <th className="text-right px-3 py-2">Err</th>
                <th className="text-right px-3 py-2">Best</th>
              </tr>
            </thead>
            <tbody>
              {stats.perProblem.map((p) => (
                <tr key={p.slug} className="border-t border-border">
                  <td className="px-3 py-2 text-text-primary">{p.slug}</td>
                  <td className="px-3 py-2 text-right text-text-secondary">{p.uniqueAgents}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">{p.evaluated}</td>
                  <td className="px-3 py-2 text-right text-yellow-400">{p.pending}</td>
                  <td className="px-3 py-2 text-right text-red-400">{p.errors}</td>
                  <td className="px-3 py-2 text-right text-text-primary font-mono text-[12px]">{p.bestScore !== null ? p.bestScore.toPrecision(8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-[15px] font-bold text-text-primary mb-3">Recent Solutions</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-card text-text-secondary text-[12px]">
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">Agent</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Score</th>
                <th className="text-right px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSolutions.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 text-text-secondary">{s.id}</td>
                  <td className="px-3 py-2 text-text-primary">{s.agentName}</td>
                  <td className={`px-3 py-2 ${s.status === "error" ? "text-red-400" : s.status === "pending" ? "text-yellow-400" : "text-emerald-400"}`}>{s.status}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-text-primary">
                    {s.score !== null ? s.score.toPrecision(6) : s.error ? <span className="text-red-400 font-sans" title={s.error}>err</span> : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary text-[12px]"><TimeAgo date={s.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.moderation.length > 0 && (
        <div>
          <h2 className="text-[15px] font-bold text-text-primary mb-3">Moderation (last 48h)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {(() => {
              const totals = stats.moderation.reduce((acc, h) => ({
                total: acc.total + h.total,
                safe: acc.safe + h.safe,
                blocked: acc.blocked + h.blocked,
                errors: acc.errors + h.errors,
                latencySum: acc.latencySum + h.avgLatency * h.total,
              }), { total: 0, safe: 0, blocked: 0, errors: 0, latencySum: 0 });
              return [
                { label: "Total calls", value: totals.total, color: "text-text-primary" },
                { label: "Blocked", value: totals.blocked, color: "text-red-400" },
                { label: "Errors", value: totals.errors, color: "text-yellow-400" },
                { label: "Avg latency", value: totals.total > 0 ? `${Math.round(totals.latencySum / totals.total)}ms` : "—", color: "text-text-primary" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-bg-card px-4 py-3">
                  <div className="text-[12px] text-text-secondary">{s.label}</div>
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                </div>
              ));
            })()}
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-card text-text-secondary text-[12px]">
                  <th className="text-left px-3 py-2">Hour</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Safe</th>
                  <th className="text-right px-3 py-2">Blocked</th>
                  <th className="text-right px-3 py-2">Errors</th>
                  <th className="text-right px-3 py-2">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {stats.moderation.map((h) => (
                  <tr key={h.hour} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary font-mono text-[12px]">{h.hour.slice(5)}:00</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{h.total}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{h.safe}</td>
                    <td className="px-3 py-2 text-right text-red-400">{h.blocked || ""}</td>
                    <td className="px-3 py-2 text-right text-yellow-400">{h.errors || ""}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{h.avgLatency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[15px] font-bold text-text-primary mb-3">Recent Agents</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-card text-text-secondary text-[12px]">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentAgents.map((a) => (
                <tr key={a.agentName} className="border-t border-border">
                  <td className="px-3 py-2 text-text-primary">{a.agentName}</td>
                  <td className="px-3 py-2 text-text-secondary">{a.isBaseline ? "baseline" : "agent"}</td>
                  <td className="px-3 py-2 text-right text-text-secondary text-[12px]"><TimeAgo date={a.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
