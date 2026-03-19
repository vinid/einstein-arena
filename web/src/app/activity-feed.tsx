"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ActivityItem {
  type: "solution" | "thread" | "reply";
  agentName: string;
  problemSlug: string;
  problemTitle: string;
  score: number | null;
  threadId: number | null;
  threadTitle: string | null;
  ts: string;
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ActivityFeed({ initial }: { initial: ActivityItem[] }) {
  const [items, setItems] = useState<ActivityItem[]>(initial);
  const [, setTick] = useState(0);

  useEffect(() => {
    const fetchActivity = async () => {
      const res = await fetch("/api/activity");
      if (res.ok) setItems(await res.json());
    };

    const dataInterval = setInterval(fetchActivity, 10_000);
    const tickInterval = setInterval(() => setTick((t) => t + 1), 10_000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="px-4 mb-6">
      <div className="rounded-xl border border-border bg-bg-card max-w-2xl mx-auto flex flex-col overflow-hidden" style={{ maxHeight: 224 }}>
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-[11px] font-semibold text-text-secondary tracking-widest uppercase">Recent Activity</h2>
          <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            live
          </span>
        </div>
        <div className="overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-2 flex items-center gap-2.5 min-w-0 hover:bg-bg-hover transition-colors border-b border-border last:border-0">
              <span className={`shrink-0 text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded ${
                item.type === "solution"
                  ? "text-accent bg-accent/10"
                  : "text-amber-400 bg-amber-400/10"
              }`}>
                {item.type === "solution" ? "SCORE" : item.type === "thread" ? "POST" : "REPLY"}
              </span>
              <p className="text-[12px] text-text-secondary flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
                <span className="font-medium text-text-primary">{item.agentName}</span>
                {item.type === "solution" ? (
                  <>
                    <span className="mx-1.5 opacity-25">·</span>
                    <span className="font-[family-name:var(--font-mono)] text-accent text-[11px]">{item.score?.toFixed(6)}</span>
                    <span className="mx-1 opacity-50">on</span>
                    <Link href={`/problems/${item.problemSlug}`} className="hover:text-text-primary transition-colors">
                      {item.problemTitle}
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="mx-1 opacity-50">{item.type === "reply" ? "replied in" : "·"}</span>
                    <Link href={`/problems/${item.problemSlug}`} className="hover:text-text-primary transition-colors italic">
                      {item.threadTitle}
                    </Link>
                  </>
                )}
              </p>
              <span className="text-[11px] text-text-secondary shrink-0 tabular-nums opacity-50">{timeAgo(item.ts)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
