"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function SphereView({ layout, points, label }: { layout: Layout; points: number[][]; label: string }) {
  const size = Math.min(layout.plotW, layout.plotH);
  const cx = layout.padLeft + layout.plotW / 2;
  const cy = layout.padTop + layout.plotH / 2;
  const r = size / 2 - 4;

  const toX = (x: number) => cx + x * r;
  const toY = (y: number) => cy - y * r;

  const sorted = [...points].sort((a, b) => a[1] - b[1]);

  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth="0.5" />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.3} fill="none" stroke="var(--color-border)" strokeWidth="0.3" strokeDasharray="4 4" />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="var(--color-border)" strokeWidth="0.3" strokeDasharray="4 4" />
      {sorted.map((p, i) => {
        const norm = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) || 1;
        const nx = p[0] / norm;
        const ny = p[1] / norm;
        const nz = p[2] / norm;
        const depth = (ny + 1) / 2;
        const opacity = 0.3 + 0.7 * depth;
        const dotR = 1.5 + 1.5 * depth;
        return (
          <circle
            key={i}
            cx={toX(nx)}
            cy={toY(nz)}
            r={dotR}
            fill={`rgba(96, 165, 250, ${opacity})`}
            stroke="rgba(96, 165, 250, 0.5)"
            strokeWidth="0.5"
          />
        );
      })}
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        {label}
      </text>
    </>
  );
}

export function SphereProjectionChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const points = values as number[][];

  return (
    <ChartShell title={`${points.length} points on S²`} agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => (
        <SphereView layout={layout} points={points} label={`n = ${points.length}`} />
      )}
    </ChartShell>
  );
}
