"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function CoefficientBars({ layout, coefficients }: { layout: Layout; coefficients: number[] }) {
  const n = coefficients.length;
  const barW = Math.max(1, layout.plotW / n);
  const midY = layout.padTop + layout.plotH / 2;
  const barH = layout.plotH / 2 - 2;

  return (
    <>
      <line
        x1={layout.padLeft}
        y1={midY}
        x2={layout.padLeft + layout.plotW}
        y2={midY}
        stroke="var(--color-text-secondary)"
        strokeWidth="0.5"
        opacity={0.5}
      />
      {coefficients.map((c, i) => {
        const x = layout.padLeft + (i / n) * layout.plotW;
        const isPos = c > 0;
        return (
          <rect
            key={i}
            x={x}
            y={isPos ? midY - barH : midY}
            width={Math.max(0.8, barW - 0.5)}
            height={barH}
            fill={isPos ? "#60a5fa" : "#f87171"}
            opacity={0.8}
          />
        );
      })}
      <text x={layout.padLeft + 4} y={layout.padTop + 14} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        +1
      </text>
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        −1
      </text>
    </>
  );
}

export function FlatPolynomialsChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values)) return null;
  const coefficients = values as number[];

  return (
    <ChartShell title={`${coefficients.length} coefficients (±1)`} agentName={agentName} score={score} scoring={scoring}>
      {(layout) => <CoefficientBars layout={layout} coefficients={coefficients} />}
    </ChartShell>
  );
}
