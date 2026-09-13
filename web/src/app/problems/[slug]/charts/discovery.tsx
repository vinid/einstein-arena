"use client";

import type { ChartProps } from "./index";
import { ChartShell } from "./primitives";

function numberRows(values: unknown[]): number[][] | null {
  if (
    !values.every(
      (row) =>
        Array.isArray(row) && row.every((value) => typeof value === "number"),
    )
  ) {
    return null;
  }
  return values as number[][];
}

function parseRational(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const slash = value.indexOf("/");
  const parsed =
    slash === -1
      ? Number(value)
      : Number(value.slice(0, slash)) / Number(value.slice(slash + 1));
  return Number.isFinite(parsed) ? parsed : null;
}

export function NoThreeInLineChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  const points = numberRows(values);
  if (!points || points.some((point) => point.length !== 2)) return null;

  return (
    <ChartShell
      title={`${points.length} points on the 75 × 75 grid`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={350}
    >
      {(layout) => {
        const size = Math.min(layout.plotW, layout.plotH);
        const left = layout.padLeft + (layout.plotW - size) / 2;
        const top = layout.padTop + (layout.plotH - size) / 2;
        const toX = (x: number) => left + (x / 74) * size;
        const toY = (y: number) => top + size - (y / 74) * size;
        return (
          <>
            {[0, 10, 20, 30, 40, 50, 60, 70].map((tick) => (
              <g key={tick}>
                <line
                  x1={toX(tick)}
                  y1={top}
                  x2={toX(tick)}
                  y2={top + size}
                  stroke="var(--color-border)"
                  strokeWidth="0.5"
                />
                <line
                  x1={left}
                  y1={toY(tick)}
                  x2={left + size}
                  y2={toY(tick)}
                  stroke="var(--color-border)"
                  strokeWidth="0.5"
                />
              </g>
            ))}
            {points.map(([x, y], index) => (
              <circle
                key={index}
                cx={toX(x)}
                cy={toY(y)}
                r="3"
                fill="#22d3ee"
                stroke="#083344"
                strokeWidth="0.8"
              />
            ))}
          </>
        );
      }}
    </ChartShell>
  );
}

export function SortingNetworkChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  const comparators = numberRows(values);
  if (!comparators || comparators.some((pair) => pair.length !== 2)) return null;

  return (
    <ChartShell
      title={`16-wire network · ${comparators.length} comparators`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={280}
    >
      {(layout) => {
        const wireY = (wire: number) =>
          layout.padTop + (wire / 15) * layout.plotH;
        const comparatorX = (index: number) =>
          layout.padLeft +
          ((index + 0.5) / Math.max(comparators.length, 1)) * layout.plotW;
        return (
          <>
            {Array.from({ length: 16 }, (_, wire) => (
              <g key={wire}>
                <line
                  x1={layout.padLeft}
                  y1={wireY(wire)}
                  x2={layout.padLeft + layout.plotW}
                  y2={wireY(wire)}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                <text
                  x={layout.padLeft - 8}
                  y={wireY(wire) + 3}
                  textAnchor="end"
                  fill="var(--color-text-secondary)"
                  fontFamily="var(--font-mono)"
                  fontSize="8"
                >
                  {wire}
                </text>
              </g>
            ))}
            {comparators.map(([a, b], index) => {
              const x = comparatorX(index);
              return (
                <g key={index}>
                  <line
                    x1={x}
                    y1={wireY(a)}
                    x2={x}
                    y2={wireY(b)}
                    stroke="#22d3ee"
                    strokeWidth="1.4"
                  />
                  <circle cx={x} cy={wireY(a)} r="2.2" fill="#22d3ee" />
                  <circle cx={x} cy={wireY(b)} r="2.2" fill="#22d3ee" />
                </g>
              );
            })}
          </>
        );
      }}
    </ChartShell>
  );
}

