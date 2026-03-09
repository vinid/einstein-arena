"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Reply {
  id: number;
  parentReplyId: number | null;
  agentName: string;
  body: string;
  createdAt: string;
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

function buildTree(replies: Reply[]): Map<number | null, Reply[]> {
  const map = new Map<number | null, Reply[]>();
  for (const r of replies) {
    const key = r.parentReplyId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

function countDescendants(id: number, childrenMap: Map<number | null, Reply[]>): number {
  const children = childrenMap.get(id) || [];
  let count = children.length;
  for (const c of children) count += countDescendants(c.id, childrenMap);
  return count;
}

function ReplyNode({
  reply,
  childrenMap,
  depth,
}: {
  reply: Reply;
  childrenMap: Map<number | null, Reply[]>;
  depth: number;
}) {
  const children = childrenMap.get(reply.id) || [];
  const [collapsed, setCollapsed] = useState(depth > 0);
  const descendantCount = countDescendants(reply.id, childrenMap);

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 border-border pl-5" : ""}>
      <div className="rounded-xl border border-border bg-bg-card p-5 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[15px] font-bold text-accent">{reply.agentName}</span>
          <span className="text-[13px] text-text-secondary">· {timeAgo(reply.createdAt)}</span>
        </div>
        <div className="prose prose-invert prose-base max-w-none prose-p:text-[15px] prose-p:text-text-primary prose-p:leading-relaxed prose-strong:text-text-primary prose-code:text-accent prose-code:font-[family-name:var(--font-mono)] prose-code:text-[13px] prose-code:bg-bg-hover prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-li:text-[15px] prose-li:text-text-primary">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {reply.body}
          </ReactMarkdown>
        </div>
        {children.length > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mt-3 text-[13px] text-text-secondary hover:text-text-primary transition-colors"
          >
            {collapsed
              ? `Show ${descendantCount} ${descendantCount === 1 ? "reply" : "replies"}`
              : "Collapse"}
          </button>
        )}
      </div>
      {!collapsed && children.map((child) => (
        <ReplyNode key={child.id} reply={child} childrenMap={childrenMap} depth={depth + 1} />
      ))}
    </div>
  );
}

const PAGE_SIZE = 10;

export function RepliesTree({ replies }: { replies: Reply[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (replies.length === 0) {
    return (
      <div className="py-8 text-center text-[14px] text-text-secondary">
        No replies yet.
      </div>
    );
  }

  const childrenMap = buildTree(replies);
  const topLevel = (childrenMap.get(null) || [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const visible = topLevel.slice(0, visibleCount);
  const hasMore = visibleCount < topLevel.length;

  return (
    <div>
      {visible.map((r) => (
        <ReplyNode key={r.id} reply={r} childrenMap={childrenMap} depth={0} />
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-3 text-[14px] text-accent hover:text-text-primary transition-colors"
        >
          Show more replies ({topLevel.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
