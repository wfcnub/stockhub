'use client';

import { useState, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type {
  ChartDataPoint,
  TimeRangeValue,
  DivergenceEvent,
  TriangleEvent,
  TriangleType,
  TriangleConfigParams,
  MACDMovingAverageType,
} from '@/types';
import { chartQuery, tickerDivergencesQuery, tickerQuery, tickerTrianglesQuery } from '@/lib/queries';
import { KeyMetrics, TickerChart, MACDChart } from '@/components/ticker';
import { ControlShell } from '@/components/layout/ControlShell';
import { parseBooleanParam, parseBoundedInteger } from '@/lib/urlParams';

// Stable empty references so memoised values do not change identity on every render.
const EMPTY_CHART_DATA: ChartDataPoint[] = [];
const EMPTY_DIVERGENCES: DivergenceEvent[] = [];
const EMPTY_TRIANGLES: TriangleEvent[] = [];

const DEFAULT_MA_PERIODS = [10, 15, 20, 50, 100, 200];

const DEFAULT_TRIANGLE_LOOKBACK_BARS = 60;
const DEFAULT_TRIANGLE_PIVOT_LEFT = 3;
const DEFAULT_TRIANGLE_PIVOT_RIGHT = 1;
const DEFAULT_TRIANGLE_MIN_CONFIDENCE = 0;

function normalizeIndexCode(value: string): string {
  return value.trim().toUpperCase();
}

export default function TickerDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = params.symbol as string;

  const [selectedRange, setSelectedRange] = useState<TimeRangeValue>('ALL');
  const [selectedMA, setSelectedMA] = useState<number[]>(DEFAULT_MA_PERIODS);
  const [selectedMacdType, setSelectedMacdType] = useState<MACDMovingAverageType>('sma');

  const triangleQueryParams = useMemo<TriangleConfigParams | undefined>(() => {
    if (searchParams.get('mode') !== 'triangle') {
      return undefined;
    }

    const lookbackBars = parseBoundedInteger(searchParams.get('tri_lookback'), DEFAULT_TRIANGLE_LOOKBACK_BARS, 30, 180);
    const pivotLeftWindow = parseBoundedInteger(searchParams.get('tri_left'), DEFAULT_TRIANGLE_PIVOT_LEFT, 1, 10);
    const pivotRightWindow = parseBoundedInteger(searchParams.get('tri_right'), DEFAULT_TRIANGLE_PIVOT_RIGHT, 0, 10);
    const minConfidence = parseBoundedInteger(
      searchParams.get('tri_min_conf'),
      DEFAULT_TRIANGLE_MIN_CONFIDENCE,
      0,
      100,
    );

    const triType = searchParams.get('tri_type');
    const triState = searchParams.get('tri_state');
    const triDirection = searchParams.get('tri_dir');

    const includePotential = parseBooleanParam(searchParams.get('tri_potential'), true);
    const includeBreakouts = parseBooleanParam(searchParams.get('tri_breakout'), true);
    const breakoutRelaxed = parseBooleanParam(searchParams.get('tri_breakout_relaxed'), false);

    const triangleTypes =
      triType === 'ascending' || triType === 'descending' || triType === 'symmetrical'
        ? ([triType] as TriangleType[])
        : undefined;

    const state = triState === 'potential' || triState === 'breakout' ? triState : undefined;
    const direction = triDirection === 'bullish' || triDirection === 'bearish' ? triDirection : 'all';

    const indexCode = normalizeIndexCode(searchParams.get('tri_index') || '');

    return {
      lookback_bars: lookbackBars,
      pivot_left_window: pivotLeftWindow,
      pivot_right_window: pivotRightWindow,
      include_potential: includePotential,
      include_breakouts: includeBreakouts,
      breakout_relaxed: breakoutRelaxed,
      triangle_types: triangleTypes,
      direction,
      state,
      min_confidence: minConfidence,
      index_code: indexCode || undefined,
    };
  }, [searchParams]);

  const tickerResult = useQuery(tickerQuery(symbol));
  const chartResult = useQuery({
    ...chartQuery(symbol, {
      range: selectedRange,
      ma_periods: selectedMA.length > 0 ? selectedMA.join(',') : undefined,
    }),
    // Keep showing the previous range/MA data (under the loading overlay) while the next one loads.
    placeholderData: keepPreviousData,
  });
  // Divergence and triangle overlays are optional: a failed request never blocks the main chart,
  // it just shows no overlay.
  const divergencesResult = useQuery(tickerDivergencesQuery(symbol, { include_invalidated: true }));
  const trianglesResult = useQuery(tickerTrianglesQuery(symbol, triangleQueryParams));

  const ticker = tickerResult.data ?? null;
  const isLoading = tickerResult.isPending;
  const error = tickerResult.error ? tickerResult.error.message : null;
  const rawChartData = chartResult.data?.data ?? EMPTY_CHART_DATA;
  const chartLoading = chartResult.isFetching;
  const chartError = chartResult.error ? chartResult.error.message : null;
  const divergences = divergencesResult.data?.events ?? EMPTY_DIVERGENCES;
  const triangles = trianglesResult.data?.events ?? EMPTY_TRIANGLES;

  const macdChartData = useMemo(() => {
    return rawChartData.map((point) => {
      const modeData = point.indicators.macd_modes;
      if (!modeData) {
        return point;
      }

      const selectedMacd = modeData[selectedMacdType] ?? modeData.sma ?? modeData.ema ?? point.indicators.macd;

      if (!selectedMacd) {
        return point;
      }

      return {
        ...point,
        indicators: {
          ...point.indicators,
          macd: selectedMacd,
        },
      };
    });
  }, [rawChartData, selectedMacdType]);

  const isSelectedMacdModeAvailable = useMemo(() => {
    return rawChartData.some((point) => Boolean(point.indicators.macd_modes?.[selectedMacdType]));
  }, [rawChartData, selectedMacdType]);

  if (isLoading) {
    return (
      <ControlShell
        activeSection="analysis"
        title={`${symbol} Analysis`}
        subtitle="Loading ticker profile and chart history..."
        actionLabel="Back to Tickers"
        actionHref="/tickers"
      >
        <div className="animate-pulse space-y-6">
          <div className="h-32 rounded-gemini-xl bg-gemini-surface-border/60"></div>
          <div className="h-96 rounded-gemini-xl bg-gemini-surface-border/50"></div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-40 rounded-gemini-xl bg-gemini-surface-border/45"></div>
            <div className="h-40 rounded-gemini-xl bg-gemini-surface-border/45"></div>
          </div>
        </div>
      </ControlShell>
    );
  }

  return (
    <ControlShell
      activeSection="analysis"
      title={`${symbol} Overview`}
      subtitle={
        error
          ? 'Some data could not be loaded. Available modules are still shown below.'
          : 'Review valuation metrics, chart structure, and momentum overlays.'
      }
      actionLabel="Back to Tickers"
      actionHref="/tickers"
    >
      <div className="space-y-6">
        <Link
          href="/tickers"
          className="inline-flex items-center text-gemini-accent-blue transition-colors hover:text-gemini-accent-cyan"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tickers
        </Link>

        {/* Key Metrics */}
        {error ? (
          <div className="rounded-gemini border border-gemini-accent-red/35 bg-gemini-accent-red/10 p-4">
            <div
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-1 text-xs font-medium text-gemini-accent-red"
              title={error}
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="truncate">Failed to load ticker profile</span>
            </div>
          </div>
        ) : ticker ? (
          <KeyMetrics symbol={ticker.symbol} name={ticker.name} sector={ticker.sector} metrics={ticker.key_metrics} />
        ) : (
          <div className="rounded-gemini border border-gemini-surface-border bg-gemini-bg-secondary/45 p-4 text-sm text-gemini-text-secondary">
            Ticker profile is unavailable.
          </div>
        )}

        {/* Price Chart with MA */}
        <TickerChart
          symbol={symbol}
          data={rawChartData}
          divergences={divergences}
          triangles={triangles}
          isLoading={chartLoading}
          error={chartError}
          selectedRange={selectedRange}
          selectedMA={selectedMA}
          onRangeChange={setSelectedRange}
          onMAChange={setSelectedMA}
        />

        <div className="hud-panel p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-muted">MACD Average Type</p>
            <div className="inline-flex overflow-hidden rounded-gemini border border-gemini-surface-border">
              {(['sma', 'ema'] as const).map((mode) => {
                const isActive = selectedMacdType === mode;

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSelectedMacdType(mode)}
                    className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                      isActive
                        ? 'bg-gemini-accent-cyan/20 text-gemini-accent-cyan'
                        : 'bg-transparent text-gemini-text-secondary hover:bg-gemini-surface-border/60'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {!isSelectedMacdModeAvailable ? (
            <p className="mt-2 text-xs text-gemini-text-muted">
              {selectedMacdType.toUpperCase()} data is not available yet for this ticker; showing fallback values from
              stored MACD series.
            </p>
          ) : null}
        </div>

        {/* Technical Indicators */}
        <MACDChart data={macdChartData} mode={selectedMacdType} />
      </div>
    </ControlShell>
  );
}
