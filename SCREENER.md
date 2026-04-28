# Screener Configuration Guide

This document covers the configurable screener controls currently exposed in StockHub, with a focus on the triangle screener and the divergence screener. The goal is to make the precision/recall tradeoffs explicit so you can tune the UI without guessing.

## Mental Model

The screener has three layers of control:

1. Universe scoping: which market, index, and time window are scanned.
2. Detection sensitivity: how the underlying detector defines pivots, confirmations, and breakouts.
3. Result filtering: how the returned events are narrowed after detection.

The most important rule is that tighter settings usually improve precision but reduce signal count, while looser settings usually improve recall but add noise.

## Shared Screener Controls

These apply to the market-level triangle screener and, where relevant, to the ticker-level triangle API as well.

| Control | Default | Effect | Tradeoff |
|---|---:|---|---|
| `mode` | divergence | Switches between divergence and triangle screener UI. | Triangle mode exposes triangle-specific filters; divergence mode exposes pivot-confirmation controls. |
| `index_code` | null | Limits the scan to one index/universe. | Narrower scope is faster and more focused, but you may miss signals outside that index. |
| `days` | 7 | Limits screener results to recent signals. | Smaller windows are more actionable; larger windows show more history but less urgency. |
| `limit` | 500 | Caps returned screener rows. | Lower limits reduce payload and visual clutter; higher limits are better for full audits. |
| `state` | all | Filters triangle events by `potential` or `breakout`. | `breakout` is more conservative; `potential` finds earlier setups but requires more interpretation. |
| `direction` | all | Filters triangle breakouts to bullish or bearish. | Direction filtering improves focus if you only trade one side, but hides the opposite side entirely. |
| `triangle_types` | symmetrical,ascending,descending | Restricts the triangle family. | Filtering to one type improves specificity and makes pattern review easier, but reduces coverage. |
| `min_confidence` | 0 | Drops low-confidence events. | Raising the threshold cleans up the list; too high and you can suppress valid setups. |

## Triangle Screener Controls

Triangle screening is configured by the detector in [backend/app/services/triangle_detector.py](backend/app/services/triangle_detector.py) and exposed through [backend/app/routers/triangles.py](backend/app/routers/triangles.py).

### Detection Windows

| Control | Default | Effect | Tradeoff |
|---|---:|---|---|
| `lookback_bars` | 60 | Number of historical bars used for triangle detection. | More bars give the detector more context and can capture older formations, but they also increase computation and can pull in stale structure. |
| `pivot_left_window` | 3 | Left-side bars required to form a pivot high/low. | Larger values reduce false pivots and make anchors more meaningful, but they delay recognition and can miss fast reversals. |
| `pivot_right_window` | 1 | Right-side bars required to confirm a pivot. | Larger values improve pivot certainty, but they add lag and can push valid anchors later than you expect. |

### Breakout Sensitivity

| Control | Default | Effect | Tradeoff |
|---|---:|---|---|
| `breakout_relaxed` | false | Uses a lower breakout buffer and a slightly more permissive formation exclusion window. | `false` is cleaner and more conservative; `true` increases recall and is useful when you suspect the detector is too strict. |
| `breakout_buffer_pct` | 0.10 in code | Breakout threshold margin above/below the fitted line. | Higher values require a cleaner move beyond the line, reducing false breakouts but missing early ones. |
| `relaxed_breakout_buffer_multiplier` | 0.5 | Multiplies the breakout buffer when relaxed mode is enabled. | Lower effective buffer catches more breakouts sooner, but it admits more borderline cases. |
| `inside_buffer_pct` | 0.05 in code | Defines the in-pattern zone for potential triangles. | A wider inside band produces more potential setups; a tighter band makes the detector more selective. |
| `formation_exclude_latest_bars` | 1 | Excludes the newest bars from boundary validation. | Prevents the detector from fitting a line that makes breakout impossible, but too much exclusion can shift the start earlier than needed. |
| `relaxed_extra_exclude_bars` | 1 | Adds extra exclusion when `breakout_relaxed=true`. | Helps breakout detection on borderline formations, but can push the formation anchor earlier and loosen pattern fit. |

### Line Selection and Pattern Shape

