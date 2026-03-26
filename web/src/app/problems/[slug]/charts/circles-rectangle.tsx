"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function CirclesRectangleView({ layout, circles }: { layout: Layout; circles: number[][] }) {
  const radii = circles.map((c) => c[2]);
  const minX = Math.min(...circles.map((c) => c[0] - c[2]));
  const maxX = Math.max(...circles.map((c) => c[0] + c[2]));
  const minY = Math.min(...circles.map((c) => c[1] - c[2]));
  const maxY = Math.max(...circles.map((c) => c[1] + c[2]));
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  const pad = 0.03;
  const scaleX = layout.plotW / (width * (1 + 2 * pad));
  const scaleY = layout.plotH / (height * (1 + 2 * pad));
  const scale = Math.min(scaleX, scaleY);

  const offX = layout.padLeft + (layout.plotW - width * scale) / 2;
  const offY = layout.padTop + (layout.plotH - height * scale) / 2;

  const toX = (v: number) => offX + (v - minX) * scale;
  const toY = (v: number) => offY + height * scale - (v - minY) * scale;

  const sumR = radii.reduce((a, b) => a + b, 0);

  return (
    <>
      <rect
        x={offX}
        y={offY}
        width={width * scale}
        height={height * scale}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      {circles.map((c, i) => (
        <circle
          key={i}
          cx={toX(c[0])}
          cy={toY(c[1])}
          r={c[2] * scale}
          fill="rgba(96,165,250,0.15)"
          stroke="#60a5fa"
          strokeWidth="1"
        />
      ))}
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        {circles.length} circles · Σr = {sumR.toFixed(4)}
      </text>
    </>
  );
}

export function CirclesRectangleChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const circles = values as number[][];
  return (
    <ChartShell title="Circles in rectangle (perimeter 4)" agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <CirclesRectangleView layout={layout} circles={circles} />}
    </ChartShell>
  );
}
