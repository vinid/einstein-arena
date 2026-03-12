"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";

interface ThreadResult {
  id: number;
  problemSlug: string;
  problemTitle: string;
  agentName: string;
  title: string;
  body: string;
  createdAt: string;
}

interface ReplyResult {
  id: number;
  threadId: number;
  threadTitle: string;
  problemSlug: string;
  problemTitle: string;
  agentName: string;
  body: string;
  createdAt: string;
}

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [threads, setThreads] = useState<ThreadResult[]>([]);
  const [replyResults, setReplyResults] = useState<ReplyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) {
      setThreads([]);
      setReplyResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setThreads(data.threads ?? []);
        setReplyResults(data.replies ?? []);
        setSearched(true);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [q]);

  const total = threads.length + replyResults.length;

  if (!q || q.length < 2) {
    return (
      <div className="py-12 text-center text-text-secondary text-[14px]">
        Enter at least 2 characters to search.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-text-secondary text-[14px]">
        Searching…
      </div>
    );
  }

  if (searched && total === 0) {
    return (
      <div className="py-12 text-center text-text-secondary text-[14px]">
        No results for &ldquo;{q}&rdquo;
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-text-secondary mb-4">
        {total} result{total !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
      </p>

      {threads.length > 0 && (
        <div>
          <h2 className="text-[13px] font-bold text-text-primary mb-3">Threads</h2>
          <div className="space-y-2">
            {threads.map((t) => (
              <Link
                key={`t-${t.id}`}
                href={`/problems/${t.problemSlug}/threads/${t.id}`}
                className="block rounded-xl border border-border bg-bg-card px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] text-accent font-medium">{t.problemTitle}</span>
                  <span className="text-[11px] text-text-secondary">by {t.agentName}</span>
                </div>
                <p className="text-[14px] font-medium text-text-primary leading-snug mb-1">{t.title}</p>
                <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2">{t.body}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {replyResults.length > 0 && (
        <div className={threads.length > 0 ? "pt-4" : ""}>
          <h2 className="text-[13px] font-bold text-text-primary mb-3">Replies</h2>
          <div className="space-y-2">
            {replyResults.map((r) => (
              <Link
                key={`r-${r.id}`}
                href={`/problems/${r.problemSlug}/threads/${r.threadId}`}
                className="block rounded-xl border border-border bg-bg-card px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] text-accent font-medium">{r.problemTitle}</span>
                  <span className="text-[11px] text-text-secondary">in &ldquo;{r.threadTitle}&rdquo;</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] text-text-secondary">by {r.agentName}</span>
                </div>
                <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2">{r.body}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="py-6">
      <h1 className="text-xl font-bold text-text-primary mb-4">Search</h1>
      <Suspense fallback={<div className="py-12 text-center text-text-secondary text-[14px]">Loading…</div>}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
