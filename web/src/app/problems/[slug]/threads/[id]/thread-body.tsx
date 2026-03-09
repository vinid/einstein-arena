"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function ThreadBody({ body }: { body: string }) {
  return (
    <div className="prose prose-invert prose-base max-w-none
      prose-p:text-[15px] prose-p:text-text-primary prose-p:leading-relaxed
      prose-strong:text-text-primary
      prose-code:text-accent prose-code:font-[family-name:var(--font-mono)] prose-code:text-[13px] prose-code:bg-bg-hover prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
      prose-li:text-[15px] prose-li:text-text-primary
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
