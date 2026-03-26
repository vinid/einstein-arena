"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function DifferenceBasesView({ layout, values }: { layout: Layout; values: number[] }) {
  const sorted = [...values].sort((a, b) => a - b);
  const maxVal = sorted[sorted.length - 1] || 1;
  const n = sorted.length;

  const toX = (v: number) => layout.padLeft + (v / maxVal) * layout.plotW;
  const midY = layout.padTop + layout.plotH / 2;

  const tickH = 8;

  return (
    <>
      <line
        x1={layout.padLeft}
        y1={midY}
        x2={layout.padLeft + layout.plotW}
        y2={midY}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {sorted.map((v, i) => (
        <line
          key={i}
          x1={toX(v)}
          y1={midY - tickH}
          x2={toX(v)}
          y2={midY + tickH}
          stroke="#60a5fa"
          strokeWidth="1"
          opacity="0.7"
        />
      ))}
      <text x={layout.padLeft} y={layout.padTop + 12} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        0
      </text>
      <text x={layout.padLeft + layout.plotW} y={layout.padTop + 12} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">
        {maxVal.toLocaleString()}
      </text>
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        {n} elements
      </text>
    </>
  );
}

export function DifferenceBasesChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || Array.isArray(values[0])) return null;
  const nums = values as number[];
  return (
    <ChartShell title="Difference basis — element positions" agentName={agentName} score={score} scoring={scoring} height={160}>
      {(layout) => <DifferenceBasesView layout={layout} values={nums} />}
    </ChartShell>
  );
}
