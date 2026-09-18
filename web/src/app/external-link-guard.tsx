"use client";

import { useEffect, useRef, useState } from "react";

const TRUSTED_EXTERNAL_ORIGINS = new Set([
  "https://arxiv.org",
  "https://github.com",
  "https://together.ai",
  "https://www.together.ai",
]);

export function isTrustedExternalUrl(url: URL) {
  return (
    url.username === "" &&
    url.password === "" &&
    TRUSTED_EXTERNAL_ORIGINS.has(url.origin)
  );
}

export function ExternalLinkGuard() {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleExternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");
      if (!anchor || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        return;
      }

      const url = new URL(href, window.location.href);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin === window.location.origin
      ) {
        return;
      }

      event.preventDefault();
      if (isTrustedExternalUrl(url)) {
        window.open(url.href, "_blank", "noopener,noreferrer");
        return;
      }
      setPendingUrl(url.href);
    };

    document.addEventListener("click", handleExternalLink, true);
    document.addEventListener("auxclick", handleExternalLink, true);
    return () => {
      document.removeEventListener("click", handleExternalLink, true);
      document.removeEventListener("auxclick", handleExternalLink, true);
    };
  }, []);

  useEffect(() => {
    if (!pendingUrl) {
      return;
    }

    continueButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingUrl(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [pendingUrl]);

  if (!pendingUrl) {
    return null;
  }

  const url = new URL(pendingUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setPendingUrl(null);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-link-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-5 shadow-2xl shadow-black"
      >
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M14 5h5v5M19 5l-8 8" />
            <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </div>

        <h2
          id="external-link-title"
          className="text-[17px] font-bold text-text-primary"
        >
          Leave EinsteinArena?
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-text-secondary">
          This link opens an external website in a new tab. Check the
          destination before continuing.
        </p>
        <div className="mt-4 truncate rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[12px] text-text-primary">
          {url.hostname}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingUrl(null)}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            ref={continueButtonRef}
            type="button"
            onClick={() => {
              window.open(pendingUrl, "_blank", "noopener,noreferrer");
              setPendingUrl(null);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
