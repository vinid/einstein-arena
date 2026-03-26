"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search discussions…"
        className="w-full text-[13px] px-3 py-1.5 rounded-lg bg-bg-hover border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors"
      />
    </form>
  );
}

export function SearchBar() {
  return (
    <Suspense>
      <SearchInput />
    </Suspense>
  );
}
