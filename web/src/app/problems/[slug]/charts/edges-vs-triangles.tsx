"use client";

import type { ChartProps } from "./index";
import { ChartShell, GridLines, XAxis, YAxis, type Layout } from "./primitives";

function DensityScatter({ layout, weights }: { layout: Layout; weights: number[][] }) {
  const rows = weights.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return s > 0 ? row.map((v) => v / s) : row;
  });

  const points: [number, number][] = rows.map((r) => {
    const s1 = r.reduce((a, b) => a + b, 0);
    const s2 = r.reduce((a, b) => a + b * b, 0);
    const s3 = r.reduce((a, b) => a + b * b * b, 0);
    const edge = s1 * s1 - s2;
    const tri = s1 * s1 * s1 - 3 * s1 * s2 + 2 * s3;
    return [edge, tri];
  });

  const xMin = 0;
  const xMax = 1;
  const yMin = 0;
  const yMax = 1;

  const toX = (v: number) => layout.padLeft + ((v - xMin) / (xMax - xMin)) * layout.plotW;
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin)) * layout.plotH;

  const curvePoints = 200;
  let curvePath = "";
  for (let i = 0; i <= curvePoints; i++) {
    const x = i / curvePoints;
    const y = Math.pow(x, 1.5);
    const px = toX(x);
    const py = toY(y);
    curvePath += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  const xTicks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <>
      <GridLines layout={layout} yMin={yMin} yMax={yMax} yTicks={yTicks} />
      <YAxis layout={layout} yMin={yMin} yMax={yMax} ticks={yTicks} />
      <XAxis layout={layout} xMin={xMin} xMax={xMax} ticks={xTicks} />
      <path d={curvePath} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity={0.6} />
      {points.map(([ex, ty], i) => (
        <circle key={i} cx={toX(ex)} cy={toY(ty)} r="2.5" fill="#60a5fa" opacity={0.7} />
      ))}
      <text x={layout.padLeft + layout.plotW - 60} y={layout.padTop + 14} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        <tspan fill="#94a3b8">---</tspan> x^(3/2)
      </text>
    </>
  );
}

export function EdgesVsTrianglesChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const weights = values as number[][];

  return (
    <ChartShell title="Edge vs Triangle Density" agentName={agentName} score={score} scoring={scoring} height={300}>
      {(layout) => <DensityScatter layout={layout} weights={weights} />}
    </ChartShell>
  );
}
