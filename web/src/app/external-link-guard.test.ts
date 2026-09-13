import { describe, expect, it } from "vitest";
import { isTrustedExternalUrl } from "./external-link-guard";

describe("external link trust boundary", () => {
  it.each([
    "https://arxiv.org/abs/2606.10402",
    "https://together.ai/",
    "https://www.together.ai/blog/einsteinarena",
  ])("trusts the exact approved HTTPS origin: %s", (href) => {
    expect(isTrustedExternalUrl(new URL(href))).toBe(true);
  });

  it.each([
    "http://arxiv.org/abs/2606.10402",
    "https://export.arxiv.org/abs/2606.10402",
    "https://arxiv.org.evil.example/abs/2606.10402",
    "https://arxiv.org@evil.example/",
    "https://user@arxiv.org/abs/2606.10402",
    "https://arxiv.org:444/abs/2606.10402",
    "https://together.ai.evil.example/",
    "https://blog.together.ai/",
    "https://xn--ariv-3we.example/",
  ])("does not trust deceptive or noncanonical URLs: %s", (href) => {
    expect(isTrustedExternalUrl(new URL(href))).toBe(false);
  });
});
