import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("passes through plain math text untouched", () => {
    expect(sanitize("if x < n then f(x) > 0")).toBe("if x < n then f(x) > 0");
  });

  it("passes through LaTeX inequalities", () => {
    expect(sanitize("we need $x < \\epsilon$ and $y > 0$")).toBe(
      "we need $x < \\epsilon$ and $y > 0$"
    );
  });

  it("passes through interval notation", () => {
    expect(sanitize("consider [0, 1] and (-1, 1)")).toBe(
      "consider [0, 1] and (-1, 1)"
    );
  });

  it("passes through LaTeX block math", () => {
    const math = "$$\\sum_{i=0}^{n} x_i < \\delta$$";
    expect(sanitize(math)).toBe(math);
  });

  it("strips real HTML tags but keeps inner text", () => {
    expect(sanitize("<script>alert(1)</script>hello")).toBe("alert(1)hello");
    expect(sanitize("<div class='x'>text</div>")).toBe("text");
    expect(sanitize("<b>bold</b>")).toBe("bold");
  });

  it("strips markdown images", () => {
    expect(sanitize("text ![alt](https://evil.com/img.png) more")).toBe(
      "text  more"
    );
  });

  it("strips markdown link URLs but keeps label text", () => {
    expect(sanitize("see [Lemma 3](https://arxiv.org/abs/1234)")).toBe(
      "see Lemma 3"
    );
  });

  it("replaces bare URLs with [link removed]", () => {
    expect(sanitize("see https://arxiv.org/abs/1234 for details")).toBe(
      "see [link removed] for details"
    );
  });

  it("does not strip URLs inside markdown links (handled by MD_LINK first)", () => {
    const input = "read [the paper](https://arxiv.org/abs/1234)";
    expect(sanitize(input)).toBe("read the paper");
  });

  it("preserves code blocks with angle brackets", () => {
    expect(sanitize("use `f(x) < g(x)` here")).toBe("use `f(x) < g(x)` here");
  });

  it("passes through langle/rangle and set notation", () => {
    const input = "the inner product $\\langle u, v \\rangle$ and set $\\{x \\mid x > 0\\}$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through aligned block with inequalities", () => {
    const input = "$$\\begin{aligned} f(x) &< g(x) \\\\ h(x) &> 0 \\end{aligned}$$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through frac, sqrt, sum with limits", () => {
    const input = "$$\\frac{1}{n} \\sum_{k=1}^{n} \\sqrt{k} < \\log n$$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through matrix environment", () => {
    const input = "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through inline LaTeX mixed with inequalities and text", () => {
    const input = "for all $n > N_0$ we have $|f(n) - L| < \\varepsilon$, proving the limit";
    expect(sanitize(input)).toBe(input);
  });

  it("strips link but keeps label when label looks like math notation", () => {
    expect(sanitize("[Theorem 2.3](https://arxiv.org/abs/2401.0001) implies...")).toBe(
      "Theorem 2.3 implies..."
    );
  });

  it("handles mix of link removal and bare URL in same message", () => {
    const input = "see [the paper](https://foo.com) and also https://bar.com for context";
    expect(sanitize(input)).toBe("see the paper and also [link removed] for context");
  });

  it("strips link but keeps LaTeX label intact", () => {
    expect(sanitize("by [$O(n \\log n)$ bound](https://arxiv.org/abs/1234)")).toBe(
      "by $O(n \\log n)$ bound"
    );
  });

  it("does not mangle less-than inside words or subscripts", () => {
    const input = "$x_{i<j}$ and $f_{n>0}$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through double subscript with comparison", () => {
    const input = "$\\sum_{i<j} a_{ij}$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through comparison chain with spaces", () => {
    const input = "$a_1 < a_2 < \\cdots < a_n$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through absolute value inequality", () => {
    const input = "we need $|f(x) - L| < \\varepsilon$ for all $x > \\delta$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through norm inequality", () => {
    const input = "$\\|x - y\\| < 1$ implies $\\|x\\| < \\|y\\| + 1$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through Dirac bra-ket notation", () => {
    const input = "$\\langle \\psi | H | \\psi \\rangle \\geq E_0$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through left/right angle brackets", () => {
    const input = "$\\left\\langle x, y \\right\\rangle$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through set comprehension with inequality", () => {
    const input = "$\\{x \\in \\mathbb{R}^n \\mid x_i > 0 \\text{ for all } i\\}$";
    expect(sanitize(input)).toBe(input);
  });

  it("passes through forall/exists quantifiers", () => {
    const input = "$\\forall \\varepsilon > 0 \\; \\exists N \\; \\forall n > N: |a_n - L| < \\varepsilon$";
    expect(sanitize(input)).toBe(input);
  });

  it("strips HTML but preserves surrounding LaTeX", () => {
    const input = "note that $f(x) > 0$ <b>always</b> holds when $x < 1$";
    expect(sanitize(input)).toBe("note that $f(x) > 0$ always holds when $x < 1$");
  });

  it("handles no-space comparison a<b>c — <b> is ambiguous, gets stripped", () => {
    // <b> matches the HTML tag regex since b is a real HTML element.
    // This is a known limitation: nospaced comparisons like i<j>k are stripped.
    // Agents should write i < j > k or use LaTeX $i < j > k$ with spaces.
    const input = "for i<b>0 check";
    expect(sanitize(input)).toBe("for i0 check");
  });

  it("does not let MD_LINK eat function-application-like notation", () => {
    // [0,1] has no (url) part so it won't match MD_LINK
    expect(sanitize("the interval [0,1] and function f(x)")).toBe(
      "the interval [0,1] and function f(x)"
    );
  });

  it("passes through multiline LaTeX proof sketch", () => {
    const input = `We claim $f(n) < g(n)$ for all $n > N$.

Proof: by induction. Base case $n = N$:
$$f(N) = \\frac{1}{N} < \\frac{2}{N} = g(N).$$

Inductive step: assume $f(k) < g(k)$, then
$$f(k+1) \\leq f(k) + \\frac{1}{k^2} < g(k) + \\frac{1}{k^2} \\leq g(k+1). \\quad \\square$$`;
    expect(sanitize(input)).toBe(input);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitize("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });
});
