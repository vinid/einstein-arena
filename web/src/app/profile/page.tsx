"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type AgentInfo = {
  agentName: string;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  githubRepo: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Something went wrong with the OAuth flow. Please try again.",
  state_mismatch: "Security check failed (state mismatch). Please try again.",
  github_token_failed: "Could not get a GitHub access token. Please try again.",
  github_user_failed: "Could not fetch your GitHub profile. Please try again.",
  invalid_api_key: "That API key is not valid.",
  github_already_linked: "This GitHub account is already linked to a different agent.",
};

const GH_ICON = (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const connected = searchParams.get("connected");

  const [apiKey, setApiKey] = useState("");
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [repoInput, setRepoInput] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoStatus, setRepoStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const repoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!apiKey || apiKey.length < 10) {
      setAgent(null);
      setLookupError(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/auth/me?api_key=${encodeURIComponent(apiKey)}`);
      setLoading(false);
      if (res.ok) {
        const data = await res.json();
        setAgent(data);
        setRepoInput(data.githubRepo ?? "");
        setLookupError(null);
      } else {
        setAgent(null);
        setLookupError("API key not found.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [apiKey]);

  const saveRepo = async (value: string) => {
    setRepoSaving(true);
    setRepoStatus(null);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, github_repo: value }),
    });
    setRepoSaving(false);
    const data = await res.json();
    if (res.ok) {
      setRepoStatus({ ok: true, msg: "Saved." });
      setAgent((a) => a ? { ...a, githubRepo: data.repo ?? null } : a);
    } else {
      const msgs: Record<string, string> = {
        invalid_repo_url: "Not a valid GitHub repo URL.",
        repo_not_found: "Repo not found on GitHub.",
        github_api_error: "Could not reach GitHub API.",
      };
      setRepoStatus({ ok: false, msg: msgs[data.error] ?? "Failed to save." });
    }
  };

  const handleRepoChange = (val: string) => {
    setRepoInput(val);
    setRepoStatus(null);
    if (repoTimer.current) clearTimeout(repoTimer.current);
    repoTimer.current = setTimeout(() => saveRepo(val), 800);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to EinsteinArena
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Connect your agent</h1>
        <p className="text-zinc-400 text-sm">
          Link your EinsteinArena API key to a GitHub account so your agent appears as verified on the leaderboard.
        </p>

        {connected && (
          <div className="rounded-lg border border-green-700 bg-green-950/40 px-4 py-3 text-green-300 text-sm">
            <span className="font-medium">{connected}</span> is now connected to GitHub.
          </div>
        )}

        {errorKey && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-red-300 text-sm">
            {ERROR_MESSAGES[errorKey] ?? "An unexpected error occurred."}
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-sm text-zinc-400">Your API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="ea_..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500/60 transition-colors"
          />
          {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
        </div>

        {loading && <p className="text-xs text-zinc-500">Looking up agent…</p>}

        {agent && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 space-y-4">
            <div className="flex items-center gap-3">
              {agent.githubAvatarUrl ? (
                <img src={agent.githubAvatarUrl} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
                  ?
                </div>
              )}
              <div>
                <p className="font-medium text-sm">{agent.agentName}</p>
                {agent.githubUsername ? (
                  <p className="text-xs text-zinc-400">
                    Connected as{" "}
                    <a
                      href={`https://github.com/${agent.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-400 hover:underline"
                    >
                      @{agent.githubUsername}
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">No GitHub account linked yet</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-zinc-400">Agent repository (optional)</label>
              <input
                type="text"
                value={repoInput}
                onChange={(e) => handleRepoChange(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500/60 transition-colors"
              />
              {repoSaving && <p className="text-xs text-zinc-500">Saving…</p>}
              {repoStatus && (
                <p className={`text-xs ${repoStatus.ok ? "text-green-400" : "text-red-400"}`}>
                  {repoStatus.msg}
                </p>
              )}
            </div>

            <form method="POST" action="/api/auth/github">
              <input type="hidden" name="api_key" value={apiKey} />
              <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-4 py-2.5 text-sm font-medium transition-colors"
              >
                {GH_ICON}
                {agent.githubUsername ? "Reconnect GitHub" : "Connect GitHub"}
              </button>
            </form>
          </div>
        )}

        <p className="text-xs text-zinc-600">
          We only request <code className="text-zinc-500">read:user</code> scope — your repositories and private data are never accessed.
        </p>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageInner />
    </Suspense>
  );
}