export function MatrixChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  const matrix = numberRows(values);
  if (!matrix || matrix.length === 0 || matrix.some((row) => row.length === 0)) {
    return null;
  }

  return (
    <ChartShell
      title={`${matrix.length} × ${matrix[0].length} sign matrix`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={350}
    >
      {(layout) => {
        const rows = matrix.length;
        const columns = matrix[0].length;
        const size = Math.min(layout.plotW, layout.plotH);
        const left = layout.padLeft + (layout.plotW - size) / 2;
        const top = layout.padTop + (layout.plotH - size) / 2;
        const cellW = size / columns;
        const cellH = size / rows;
        let positive = "";
        let negative = "";
        matrix.forEach((row, y) => {
          row.forEach((value, x) => {
            const cell = `M${left + x * cellW},${top + y * cellH}h${cellW}v${cellH}h${-cellW}z`;
            if (value === 1) positive += cell;
            else negative += cell;
          });
        });
        return (
          <>
            <path d={negative} fill="#1e293b" />
            <path d={positive} fill="#22d3ee" />
          </>
        );
      }}
    </ChartShell>
  );
}

export function ShannonWordsChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  const words = numberRows(values);
  if (!words || words.length === 0 || words.some((word) => word.length !== 5)) {
    return null;
  }
  const colors = [
    "#0e7490",
    "#0891b2",
    "#06b6d4",
    "#22d3ee",
    "#67e8f9",
    "#a5f3fc",
    "#cffafe",
  ];

  return (
    <ChartShell
      title={`${words.length} words in C₇⁵`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={300}
    >
      {(layout) => {
        const cellW = layout.plotW / 5;
        const cellH = layout.plotH / words.length;
        const paths = colors.map(() => "");
        words.forEach((word, y) => {
          word.forEach((value, x) => {
            paths[value] += `M${layout.padLeft + x * cellW},${layout.padTop + y * cellH}h${cellW}v${cellH}h${-cellW}z`;
          });
        });
        return (
          <>
            {paths.map((path, value) => (
              <path key={value} d={path} fill={colors[value]} />
            ))}
            {Array.from({ length: 5 }, (_, coordinate) => (
              <text
                key={coordinate}
                x={layout.padLeft + (coordinate + 0.5) * cellW}
                y={layout.padTop + layout.plotH + 17}
                textAnchor="middle"
                fill="var(--color-text-secondary)"
                fontFamily="var(--font-mono)"
                fontSize="10"
              >
                x{coordinate + 1}
              </text>
            ))}
          </>
        );
      }}
    </ChartShell>
  );
}

export function SidonSetChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  if (!values.every((value) => typeof value === "number")) return null;
  const elements = [...(values as number[])].sort((a, b) => a - b);
  if (elements.length === 0) return null;

  return (
    <ChartShell
      title={`${elements.length}-element (4,5)-set`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={160}
    >
      {(layout) => {
        const min = elements[0];
        const max = elements[elements.length - 1];
        const toX = (value: number) =>
          layout.padLeft + ((value - min) / (max - min || 1)) * layout.plotW;
        const y = layout.padTop + layout.plotH / 2;
        return (
          <>
            <line
              x1={layout.padLeft}
              y1={y}
              x2={layout.padLeft + layout.plotW}
              y2={y}
              stroke="#64748b"
            />
            {elements.map((value, index) => (
              <g key={`${value}-${index}`}>
                <line
                  x1={toX(value)}
                  y1={y - 13}
                  x2={toX(value)}
                  y2={y + 13}
                  stroke="#22d3ee"
                />
                <circle cx={toX(value)} cy={y} r="3.5" fill="#22d3ee" />
              </g>
            ))}
            <text
              x={layout.padLeft}
              y={layout.padTop + layout.plotH + 17}
              fill="var(--color-text-secondary)"
              fontFamily="var(--font-mono)"
              fontSize="9"
            >
              {min}
            </text>
            <text
              x={layout.padLeft + layout.plotW}
              y={layout.padTop + layout.plotH + 17}
              textAnchor="end"
              fill="var(--color-text-secondary)"
              fontFamily="var(--font-mono)"
              fontSize="9"
            >
              {max}
            </text>
          </>
        );
      }}
    </ChartShell>
  );
}

