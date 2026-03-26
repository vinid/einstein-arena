"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function minTriArea(pts: number[][]): [number, number, number] {
  let minA = Infinity;
  let best: [number, number, number] = [0, 1, 2];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const a = Math.abs(
          pts[i][0] * (pts[j][1] - pts[k][1]) +
          pts[j][0] * (pts[k][1] - pts[i][1]) +
          pts[k][0] * (pts[i][1] - pts[j][1])
        ) / 2;
        if (a < minA) { minA = a; best = [i, j, k]; }
      }
    }
  }
  return best;
}

function HeilbronnTriangleView({ layout, points }: { layout: Layout; points: number[][] }) {
  const sq3 = Math.sqrt(3);
  const A = [0, 0];
  const B = [1, 0];
  const C = [0.5, sq3 / 2];

  const plotSize = Math.min(layout.plotW, layout.plotH);
  const offX = layout.padLeft + (layout.plotW - plotSize) / 2;
  const offY = layout.padTop + (layout.plotH - plotSize) / 2;

  const pad = 0.05;
  const toX = (v: number) => offX + (v + pad) / (1 + 2 * pad) * plotSize;
  const toY = (v: number) => offY + plotSize - (v + pad) / (sq3 / 2 + 2 * pad) * plotSize;

  const triPts = [A, B, C].map(([x, y]) => `${toX(x)},${toY(y)}`).join(" ");

  const [bi, bj, bk] = minTriArea(points);
  const minPts = [bi, bj, bk].map((idx) => `${toX(points[idx][0])},${toY(points[idx][1])}`).join(" ");

  return (
    <>
      <polygon points={triPts} fill="rgba(71,85,105,0.15)" stroke="var(--color-border)" strokeWidth="1.5" />
      <polygon points={minPts} fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={i} cx={toX(p[0])} cy={toY(p[1])} r="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
      ))}
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        <tspan fill="#ef4444">▲</tspan> min-area triple
      </text>
    </>
  );
}

export function HeilbronnTrianglesChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const points = values as number[][];
  return (
    <ChartShell title="11 points in unit equilateral triangle" agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <HeilbronnTriangleView layout={layout} points={points} />}
    </ChartShell>
  );
}
