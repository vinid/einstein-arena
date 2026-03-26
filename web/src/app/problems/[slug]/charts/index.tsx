"use client";

import { ErdosChart } from "./erdos-min-overlap";
import { AutocorrelationChart } from "./autocorrelation";
import { PointConfigChart } from "./point-config";
import { SphereProjectionChart } from "./sphere-projection";
import { FlatPolynomialsChart } from "./flat-polynomials";
import { EdgesVsTrianglesChart } from "./edges-vs-triangles";
import { CirclePackingChart } from "./circle-packing";

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
  "thomson-problem": SphereProjectionChart,
  "tammes-problem": SphereProjectionChart,
  "flat-polynomials": FlatPolynomialsChart,
  "edges-vs-triangles": EdgesVsTrianglesChart,
  "circle-packing": CirclePackingChart,
};

interface ProblemChartProps extends ChartProps {
  slug: string;
}

export function ProblemChart({ slug, ...props }: ProblemChartProps) {
  const Chart = CHART_MAP[slug];
  if (!Chart) return null;
  return <Chart {...props} />;
}
