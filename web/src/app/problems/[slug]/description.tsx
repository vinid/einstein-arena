"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function ProblemDescription({ description }: { description: string }) {
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
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {description}
        </ReactMarkdown>
      </div>
    </div>
  );
}
