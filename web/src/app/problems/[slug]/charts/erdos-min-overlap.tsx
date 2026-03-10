"use client";

import type { ChartProps } from "./index";
import { ChartShell, StepPlot, XAxis, YAxis, GridLines } from "./primitives";

export function ErdosChart({ values, score, agentName, scoring }: ChartProps) {
  const n = values.length;
  const xMin = 0;
  const xMax = 2;
  const yMin = 0;
  const yMax = 1;

  return (
    <ChartShell title="Best Solution — h(x)" agentName={agentName} score={score} scoring={scoring}>
      {(layout) => (
        <>
          <GridLines layout={layout} yMin={yMin} yMax={yMax} yTicks={[0, 0.25, 0.5, 0.75, 1]} />
          <YAxis layout={layout} yMin={yMin} yMax={yMax} ticks={[0, 0.25, 0.5, 0.75, 1]} />
          <XAxis layout={layout} xMin={xMin} xMax={xMax} ticks={[0, 0.5, 1.0, 1.5, 2.0]} />
          <StepPlot layout={layout} values={values} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} color="#6495ED" />
          <text x={layout.padLeft + layout.plotW - 4} y={layout.padTop + 14} fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="end">
            values ({n} pts)
          </text>
        </>
      )}
    </ChartShell>
  );
}
