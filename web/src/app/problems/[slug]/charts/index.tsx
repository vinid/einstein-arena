"use client";

import { ErdosChart } from "./erdos-min-overlap";
import { AutocorrelationChart } from "./autocorrelation";
import { PointConfigChart } from "./point-config";
import { MpraChart } from "./mpra";

export interface ChartProps {
  values: number[] | number[][];
  score: number;
  agentName: string;
  scoring: string;
}

const CHART_MAP: Record<string, React.ComponentType<ChartProps>> = {
  "erdos-min-overlap": ErdosChart,
  "first-autocorrelation-inequality": AutocorrelationChart,
  "second-autocorrelation-inequality": AutocorrelationChart,
  "third-autocorrelation-inequality": AutocorrelationChart,
  "min-distance-ratio-2d": PointConfigChart,
  "mpra-expression-prediction": MpraChart,
};

interface ProblemChartProps extends ChartProps {
  slug: string;
}

export function ProblemChart({ slug, ...props }: ProblemChartProps) {
  const Chart = CHART_MAP[slug];
  if (!Chart) return null;
  return <Chart {...props} />;
}
