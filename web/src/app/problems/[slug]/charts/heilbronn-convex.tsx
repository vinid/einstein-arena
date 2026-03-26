"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function convexHullIndices(pts: number[][]): number[] {
  const n = pts.length;
  if (n < 3) return pts.map((_, i) => i);
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i][0] < pts[start][0] || (pts[i][0] === pts[start][0] && pts[i][1] < pts[start][1])) start = i;
  }
  const hull: number[] = [];
  let curr = start;
  do {
    hull.push(curr);
    let next = (curr + 1) % n;
    for (let i = 0; i < n; i++) {
      const cross =
        (pts[next][0] - pts[curr][0]) * (pts[i][1] - pts[curr][1]) -
        (pts[next][1] - pts[curr][1]) * (pts[i][0] - pts[curr][0]);
      if (cross < 0) next = i;
    }
    curr = next;
  } while (curr !== start && hull.length <= n);
  return hull;
}

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

function HeilbronnConvexView({ layout, points }: { layout: Layout; points: number[][] }) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = 0.1;
  const dataRange = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = (dataRange / 2) * (1 + pad);

  const plotSize = Math.min(layout.plotW, layout.plotH);
  const offX = layout.padLeft + (layout.plotW - plotSize) / 2;
  const offY = layout.padTop + (layout.plotH - plotSize) / 2;

  const toX = (v: number) => offX + ((v - (xMid - half)) / (2 * half)) * plotSize;
  const toY = (v: number) => offY + plotSize - ((v - (yMid - half)) / (2 * half)) * plotSize;

  const hullIdx = convexHullIndices(points);
  const hullPts = hullIdx.map((i) => `${toX(points[i][0])},${toY(points[i][1])}`).join(" ");

  const [bi, bj, bk] = minTriArea(points);
  const minPts = [bi, bj, bk].map((idx) => `${toX(points[idx][0])},${toY(points[idx][1])}`).join(" ");

  return (
    <>
      <polygon points={hullPts} fill="rgba(71,85,105,0.15)" stroke="var(--color-border)" strokeWidth="1.5" />
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

export function HeilbronnConvexChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const points = values as number[][];
  return (
    <ChartShell title="14 points in convex region" agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <HeilbronnConvexView layout={layout} points={points} />}
    </ChartShell>
  );
}
