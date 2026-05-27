#!/usr/bin/env python3
"""Standalone second-autocorrelation fingerprint construction.

Input: one submitted 1D array of nonnegative function values.
Output: a fixed-length numerical fingerprint for that submission.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import numpy as np
from scipy.signal import oaconvolve


def verify_c2(values: np.ndarray) -> tuple[float, np.ndarray]:
    """Compute the verifier score and autoconvolution for a submitted function."""
    f = np.asarray(values, dtype=np.float64)
    if f.ndim != 1 or len(f) == 0:
        raise ValueError("expected a nonempty 1D values vector")
    if np.any(f < -1e-6):
        raise ValueError("function must be non-negative up to verifier tolerance")
    f_nonneg = np.maximum(f, 0.0)
    if np.sum(f_nonneg) == 0:
        raise ValueError("function must have positive integral")
    convolution = oaconvolve(f_nonneg, f_nonneg, mode="full")
    num_conv_points = len(convolution)
    x_points = np.linspace(-0.5, 0.5, num_conv_points + 2)
    x_intervals = np.diff(x_points)
    y_points = np.concatenate(([0.0], convolution, [0.0]))
    y1 = y_points[:-1]
    y2 = y_points[1:]
    l2_norm_squared = float(np.sum((x_intervals / 3.0) * (y1**2 + y1 * y2 + y2**2)))
    norm_1 = float(np.sum(np.abs(convolution)) / (num_conv_points + 1))
    norm_inf = float(np.max(np.abs(convolution)))
    return float(l2_norm_squared / (norm_1 * norm_inf)), convolution


def normalize_mass(v: np.ndarray) -> np.ndarray:
    """Clip to nonnegative values and scale the vector to total mass one."""
    x = np.maximum(np.asarray(v, dtype=np.float64), 0.0)
    total = float(np.sum(x))
    if total <= 0:
        return np.zeros_like(x)
    return x / total


def resample(v: np.ndarray, n: int) -> np.ndarray:
    """Linearly resample a 1D profile to a fixed number of grid points."""
    if len(v) == n:
        return np.asarray(v, dtype=np.float64)
    if len(v) == 1:
        return np.full(n, float(v[0]))
    old = np.linspace(0.0, 1.0, len(v))
    new = np.linspace(0.0, 1.0, n)
    return np.interp(new, old, v).astype(np.float64)


def quantile_features(v: np.ndarray) -> np.ndarray:
    """Return fixed quantiles of a 1D profile."""
    return np.quantile(v, [0.0, 0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.995, 0.999, 1.0])


def histogram_features(v: np.ndarray, bins: int = 32, value_range: tuple[float, float] = (0.0, 1.0)) -> np.ndarray:
    """Return a normalized histogram over a fixed value range."""
    hist, _ = np.histogram(v, bins=bins, range=value_range, density=False)
    hist = hist.astype(float)
    return hist / max(1.0, float(hist.sum()))


def run_lengths(mask: np.ndarray) -> list[int]:
    """Return lengths of contiguous True runs in a Boolean mask."""
    out: list[int] = []
    start: int | None = None
    for i, active in enumerate(mask):
        if active and start is None:
            start = i
        elif not active and start is not None:
            out.append(i - start)
            start = None
    if start is not None:
        out.append(len(mask) - start)
    return out


def support_features(v: np.ndarray) -> np.ndarray:
    """Summarize active support, run structure, mass location, and symmetry."""
    n = len(v)
    x = np.linspace(0.0, 1.0, n)
    vmax = max(float(np.max(v)), 1e-300)
    active = v > 1e-10 * vmax
    runs = np.asarray(run_lengths(active), dtype=float)
    weights = normalize_mass(v)
    mean = float(np.sum(weights * x))
    std = float(np.sqrt(np.sum(weights * (x - mean) ** 2)))
    if active.any():
        pos = x[active]
        span = float(pos[-1] - pos[0])
    else:
        span = 0.0
    if runs.size:
        run_q = np.quantile(runs / max(n, 1), [0.0, 0.25, 0.5, 0.75, 0.9, 1.0])
        largest_run = float(runs.max() / max(n, 1))
    else:
        run_q = np.zeros(6)
        largest_run = 0.0
    entropy = float(-np.sum(weights * np.log(weights + 1e-300)) / math.log(max(n, 2)))
    symmetry = float(np.mean(np.abs(v - v[::-1])) / (np.mean(np.abs(v)) + 1e-300))
    edge_mass = float(weights[: max(1, n // 20)].sum() + weights[-max(1, n // 20) :].sum())
    return np.concatenate(
        [
            np.asarray(
                [
                    float(active.mean()),
                    float(len(runs) / max(n, 1)),
                    span,
                    mean,
                    std,
                    entropy,
                    symmetry,
                    edge_mass,
                    largest_run,
                ]
            ),
            run_q,
        ]
    )


def roughness_features(v: np.ndarray) -> np.ndarray:
    """Summarize first and second differences relative to mean magnitude."""
    if len(v) < 2:
        return np.zeros(6)
    mean_abs = float(np.mean(np.abs(v))) + 1e-300
    d1 = np.diff(v)
    d2 = np.diff(v, n=2) if len(v) > 2 else np.zeros(1)
    return np.asarray(
        [
            float(np.mean(np.abs(d1)) / mean_abs),
            float(np.quantile(np.abs(d1), 0.9) / mean_abs),
            float(np.mean(np.abs(d2)) / mean_abs),
            float(np.quantile(np.abs(d2), 0.9) / mean_abs),
            float(np.max(v) / (np.mean(v) + 1e-300)),
            float(np.std(v) / (np.mean(v) + 1e-300)),
        ]
    )


def spectral_features(v: np.ndarray, bands: int = 8) -> np.ndarray:
    """Summarize Fourier magnitude across coarse frequency bands."""
    x = np.asarray(v, dtype=np.float64)
    x = x - float(np.mean(x))
    mag = np.abs(np.fft.rfft(x))
    if len(mag) <= 1:
        return np.zeros(bands + 2)
    mag = mag[1:]
    total = float(mag.sum()) + 1e-300
    chunks = np.array_split(mag, bands)
    band_energy = np.asarray([float(c.sum()) / total for c in chunks])
    top5 = float(np.sort(mag)[-min(5, len(mag)) :].sum()) / total
    centroid = float(np.sum(np.arange(1, len(mag) + 1) * mag) / total / len(mag))
    return np.concatenate([band_energy, np.asarray([top5, centroid])])


def plateau_features(g_norm: np.ndarray) -> np.ndarray:
    """Summarize the width and fragmentation of near-maximum regions."""
    x = np.asarray(g_norm, dtype=np.float64)
    near_counts = []
    largest_widths = []
    component_counts = []
    for eps in (1e-2, 1e-3, 1e-4, 1e-5):
        mask = x >= 1.0 - eps
        near_counts.append(float(mask.mean()))
        runs = run_lengths(mask)
        component_counts.append(float(len(runs) / max(1, len(x))))
        largest_widths.append(float(max(runs) / max(1, len(x))) if runs else 0.0)
    mask = x >= 0.999
    plateau_std = float(np.std(x[mask])) if mask.any() else 0.0
    return np.asarray([*near_counts, *component_counts, *largest_widths, plateau_std])


def verifier_diagnostics(values: np.ndarray, g: np.ndarray, g_norm: np.ndarray, score: float) -> np.ndarray:
    """Return scalar diagnostics from the submitted function and its convolution."""
    n = len(g)
    x_points = np.linspace(-0.5, 0.5, n + 2)
    x_intervals = np.diff(x_points)
    y_points = np.concatenate(([0.0], g, [0.0]))
    y1 = y_points[:-1]
    y2 = y_points[1:]
    l2_sq = float(np.sum((x_intervals / 3.0) * (y1**2 + y1 * y2 + y2**2)))
    l1 = float(np.sum(np.abs(g)) / (n + 1))
    linf = float(np.max(np.abs(g)))
    return np.asarray(
        [
            math.log10(len(values)),
            score,
            l2_sq / max(l1, 1e-300),
            linf / max(l1, 1e-300),
            float(np.mean(g_norm >= 0.999)),
            float(np.mean(g_norm >= 0.9999)),
        ],
        dtype=float,
    )


def feature_groups(values: np.ndarray) -> dict[str, np.ndarray]:
    """Return named feature groups for one second-autocorrelation submission."""
    f = np.asarray(values, dtype=np.float64)
    score, g = verify_c2(f)
    f_mass = normalize_mass(f)
    g_norm = g / max(float(np.max(np.abs(g))), 1e-300)
    f_low = resample(f_mass, 2048)
    g_low = resample(g_norm, 4096)
    return {
        "verifier_diagnostics": verifier_diagnostics(f, g, g_norm, score),
        "submitted_function_summaries": np.concatenate(
            [
                quantile_features(f_low),
                histogram_features(f_low, 32, (0.0, max(float(np.max(f_low)), 1e-12))),
                support_features(f_low),
                roughness_features(f_low),
                spectral_features(f_low),
            ]
        ),
        "autoconvolution_summaries": np.concatenate(
            [
                quantile_features(g_low),
                histogram_features(g_low, 40, (0.0, 1.0)),
                support_features(g_low),
                roughness_features(g_low),
                plateau_features(g_low),
                spectral_features(g_low),
            ]
        ),
        "submitted_function_profile": resample(f_mass, 256),
        "autoconvolution_profile": resample(g_norm, 384),
    }


def feature_vector(values: np.ndarray) -> np.ndarray:
    """Return the 823-dimensional second-autocorrelation fingerprint."""
    groups = feature_groups(values)
    return np.concatenate(list(groups.values()))


def fingerprint_matrix(submissions: list[np.ndarray]) -> np.ndarray:
    """Return one fingerprint row per submitted values array."""
    return np.vstack([feature_vector(values) for values in submissions])


def standardize_features(features: np.ndarray) -> np.ndarray:
    """Median/IQR standardize a matrix of fingerprints column by column."""
    x = np.asarray(features, dtype=np.float64)
    med = np.nanmedian(x, axis=0)
    q25 = np.nanquantile(x, 0.25, axis=0)
    q75 = np.nanquantile(x, 0.75, axis=0)
    scale = q75 - q25
    weak = scale < 1e-10
    if np.any(weak):
        scale[weak] = np.nanstd(x[:, weak], axis=0) + 1e-10
    z = (x - med) / scale
    return np.clip(np.nan_to_num(z, nan=0.0, posinf=10.0, neginf=-10.0), -10.0, 10.0)


def pairwise_distances(standardized_features: np.ndarray) -> np.ndarray:
    """Return Euclidean distances between all standardized fingerprints."""
    delta = standardized_features[:, None, :] - standardized_features[None, :, :]
    return np.sqrt(np.sum(delta * delta, axis=-1))


def distance_to_similarity(distances: np.ndarray) -> np.ndarray:
    """Convert distances to similarities using the median positive distance."""
    finite = distances[np.isfinite(distances) & (distances > 0)]
    scale = float(np.median(finite)) if finite.size else 1.0
    return np.exp(-distances / max(scale, 1e-12))


def exact_duplicate_key(values: np.ndarray, decimals: int = 15) -> str:
    """Hash a rounded submitted values array for exact/near-exact reuse checks."""
    rounded = np.round(np.asarray(values, dtype=np.float64), decimals=decimals)
    return hashlib.sha256(rounded.tobytes()).hexdigest()


# Sparse lineage construction.


@dataclass(frozen=True)
class SparseParentEdge:
    """One selected prior-parent lineage edge.

    ``child`` and ``parent`` are row indices in the ordered submission list.
    ``kind`` is ``duplicate``, ``self`` for same-agent, or ``global`` otherwise.
    """

    child: int
    parent: int
    kind: str
    similarity: float
    distance: float | None = None
    parent_share: float | None = None


def select_sparse_parents(
    similarity: np.ndarray,
    distances: np.ndarray | None = None,
    agents: list[str] | np.ndarray | None = None,
    duplicate_keys: list[str] | None = None,
    min_global_sim: float = 0.48,
    min_self_sim: float = 0.42,
    max_parents: int = 2,
    min_second_parent_share: float = 0.20,
    parent_share_temperature: float = 0.05,
) -> list[SparseParentEdge]:
    """Construct sparse prior-parent lineage edges from ordered similarities.

    Submissions must be ordered chronologically. Same-agent and cross-agent
    candidates compete in one shared prior pool. A second opposite-kind parent
    is kept only if its evidence share clears ``min_second_parent_share``.
    """
    sim = np.asarray(similarity, dtype=np.float64)
    if sim.ndim != 2 or sim.shape[0] != sim.shape[1]:
        raise ValueError("similarity must be a square matrix")
    n = sim.shape[0]
    dist = (
        np.zeros_like(sim)
        if distances is None
        else np.asarray(distances, dtype=np.float64)
    )
    if dist.shape != sim.shape:
        raise ValueError("distances must have the same shape as similarity")
    agent_arr = np.asarray(agents if agents is not None else [None] * n, dtype=object)
    if len(agent_arr) != n:
        raise ValueError("agents must have one entry per submission")
    if duplicate_keys is not None and len(duplicate_keys) != n:
        raise ValueError("duplicate_keys must have one entry per submission")

    edges: list[SparseParentEdge] = []
    for i in range(n):
        prior = np.arange(i)
        if prior.size == 0:
            continue

        if duplicate_keys is not None:
            duplicate_prior = [
                int(j) for j in prior if duplicate_keys[j] == duplicate_keys[i]
            ]
            if duplicate_prior:
                j = max(duplicate_prior)
                edges.append(SparseParentEdge(i, j, "duplicate", 1.0, 0.0, 1.0))
                continue

        candidates: list[tuple[int, str, float, float]] = []
        for j in prior:
            kind = "self" if agent_arr[j] == agent_arr[i] else "global"
            threshold = min_self_sim if kind == "self" else min_global_sim
            if sim[i, j] >= threshold:
                candidates.append((int(j), kind, float(sim[i, j]), float(dist[i, j])))
        if not candidates or max_parents <= 0:
            continue

        candidates.sort(key=lambda row: (-row[2], row[3], row[0]))
        best = candidates[0]
        temp = max(parent_share_temperature, 1e-9)
        weights = np.asarray(
            [math.exp((c[2] - best[2]) / temp) for c in candidates],
            dtype=float,
        )
        shares = weights / (float(weights.sum()) + 1e-12)
        edges.append(
            SparseParentEdge(i, best[0], best[1], best[2], best[3], float(shares[0]))
        )

        if max_parents <= 1:
            continue
        other_kind = "self" if best[1] == "global" else "global"
        other_candidates = [
            (c, float(shares[k]))
            for k, c in enumerate(candidates)
            if c[1] == other_kind
        ]
        if not other_candidates:
            continue
        second, share = max(
            other_candidates,
            key=lambda row: (row[1], row[0][2], -row[0][3]),
        )
        if share >= min_second_parent_share:
            edges.append(
                SparseParentEdge(i, second[0], second[1], second[2], second[3], share)
            )
    return edges
