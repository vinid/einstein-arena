"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function pairwiseDistances(pts: number[][]): { min: number; max: number; minPairs: [number, number][]; maxPairs: [number, number][] } {
  const dists: { i: number; j: number; d: number }[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.sqrt((pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2);
      dists.push({ i, j, d });
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  const rtol = 1e-5;
  const minPairs = dists.filter((e) => Math.abs(e.d - min) <= rtol * min).map((e) => [e.i, e.j] as [number, number]);
  const maxPairs = dists.filter((e) => Math.abs(e.d - max) <= rtol * max).map((e) => [e.i, e.j] as [number, number]);
  return { min, max, minPairs, maxPairs };
}

function ScatterPlot({ layout, points }: { layout: Layout; points: number[][] }) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = 0.1;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const dataRange = Math.max(xMax - xMin, yMax - yMin) || 1;
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const half = dataRange / 2 * (1 + pad);

  const plotSize = Math.min(layout.plotW, layout.plotH);
  const offX = layout.padLeft + (layout.plotW - plotSize) / 2;
  const offY = layout.padTop + (layout.plotH - plotSize) / 2;

  const toX = (v: number) => offX + ((v - (xMid - half)) / (2 * half)) * plotSize;
  const toY = (v: number) => offY + plotSize - ((v - (yMid - half)) / (2 * half)) * plotSize;

  const { minPairs, maxPairs } = pairwiseDistances(points);

  return (
    <>
      {maxPairs.map(([i, j], k) => (
        <line key={`max-${k}`} x1={toX(points[i][0])} y1={toY(points[i][1])} x2={toX(points[j][0])} y2={toY(points[j][1])} stroke="#ef4444" strokeWidth="1.5" opacity="0.5" />
      ))}
      {minPairs.map(([i, j], k) => (
        <line key={`min-${k}`} x1={toX(points[i][0])} y1={toY(points[i][1])} x2={toX(points[j][0])} y2={toY(points[j][1])} stroke="#3b82f6" strokeWidth="1.5" opacity="0.7" />
      ))}
      {points.map((p, i) => (
        <circle key={i} cx={toX(p[0])} cy={toY(p[1])} r="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
      ))}
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        <tspan fill="#3b82f6">—</tspan> min dist
        <tspan dx="8" fill="#ef4444">—</tspan> max dist
      </text>
    </>
  );
}

export function PointConfigChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const points = values as number[][];

  return (
    <ChartShell title={`${points.length} points in 2D`} agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <ScatterPlot layout={layout} points={points} />}
    </ChartShell>
  );
}