| Control | Default | Effect | Tradeoff |
|---|---:|---|---|
| `prefer_converging_lines` | true | Biases line selection toward tighter, converging triangle shapes. | Better for classical triangles and cleaner overlays; can skip looser but still valid structures. |
| `min_touches_upper` | 2 | Minimum pivot touches on the upper line. | More touches increase credibility, but higher thresholds cut out younger patterns. |
| `min_touches_lower` | 2 | Minimum pivot touches on the lower line. | Same tradeoff as upper touches. |
| `flat_eps_pct` | 0.02 | Threshold for treating a line as flat. | Lower values make the ascending/descending classification stricter; higher values broaden classification but can blur pattern type. |
| `trend_min_pct` | 0.02 | Minimum slope magnitude for a line to count as trending. | Higher values reduce ambiguous triangles, but can suppress slow-moving valid ones. |
| `max_apex_extension_ratio` | 0.5 | Limits how far the projected apex may extend beyond the current window. | Lower values prefer near-term compression; higher values admit longer formations but can weaken immediacy. |

### Triangle Event Interpretation

| Field | Meaning | Practical use |
|---|---|---|
| `upper_touch_count` / `lower_touch_count` | Number of pivot touches that lie on the fitted lines. | A quick credibility check: more touches usually means a better-formed triangle. |
| `total_touch_count` | Sum of both touch counts. | Handy for ranking stronger patterns above weak ones. |
| `breakout_close_count` | Number of consecutive closes beyond the breakout threshold. | Higher values are more confirmatory; lower values fire earlier. |
| `volume_ratio` | Latest volume divided by recent average volume. | Useful for separating high-energy breakouts from quiet drift. |

## Divergence Screener Controls

These are the controls that changed since the beginning of the chat and are worth documenting alongside the triangle screener because they live in the same UI.

| Control | Default | Effect | Tradeoff |
|---|---:|---|---|
| `pivot_left_window` | 5 | Left-side bars required to form an RSI swing low. | Larger values reduce noise in the RSI pivot set, but they delay confirmation and can miss earlier divergences. |
| `confirmed_right_min` | 2 | Minimum right-side bars for confirmed divergence pivots. | More confirmation means fewer false positives, but confirmed setups appear later. |
| `confirmed_right_max` | 5 | Maximum right-side bars for confirmed divergence pivots. | Wider confirmation windows allow more tolerance for noisy RSI action, but can reduce uniformity. |
| `aggressive_right_min` | 0 | Minimum right-side bars for aggressive divergence pivots. | Makes aggressive setups appear earlier, but increases false-positive risk. |
| `aggressive_right_max` | 1 | Maximum right-side bars for aggressive divergence pivots. | Keeps aggressive mode fast, but too much looseness can flood the screener with weak signals. |
| `include_invalidated` | false | Includes invalidated aggressive divergences in audit mode. | Good for review and debugging; not ideal for a trade list because it mixes live and invalidated setups. |

## Suggested Defaults by Goal

If you want a conservative list with higher trust:

1. Keep `breakout_relaxed=false`.
2. Use `state=breakout`.
3. Set a moderate `min_confidence` such as 55 or 65.
4. Keep `pivot_right_window` at 1 or 2.

If you want broader coverage and earlier alerts:

1. Enable `breakout_relaxed=true`.
2. Allow `state=potential` in addition to breakouts.
3. Keep `min_confidence` lower and review touch counts manually.
4. For divergence, use the aggressive right-window settings and audit invalidated results only when debugging.

## Notes on Current Implementation

1. Triangle line anchors come from pivot highs and lows; dates that are not pivots cannot be used as line starts.
2. The formation boundary check intentionally excludes the most recent bars so the detector can still produce real breakout states.
3. Triangle screener parameters are shared between the market screener and ticker detail views, so a result opened from the screener should preserve its detection context.
4. The default ticker chart overlay mode is intentionally no overlay, so you must switch to triangle or divergence view to see those signals.

## References

- [API contract](API_CONTRACT.md)
- [Triangle detector](backend/app/services/triangle_detector.py)
- [Triangle routes](backend/app/routers/triangles.py)
- [Screener UI](frontend/src/app/screener/page.tsx)
- [Frontend API client](frontend/src/lib/api.ts)
- [Frontend contract types](frontend/src/types/index.ts)