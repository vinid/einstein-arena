"use client";

import { ReactNode } from "react";

export interface Layout {
  w: number;
  h: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
  plotW: number;
  plotH: number;
}

const DEFAULT_LAYOUT: Layout = {
  w: 600,
  h: 220,
  padTop: 12,
  padRight: 16,
  padBottom: 28,
  padLeft: 48,
  plotW: 600 - 48 - 16,
  plotH: 220 - 12 - 28,
};

function fmtTick(v: number) {
  if (v === 0) return "0";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function ChartShell({
  title,
  agentName,
  score,
  scoring,
  height,
  children,
}: {
  title: string;
  agentName: string;
  score: number;
  scoring: string;
  height?: number;
  children: (layout: Layout) => ReactNode;
}) {
  const layout: Layout = height
    ? { ...DEFAULT_LAYOUT, h: height, plotH: height - DEFAULT_LAYOUT.padTop - DEFAULT_LAYOUT.padBottom }
    : DEFAULT_LAYOUT;

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-text-primary">{title}</h2>
        <div className="flex items-center gap-3 text-[12px] text-text-secondary min-w-0">
          <span className="truncate max-w-[160px]">{agentName}</span>
          <span className={`font-[family-name:var(--font-mono)] ${scoring === "minimize" ? "text-blue-400" : "text-emerald-400"}`}>
            {score.toFixed(8)}
          </span>
        </div>
      </div>
      <div className="p-4">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className="w-full h-auto">
          <rect x={layout.padLeft} y={layout.padTop} width={layout.plotW} height={layout.plotH} fill="none" stroke="var(--color-border)" strokeWidth="0.5" rx="2" />
          {children(layout)}
        </svg>
      </div>
    </div>
  );
}

export function GridLines({ layout, yMin, yMax, yTicks }: { layout: Layout; yMin: number; yMax: number; yTicks: number[] }) {
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin)) * layout.plotH;

  return (
    <>
      {yTicks.map((v) => (
        <line key={v} x1={layout.padLeft} y1={toY(v)} x2={layout.padLeft + layout.plotW} y2={toY(v)} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4 4" />
      ))}
    </>
  );
}

export function YAxis({ layout, yMin, yMax, ticks }: { layout: Layout; yMin: number; yMax: number; ticks: number[] }) {
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin)) * layout.plotH;

  return (
    <>
      {ticks.map((v) => (
        <text key={v} x={layout.padLeft - 6} y={toY(v) + 4} fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="end">
          {fmtTick(v)}
        </text>
      ))}
    </>
  );
}

export function XAxis({ layout, xMin, xMax, ticks }: { layout: Layout; xMin: number; xMax: number; ticks: number[] }) {
  const toX = (v: number) => layout.padLeft + ((v - xMin) / (xMax - xMin)) * layout.plotW;

  return (
    <>
      {ticks.map((v) => (
        <text key={v} x={toX(v)} y={layout.padTop + layout.plotH + 16} fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">
          {fmtTick(v)}
        </text>
      ))}
    </>
  );
}

export function StepPlot({
  layout,
  values,
  xMin,
  xMax,
  yMin,
  yMax,
  color,
}: {
  layout: Layout;
  values: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  color: string;
}) {
  const n = values.length;
  const toX = (frac: number) => layout.padLeft + frac * layout.plotW;
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin || 1)) * layout.plotH;

  let d = "";
  for (let i = 0; i < n; i++) {
    const x1 = toX((i / n) * ((xMax - xMin) / (xMax - xMin)));
    const x1n = toX(i / n);
    const x2n = toX((i + 1) / n);
    const y = toY(values[i]);
    d += i === 0 ? `M ${x1n} ${y}` : ` L ${x1n} ${y}`;
    d += ` L ${x2n} ${y}`;
  }

  return <path d={d} fill="none" stroke={color} strokeWidth="1.5" />;
}

export function ZeroLine({ layout, yMin, yMax }: { layout: Layout; yMin: number; yMax: number }) {
  if (yMin >= 0) return null;
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin)) * layout.plotH;
  const y = toY(0);
  if (y < layout.padTop || y > layout.padTop + layout.plotH) return null;
  return <line x1={layout.padLeft} y1={y} x2={layout.padLeft + layout.plotW} y2={y} stroke="var(--color-text-secondary)" strokeWidth="0.8" strokeDasharray="6 3" opacity={0.5} />;
}

export function LinePlot({
  layout,
  values,
  xMin,
  xMax,
  yMin,
  yMax,
  color,
}: {
  layout: Layout;
  values: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  color: string;
}) {
  const n = values.length;
  const toX = (i: number) => layout.padLeft + (i / (n - 1)) * layout.plotW;
  const toY = (v: number) => layout.padTop + layout.plotH - ((v - yMin) / (yMax - yMin || 1)) * layout.plotH;

  let d = "";
  for (let i = 0; i < n; i++) {
    d += i === 0 ? `M ${toX(i)} ${toY(values[i])}` : ` L ${toX(i)} ${toY(values[i])}`;
  }

  return <path d={d} fill="none" stroke={color} strokeWidth="1.5" />;
}

export function convolve(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}
