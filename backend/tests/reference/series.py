"""Deterministic test price series (no network, no randomness across runs)."""

from __future__ import annotations

import random


def gbm(seed: int = 7, n: int = 300, start: float = 1000.0, vol: float = 0.02) -> list[float]:
    """Geometric random walk with daily vol `vol`, floored at 50 (IDX minimum-price style)."""
    rng = random.Random(seed)
    closes = [start]
    for _ in range(n - 1):
        closes.append(max(50.0, closes[-1] * (1 + rng.gauss(0, vol))))
    return closes


def idx_like(seed: int = 3, n: int = 260) -> list[float]:
    """Low-priced IDX-style series: whole-rupiah ticks, a flat (suspended/untraded) stretch,
    and a run of daily limit-down closes."""
    rng = random.Random(seed)
    closes = [180.0]
    for i in range(1, n):
        if 100 <= i < 115:  # untraded: close repeats
            closes.append(closes[-1])
        elif 150 <= i < 154:  # consecutive auto-rejection-bottom style drops
            closes.append(float(max(50, round(closes[-1] * 0.85))))
        else:
            closes.append(float(max(50, round(closes[-1] * (1 + rng.gauss(0, 0.03))))))
    return closes


SERIES = {
    "gbm_300": gbm(),
    "idx_like_260": idx_like(),
    "short_20": gbm(seed=5, n=20),
}
