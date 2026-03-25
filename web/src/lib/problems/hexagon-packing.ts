import { z } from "zod";
import type { ProblemDef } from "./types";

const num = z.number();

const problem: ProblemDef = {
  slug: "hexagon-packing",
  title: "Hexagon Packing in a Hexagon (n = 12)",
  reference: "Problem 6.35 of https://arxiv.org/abs/2511.02864",
  scoring: "minimize",
  minImprovement: 1e-4,
  featured: false,
  hidden: false,
  description: `## Problem

Pack $n = 12$ disjoint unit regular hexagons (side length 1) inside a larger regular hexagon, **minimizing** the side length of the outer hexagon.

Each inner hexagon is specified by its center $(x, y)$ and rotation angle in degrees. The outer hexagon is specified by its center, side length, and rotation angle.

## Scoring

Submit \`hexagons\` (12 inner hexagons as $[cx, cy, angle\\_deg]$), \`outer\\_side\\_length\`, \`outer\\_center\` ($[x, y]$), and \`outer\\_angle\\_deg\`. The score is the outer side length (plus a large penalty per violation). Lower is better.

## Reference

Problem 6.35 of [Mathematical exploration and discovery at scale](https://arxiv.org/abs/2511.02864). State of the art: $4.0$. AlphaEvolve improved to $3.942$.`,
  solutionSchema: {
    hexagons: "array of 12 [cx, cy, angle_deg] triples for inner unit hexagons",
    outer_side_length: "side length of the outer hexagon (minimize this)",
    outer_center: "[x, y] center of the outer hexagon",
    outer_angle_deg: "rotation angle of the outer hexagon in degrees",
  },
  zodSchema: z.object({
    hexagons: z.array(z.array(num).length(3)).length(12),
    outer_side_length: num,
    outer_center: z.array(num).length(2),
    outer_angle_deg: num,
  }),
  verifier: `import math
import itertools

def _hex_verts(cx, cy, side, angle_deg):
    ar = math.radians(angle_deg)
    return [(cx + side * math.cos(ar + 2 * math.pi * i / 6),
             cy + side * math.sin(ar + 2 * math.pi * i / 6)) for i in range(6)]

def _normals(verts):
    n = len(verts)
    result = []
    for i in range(n):
        p1, p2 = verts[i], verts[(i+1) % n]
        edge = (p2[0]-p1[0], p2[1]-p1[1])
        mag = math.hypot(edge[0], edge[1])
        if mag < 1e-12:
            continue
        result.append((-edge[1]/mag, edge[0]/mag))
    return result

def _project(verts, axis):
    dots = [v[0]*axis[0]+v[1]*axis[1] for v in verts]
    return min(dots), max(dots)

def _intersects(v1, v2):
    for axis in _normals(v1) + _normals(v2):
        mn1, mx1 = _project(v1, axis)
        mn2, mx2 = _project(v2, axis)
        if mx1 < mn2 - 1e-9 or mx2 < mn1 - 1e-9:
            return False
    return True

def _inside_hex(pt, hex_verts):
    n = len(hex_verts)
    for i in range(n):
        p1, p2 = hex_verts[i], hex_verts[(i+1) % n]
        edge = (p2[0]-p1[0], p2[1]-p1[1])
        pv = (pt[0]-p1[0], pt[1]-p1[1])
        if edge[0]*pv[1] - edge[1]*pv[0] < -1e-9:
            return False
    return True

def evaluate(data):
    hexagons = data["hexagons"]
    outer_side = float(data["outer_side_length"])
    outer_center = data["outer_center"]
    outer_angle = float(data["outer_angle_deg"])
    if len(hexagons) != 12:
        return float("inf")
    if not all(math.isfinite(v) for h in hexagons for v in h):
        return float("inf")
    if not math.isfinite(outer_side) or outer_side <= 0:
        return float("inf")
    inner = [(float(h[0]), float(h[1]), 1.0, float(h[2])) for h in hexagons]
    outer_v = _hex_verts(float(outer_center[0]), float(outer_center[1]), outer_side, outer_angle)
    penalty = 0
    for i in range(len(inner)):
        for j in range(i+1, len(inner)):
            if _intersects(_hex_verts(*inner[i]), _hex_verts(*inner[j])):
                penalty += 1
    for h in inner:
        for vx, vy in _hex_verts(*h):
            if not _inside_hex((vx, vy), outer_v):
                penalty += 1
                break
    return float(outer_side + 100.0 * penalty)`,
};

export default problem;
