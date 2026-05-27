#!/usr/bin/env python3
"""Standalone Kissing D11 fingerprint construction.

Input: one submitted ``n x 11`` array of vectors.
Output: a fixed-length numerical fingerprint for that submission.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import numpy as np


DIM = 11
CONTACT_DOT = 0.5


def normalize_rows(vectors: np.ndarray) -> np.ndarray:
    """Normalize each submitted row vector to unit length."""
    x = np.asarray(vectors, dtype=np.float64)
    if x.ndim != 2:
        raise ValueError("expected a 2D array of submitted vectors")
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise ValueError("all submitted vectors must be nonzero")
    return x / norms


def upper_dots(unit_vectors: np.ndarray) -> np.ndarray:
    """Return all off-diagonal pairwise dot products."""
    dots = unit_vectors @ unit_vectors.T
    idx = np.triu_indices(unit_vectors.shape[0], k=1)
    return dots[idx]


def pairwise_cosine_features(unit_vectors: np.ndarray) -> np.ndarray:
    """Summarize all pairwise cosines by quantiles, histogram bins, and tails."""
    dots = upper_dots(unit_vectors)
    quantiles = np.quantile(
        dots,
        [0, 0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.995, 0.999, 1],
    )
    hist, _ = np.histogram(dots, bins=np.linspace(-1.0, 1.0, 41), density=False)
    hist = hist.astype(float) / max(1, hist.sum())
    anchors = []
    for center, width in [(-1.0, 1e-3), (-0.5, 1e-3), (0.0, 1e-3), (0.5, 1e-3), (0.5, 1e-5)]:
        anchors.append(float(np.mean(np.abs(dots - center) <= width)))
    tail = [
        float(np.mean(dots > 0.49)),
        float(np.mean(dots > 0.499)),
        float(np.mean(dots > CONTACT_DOT)),
        float(np.max(dots)),
        float(np.mean(dots)),
        float(np.std(dots)),
    ]
    return np.concatenate([quantiles, hist, np.asarray(anchors + tail, dtype=float)])


def gram_spectrum_features(unit_vectors: np.ndarray) -> np.ndarray:
    """Summarize the spectrum of the coordinate Gram matrix."""
    eig = np.linalg.eigvalsh(unit_vectors.T @ unit_vectors)
    eig = np.sort(eig)
    return np.concatenate(
        [
            eig / unit_vectors.shape[0],
            np.asarray(
                [
                    float(eig.max() / max(eig.min(), 1e-12)),
                    float(np.trace(unit_vectors.T @ unit_vectors)),
                    float(np.linalg.norm(unit_vectors.mean(axis=0))),
                ]
            ),
        ]
    )


def shell_integer_features(vectors: np.ndarray, unit_vectors: np.ndarray) -> np.ndarray:
    """Summarize norm, coordinate-shell, and near-integer structure."""
    raw_norm = np.linalg.norm(vectors, axis=1)
    scaled = 2.0 * unit_vectors
    abs_scaled = np.abs(scaled)
    support = np.sum(abs_scaled > 0.25, axis=1)
    rounded_int_resid = np.abs(scaled - np.round(scaled))
    rounded_half_resid = np.abs(2.0 * scaled - np.round(2.0 * scaled)) / 2.0
    coords = scaled.ravel()
    coord_hist, _ = np.histogram(np.abs(coords), bins=[0, 0.05, 0.15, 0.35, 0.6, 0.85, 1.15, 1.5, 2.1])
    coord_hist = coord_hist.astype(float) / max(1, coord_hist.sum())
    support_hist = np.bincount(np.clip(support, 0, DIM), minlength=DIM + 1).astype(float)
    support_hist /= max(1.0, support_hist.sum())
    norm_q = np.quantile(raw_norm, [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1])
    return np.concatenate(
        [
            norm_q,
            support_hist,
            coord_hist,
            np.asarray(
                [
                    float(np.mean(rounded_int_resid)),
                    float(np.quantile(rounded_int_resid, 0.9)),
                    float(np.mean(rounded_half_resid)),
                    float(np.quantile(rounded_half_resid, 0.9)),
                    float(np.mean(support == 4)),
                    float(np.mean(np.isclose(raw_norm, 2.0, atol=1e-3))),
                ]
            ),
        ]
    )


def order_sensitive_features(unit_vectors: np.ndarray) -> np.ndarray:
    """Compute auxiliary features that depend on the submitted row order."""
    row_step = np.linalg.norm(np.diff(unit_vectors, axis=0), axis=1)
    coord_means = unit_vectors.mean(axis=0)
    coord_stds = unit_vectors.std(axis=0)
    return np.concatenate(
        [
            np.quantile(row_step, [0, 0.1, 0.5, 0.9, 1]),
            coord_means,
            coord_stds,
        ]
    )


def feature_groups(vectors: np.ndarray) -> dict[str, np.ndarray]:
    """Return named feature groups for one Kissing D11 submission."""
    x = np.asarray(vectors, dtype=np.float64)
    unit = normalize_rows(x)
    return {
        "pairwise_cosine_distribution": pairwise_cosine_features(unit),
        "gram_spectrum": gram_spectrum_features(unit),
        "shell_integer_structure": shell_integer_features(x, unit),
        "order_sensitive_auxiliary": order_sensitive_features(unit),
    }


def feature_vector(vectors: np.ndarray) -> np.ndarray:
    """Return the 140-dimensional Kissing D11 fingerprint."""
    groups = feature_groups(vectors)
    return np.concatenate(list(groups.values()))


def fingerprint_matrix(submissions: list[np.ndarray]) -> np.ndarray:
    """Return one fingerprint row per submitted vector array."""
    return np.vstack([feature_vector(vectors) for vectors in submissions])


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


def invariant_duplicate_key(vectors: np.ndarray, decimals: int = 10) -> str:
    """Hash the sorted pairwise dot products after row normalization."""
    unit = normalize_rows(vectors)
    dots = np.sort(upper_dots(unit))
    quantized = np.round(dots, decimals=decimals)
    return hashlib.sha256(quantized.tobytes()).hexdigest()


# Optional sparse parent selection.


@dataclass(frozen=True)
class SparseParentEdge:
    """One selected prior-parent edge.

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
    """Select sparse prior-parent edges from an ordered similarity matrix.

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
