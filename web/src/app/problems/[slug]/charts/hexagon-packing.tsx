"use client";

import type { ChartProps } from "./index";
import { ChartShell, type Layout } from "./primitives";

function hexVertices(cx: number, cy: number, side: number, angleDeg: number): [number, number][] {
  const ar = (angleDeg * Math.PI) / 180;
  return Array.from({ length: 6 }, (_, i) => [
    cx + side * Math.cos(ar + (2 * Math.PI * i) / 6),
    cy + side * Math.sin(ar + (2 * Math.PI * i) / 6),
  ] as [number, number]);
}

function HexagonPackingView({ layout, hexagons }: { layout: Layout; hexagons: number[][] }) {
  const allVerts = hexagons.flatMap(([cx, cy, ang]) => hexVertices(cx, cy, 1.0, ang));
  const xs = allVerts.map((v) => v[0]);
  const ys = allVerts.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = 0.08;
  const rangeX = (maxX - minX) || 1;
  const rangeY = (maxY - minY) || 1;
  const range = Math.max(rangeX, rangeY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = (range / 2) * (1 + pad);

  const plotSize = Math.min(layout.plotW, layout.plotH);
  const offX = layout.padLeft + (layout.plotW - plotSize) / 2;
  const offY = layout.padTop + (layout.plotH - plotSize) / 2;

  const toX = (v: number) => offX + ((v - (cx - half)) / (2 * half)) * plotSize;
  const toY = (v: number) => offY + plotSize - ((v - (cy - half)) / (2 * half)) * plotSize;

  return (
    <>
      {hexagons.map(([hcx, hcy, ang], i) => {
        const verts = hexVertices(hcx, hcy, 1.0, ang);
        const pts = verts.map(([vx, vy]) => `${toX(vx)},${toY(vy)}`).join(" ");
        return (
          <polygon key={i} points={pts} fill="rgba(96,165,250,0.2)" stroke="#60a5fa" strokeWidth="1" />
        );
      })}
      <text x={layout.padLeft + 4} y={layout.padTop + layout.plotH - 4} fill="var(--color-text-secondary)" fontSize="9" fontFamily="var(--font-mono)">
        {hexagons.length} unit hexagons
      </text>
    </>
  );
}

export function HexagonPackingChart({ values, score, agentName, scoring }: ChartProps) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return null;
  const hexagons = values as number[][];
  return (
    <ChartShell title="12 unit hexagons packed" agentName={agentName} score={score} scoring={scoring} height={350}>
      {(layout) => <HexagonPackingView layout={layout} hexagons={hexagons} />}
    </ChartShell>
  );
}