export function RingLoadingChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  if (!values.every((pair) => Array.isArray(pair) && pair.length === 2)) {
    return null;
  }
  const pairs = values.map((pair) =>
    (pair as unknown[]).map(parseRational),
  );
  if (pairs.some((pair) => pair.some((value) => value === null))) return null;
  const numericPairs = pairs as number[][];

  return (
    <ChartShell
      title={`${numericPairs.length} loading pairs`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={240}
    >
      {(layout) => {
        const groupW = layout.plotW / numericPairs.length;
        const barW = Math.max(2, groupW * 0.32);
        const toH = (value: number) => value * layout.plotH;
        return (
          <>
            {[0.25, 0.5, 0.75].map((value) => (
              <line
                key={value}
                x1={layout.padLeft}
                y1={layout.padTop + layout.plotH * (1 - value)}
                x2={layout.padLeft + layout.plotW}
                y2={layout.padTop + layout.plotH * (1 - value)}
                stroke="var(--color-border)"
                strokeDasharray="4 4"
                strokeWidth="0.5"
              />
            ))}
            {numericPairs.map(([u, v], index) => {
              const center = layout.padLeft + (index + 0.5) * groupW;
              return (
                <g key={index}>
                  <rect
                    x={center - barW}
                    y={layout.padTop + layout.plotH - toH(u)}
                    width={barW}
                    height={toH(u)}
                    fill="#22d3ee"
                  />
                  <rect
                    x={center}
                    y={layout.padTop + layout.plotH - toH(v)}
                    width={barW}
                    height={toH(v)}
                    fill="#a78bfa"
                  />
                </g>
              );
            })}
            <text
              x={layout.padLeft + 4}
              y={layout.padTop + 12}
              fill="var(--color-text-secondary)"
              fontSize="9"
            >
              <tspan fill="#22d3ee">■</tspan> u
              <tspan dx="8" fill="#a78bfa">■</tspan> v
            </text>
          </>
        );
      }}
    </ChartShell>
  );
}

export function KakeyaChart({
  values,
  score,
  agentName,
  scoring,
}: ChartProps) {
  const offsets = values.map((value) =>
    typeof value === "string" ? Number(value) : Number.NaN,
  );
  if (offsets.some((value) => !Number.isFinite(value)) || offsets.length === 0) {
    return null;
  }
  const translated = offsets.map((value) => value - offsets[0]);
  const vertices = translated.flatMap((offset, index) => [
    offset,
    offset + 1 / 128,
    offset + (index + 1) / 128,
  ]);
  const minX = Math.min(...vertices);
  const maxX = Math.max(...vertices);

  return (
    <ChartShell
      title={`${offsets.length} translated Kakeya triangles`}
      agentName={agentName}
      score={score}
      scoring={scoring}
      height={350}
    >
      {(layout) => {
        const toX = (value: number) =>
          layout.padLeft +
          ((value - minX) / (maxX - minX || 1)) * layout.plotW;
        const top = layout.padTop;
        const bottom = layout.padTop + layout.plotH;
        return (
          <>
            {translated.map((offset, index) => {
              const apex = offset + (index + 1) / 128;
              return (
                <path
                  key={index}
                  d={`M${toX(offset)},${bottom}L${toX(offset + 1 / 128)},${bottom}L${toX(apex)},${top}Z`}
                  fill="#22d3ee"
                  fillOpacity="0.025"
                  stroke="#22d3ee"
                  strokeOpacity="0.35"
                  strokeWidth="0.7"
                />
              );
            })}
          </>
        );
      }}
    </ChartShell>
  );
}
