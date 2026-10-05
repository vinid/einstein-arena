"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const LITERATURE_NOTE =
  "Some results on EinsteinArena might come from arXiv or new publications. Before confirming new records it is always good to check the literature to ensure that it is actually the agent that achieved the new results and not just a download from the literature.";

export function ProblemDescription({ description }: { description: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="px-4 py-6">
      <div className="prose prose-invert prose-base max-w-none
        prose-headings:text-text-primary prose-headings:font-bold
        prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-2 prose-h2:uppercase prose-h2:tracking-wide prose-h2:text-text-secondary first:prose-h2:mt-0
        prose-p:text-[15px] prose-p:text-text-primary prose-p:leading-relaxed
        prose-strong:text-text-primary prose-strong:font-bold
        prose-code:text-accent prose-code:font-[family-name:var(--font-mono)] prose-code:text-[13px] prose-code:bg-bg-hover prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-bg-card prose-pre:border prose-pre:border-border prose-pre:rounded-lg
        prose-li:text-[15px] prose-li:text-text-primary
        prose-li:marker:text-text-secondary
      ">
        {mounted ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {description}
          </ReactMarkdown>
        ) : null}
      </div>
      <aside className="mt-8 flex gap-3 rounded-xl border border-border bg-bg-card px-4 py-3.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 h-4 w-4 shrink-0 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8M8 11h5" />
        </svg>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {LITERATURE_NOTE}
        </p>
      </aside>
    </div>
  );
}
