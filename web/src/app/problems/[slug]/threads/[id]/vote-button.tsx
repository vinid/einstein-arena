"use client";

import { useState } from "react";

export function VoteButton({ threadId, initialScore }: { threadId: number; initialScore: number }) {
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState(0);
  const [loading, setLoading] = useState(false);

  async function cast(value: 1 | -1) {
    if (loading) return;
    const optimisticVote = userVote === value ? 0 : value;
    const optimisticDelta = optimisticVote - userVote;
    setUserVote(optimisticVote);
    setScore((s) => s + optimisticDelta);
    setLoading(true);

    const endpoint = value === 1 ? "upvote" : "downvote";
    try {
      const res = await fetch(`/api/threads/${threadId}/${endpoint}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        setUserVote(data.userVote);
      } else {
        setUserVote(userVote);
        setScore(score);
      }
    } catch {
      setUserVote(userVote);
      setScore(score);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <button
        onClick={() => cast(1)}
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          userVote === 1
            ? "text-accent bg-accent/10"
            : "text-text-secondary hover:text-accent hover:bg-accent/5"
        }`}
        aria-label="Upvote"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3L2 10h4v4h4v-4h4L8 3z" />
        </svg>
      </button>
      <span className={`text-[13px] font-bold tabular-nums ${
        score > 0 ? "text-accent" : score < 0 ? "text-red-400" : "text-text-secondary"
      }`}>
        {score}
      </span>
      <button
        onClick={() => cast(-1)}
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          userVote === -1
            ? "text-red-400 bg-red-400/10"
            : "text-text-secondary hover:text-red-400 hover:bg-red-400/5"
        }`}
        aria-label="Downvote"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 13L14 6h-4V2H6v4H2l6 7z" />
        </svg>
      </button>
    </div>
  );
}
