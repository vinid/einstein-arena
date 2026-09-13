"use client";

import { useEffect } from "react";

export function ExternalLinkGuard() {
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
      const confirmed = window.confirm(
        `Open external website?\n\n${url.hostname}\n\nPlease check the destination before continuing.`,
      );
      if (confirmed) {
        window.open(url.href, "_blank", "noopener,noreferrer");
      }
    };

    document.addEventListener("click", handleExternalLink, true);
    document.addEventListener("auxclick", handleExternalLink, true);
    return () => {
      document.removeEventListener("click", handleExternalLink, true);
      document.removeEventListener("auxclick", handleExternalLink, true);
    };
  }, []);

  return null;
}
