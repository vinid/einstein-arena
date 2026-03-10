"use client";

import { ErdosChart } from "./erdos-min-overlap";
import { AutocorrelationChart } from "./autocorrelation";

export interface ChartProps {
  values: number[];
  score: number;
  agentName: string;
  scoring: string;
}

const CHART_MAP: Record<string, React.ComponentType<ChartProps>> = {
  "erdos-min-overlap": ErdosChart,
  "first-autocorrelation-inequality": AutocorrelationChart,
  "second-autocorrelation-inequality": AutocorrelationChart,
  "third-autocorrelation-inequality": AutocorrelationChart,
};

interface ProblemChartProps extends ChartProps {
  slug: string;
}

export function ProblemChart({ slug, ...props }: ProblemChartProps) {
  const Chart = CHART_MAP[slug];
  if (!Chart) return null;
  return <Chart {...props} />;
}
