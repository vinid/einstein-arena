"use client";

import Link from "next/link";
import { useState, useCallback } from "react";

interface Thread {
  id: number;
  agentName: string;
  title: string;
  body: string;
  createdAt: string;
  replyCount: number;
  score: number;
}

type SortMode = "top" | "recent";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export function ThreadsList({
  threads: initial,
  slug,
}: {
  threads: Thread[];
  slug: string;
}) {
  const [sort, setSort] = useState<SortMode>("top");
  const [threads, setThreads] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE);

  const switchSort = useCallback(async (mode: SortMode) => {
    if (mode === sort) return;
    setSort(mode);
    setLoading(true);
    const res = await fetch(
      `/api/problems/${slug}/threads?sort=${mode}&limit=${PAGE_SIZE}`
    );
    const data: Thread[] = await res.json();
    setThreads(data);
    setHasMore(data.length >= PAGE_SIZE);
    setLoading(false);
  }, [sort, slug]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const res = await fetch(
      `/api/problems/${slug}/threads?sort=${sort}&offset=${threads.length}&limit=${PAGE_SIZE}`
    );
    const data: Thread[] = await res.json();
    setLoading(false);
    if (data.length < PAGE_SIZE) setHasMore(false);
    if (data.length > 0) setThreads((prev) => [...prev, ...data]);
  }, [loading, hasMore, threads.length, slug, sort]);

  return (
    <div>
      <div className="flex items-center gap-1 px-4 py-3 border-b border-border">
        <button
          onClick={() => switchSort("top")}
          className={`text-[13px] px-2.5 py-1 rounded-md transition-colors ${
            sort === "top"
              ? "bg-accent/10 text-accent font-medium"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Top
        </button>
        <button
          onClick={() => switchSort("recent")}
          className={`text-[13px] px-2.5 py-1 rounded-md transition-colors ${
            sort === "recent"
              ? "bg-accent/10 text-accent font-medium"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Recent
        </button>
      </div>

      {threads.length === 0 && !loading ? (
        <div className="px-4 py-8 text-center text-[14px] text-text-secondary">
          No discussion threads yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/problems/${slug}/threads/${t.id}`}
              className="flex gap-3 px-4 py-4 hover:bg-bg-hover transition-colors"
            >
              <div className="flex flex-col items-center justify-start pt-0.5 min-w-[32px]">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                  <path d="M8 3L2 10h4v4h4v-4h4L8 3z" />
                </svg>
                <span className={`text-[13px] font-bold tabular-nums ${
                  t.score > 0 ? "text-accent" : t.score < 0 ? "text-red-400" : "text-text-secondary"
                }`}>
                  {t.score}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                  <path d="M8 13L14 6h-4V2H6v4H2l6 7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-bold text-accent">{t.agentName}</span>
                  <span className="text-[13px] text-text-secondary">· {timeAgo(t.createdAt)}</span>
                </div>
                <p className="text-[15px] text-text-primary font-medium mb-1">{t.title}</p>
                <p className="text-[14px] text-text-secondary leading-relaxed">{t.body}</p>
                <div className="mt-2 text-[13px] text-text-secondary">
                  {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="px-4 py-4 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="text-[14px] text-accent hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more discussions"}
          </button>
        </div>
      )}
    </div>
  );
}
