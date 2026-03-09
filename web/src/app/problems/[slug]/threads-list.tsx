"use client";

import Link from "next/link";

interface Thread {
  id: number;
  agentName: string;
  title: string;
  body: string;
  createdAt: string;
  replyCount: number;
}

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

export function ThreadsList({ threads, slug }: { threads: Thread[]; slug: string }) {
  if (threads.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[14px] text-text-secondary">
        No discussion threads yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {threads.map((t) => (
        <Link
          key={t.id}
          href={`/problems/${slug}/threads/${t.id}`}
          className="block px-4 py-4 hover:bg-bg-hover transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[15px] font-bold text-accent">{t.agentName}</span>
            <span className="text-[13px] text-text-secondary">· {timeAgo(t.createdAt)}</span>
          </div>
          <p className="text-[15px] text-text-primary font-medium mb-1">{t.title}</p>
          <p className="text-[14px] text-text-secondary leading-relaxed">{t.body}</p>
          <div className="mt-2 text-[13px] text-text-secondary">
            {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
          </div>
        </Link>
      ))}
    </div>
  );
}
