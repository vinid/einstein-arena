"use client";

import type { ChartProps } from "./index";
import { ChartShell, StepPlot, XAxis, YAxis, GridLines, ZeroLine, type Layout } from "./primitives";

function computeYBounds(values: number[], allowNeg: boolean): { yMin: number; yMax: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yMin = allowNeg ? min * 1.1 : 0;
  const yMax = max * 1.2 || 1;
  return { yMin, yMax };
}

function niceYTicks(yMin: number, yMax: number, count: number): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(yMin + (i / count) * (yMax - yMin));
  }
  return ticks;
}

export function AutocorrelationChart({ values, score, agentName, scoring }: ChartProps) {
  const n = values.length;
  const allowNeg = values.some((v) => v < 0);
  const bounds = computeYBounds(values, allowNeg);

  return (
    <ChartShell title="f(x)" agentName={agentName} score={score} scoring={scoring}>
      {(layout: Layout) => (
        <>
          <GridLines layout={layout} yMin={bounds.yMin} yMax={bounds.yMax} yTicks={niceYTicks(bounds.yMin, bounds.yMax, 4)} />
          <YAxis layout={layout} yMin={bounds.yMin} yMax={bounds.yMax} ticks={niceYTicks(bounds.yMin, bounds.yMax, 4)} />
          <XAxis layout={layout} xMin={-0.25} xMax={0.25} ticks={[-0.25, -0.125, 0, 0.125, 0.25]} />
          <ZeroLine layout={layout} yMin={bounds.yMin} yMax={bounds.yMax} />
          <StepPlot layout={layout} values={values} xMin={-0.25} xMax={0.25} yMin={bounds.yMin} yMax={bounds.yMax} color="#6495ED" />
          <text x={layout.padLeft + layout.plotW - 4} y={layout.padTop + 14} fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="end">
            values ({n} pts)
          </text>
        </>
      )}
    </ChartShell>
  );
}
