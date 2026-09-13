"use client";

import { ErdosChart } from "./erdos-min-overlap";
import { AutocorrelationChart } from "./autocorrelation";
import { PointConfigChart } from "./point-config";
import { SphereProjectionChart } from "./sphere-projection";
import { FlatPolynomialsChart } from "./flat-polynomials";
import { EdgesVsTrianglesChart } from "./edges-vs-triangles";
import { CirclePackingChart } from "./circle-packing";
import { HeilbronnTrianglesChart } from "./heilbronn-triangles";
import { HeilbronnConvexChart } from "./heilbronn-convex";
import { HexagonPackingChart } from "./hexagon-packing";
import { CirclesRectangleChart } from "./circles-rectangle";
import { DifferenceBasesChart } from "./difference-bases";
import {
  KakeyaChart,
  MatrixChart,
  NoThreeInLineChart,
  RingLoadingChart,
  ShannonWordsChart,
  SidonSetChart,
  SortingNetworkChart,
} from "./discovery";

export interface ChartProps {
  values: unknown[];
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
  "heilbronn-triangles": HeilbronnTrianglesChart,
  "heilbronn-convex": HeilbronnConvexChart,
  "hexagon-packing": HexagonPackingChart,
  "circles-rectangle": CirclesRectangleChart,
  "difference-bases": DifferenceBasesChart,
  "sorting-network-16": SortingNetworkChart,
  "ring-loading-15": RingLoadingChart,
  "shannon-capacity-c7-5": ShannonWordsChart,
  "spencer-discrepancy": MatrixChart,
  "sidon-45-set": SidonSetChart,
  "hadamard-det-51": MatrixChart,
  "kakeya-needle-128": KakeyaChart,
  "no-three-in-line-75": NoThreeInLineChart,
};

interface ProblemChartProps extends ChartProps {
  slug: string;
}

export function ProblemChart({ slug, ...props }: ProblemChartProps) {
  const Chart = CHART_MAP[slug];
  if (!Chart) return null;
  return <Chart {...props} />;
}
