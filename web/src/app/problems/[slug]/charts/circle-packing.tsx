"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function PackingView({ layout, circles }: { layout: Layout; circles: number[][] }) {
  const size = Math.min(layout.plotW, layout.plotH);
  const offX = layout.padLeft + (layout.plotW - size) / 2;
  const offY = layout.padTop + (layout.plotH - size) / 2;

  const toX = (v: number) => offX + v * size;
  const toY = (v: number) => offY + (1 - v) * size;
  const toR = (r: number) => r * size;

  return (
    <>
      <rect x={offX} y={offY} width={size} height={size} fill="none" stroke="var(--color-border)" strokeWidth="1" />
      {circles.map((c, i) => (
        <circle
          key={i}
          cx={toX(c[0])}
          cy={toY(c[1])}
          r={toR(c[2])}
          fill="rgba(96, 165, 250, 0.15)"
          stroke="#60a5fa"
          strokeWidth="1"
        />
      ))}
      <text x={offX + 4} y={offY + size - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        {circles.length} circles
      </text>
    </>
  );
}

export function CirclePackingChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const circles = values as number[][];

  return (
    <ChartShell title="Circle Packing in Unit Square" agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <PackingView layout={layout} circles={circles} />}
    </ChartShell>
  );
}
