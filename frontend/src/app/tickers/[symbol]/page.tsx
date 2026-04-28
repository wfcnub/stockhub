'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type {
  TickerDetails,
  ChartDataPoint,
  TimeRangeValue,
  DivergenceEvent,
  TriangleEvent,
  TriangleType,
  TriangleConfigParams,
  MACDMovingAverageType,
} from '@/types';
import { TIME_RANGES } from '@/types';
import { getTicker, getChartData, getTickerDivergences, getTickerTriangles } from '@/lib/api';
import { KeyMetrics, TickerChart, MACDChart } from '@/components/ticker';
import { ControlShell } from '@/components/layout/ControlShell';

const DEFAULT_MA_PERIODS = [10, 15, 20, 50, 100, 200];

const DEFAULT_TRIANGLE_LOOKBACK_BARS = 60;
const DEFAULT_TRIANGLE_PIVOT_LEFT = 3;
const DEFAULT_TRIANGLE_PIVOT_RIGHT = 1;
const DEFAULT_TRIANGLE_MIN_CONFIDENCE = 0;

function toBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  if (rounded < minimum || rounded > maximum) {
    return fallback;
  }

  return rounded;
}

function toBooleanQueryValue(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeIndexCode(value: string): string {
  return value.trim().toUpperCase();
}

export default function TickerDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = params.symbol as string;

  const [ticker, setTicker] = useState<TickerDetails | null>(null);
  const [rawChartData, setRawChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [divergences, setDivergences] = useState<DivergenceEvent[]>([]);
  const [triangles, setTriangles] = useState<TriangleEvent[]>([]);
  const [selectedRange, setSelectedRange] = useState<TimeRangeValue>('ALL');
  const [selectedMA, setSelectedMA] = useState<number[]>(DEFAULT_MA_PERIODS);
  const [selectedMacdType, setSelectedMacdType] = useState<MACDMovingAverageType>('sma');

  const triangleQueryParams = useMemo<TriangleConfigParams | undefined>(() => {
    if (searchParams.get('mode') !== 'triangle') {
      return undefined;
    }

    const lookbackBars = toBoundedInteger(
      searchParams.get('tri_lookback'),
      DEFAULT_TRIANGLE_LOOKBACK_BARS,
      30,
      180,
    );
    const pivotLeftWindow = toBoundedInteger(
      searchParams.get('tri_left'),
      DEFAULT_TRIANGLE_PIVOT_LEFT,
      1,
      10,
    );
    const pivotRightWindow = toBoundedInteger(
      searchParams.get('tri_right'),
      DEFAULT_TRIANGLE_PIVOT_RIGHT,
      0,
      10,
    );
    const minConfidence = toBoundedInteger(
      searchParams.get('tri_min_conf'),
      DEFAULT_TRIANGLE_MIN_CONFIDENCE,
      0,
      100,
    );

    const triType = searchParams.get('tri_type');
    const triState = searchParams.get('tri_state');
    const triDirection = searchParams.get('tri_dir');

    const includePotential = toBooleanQueryValue(searchParams.get('tri_potential'));
    const includeBreakouts = toBooleanQueryValue(searchParams.get('tri_breakout'));
    const rawBreakoutRelaxed = searchParams.get('tri_breakout_relaxed');
    const breakoutRelaxed = rawBreakoutRelaxed === null
      ? false
      : toBooleanQueryValue(rawBreakoutRelaxed);

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

  const fetchTicker = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getTicker(symbol);
      setTicker(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticker');
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  const fetchChartData = useCallback(async () => {
    setChartLoading(true);
    setChartError(null);
    
    try {
      const response = await getChartData(symbol, {
        range: selectedRange,
        ma_periods: selectedMA.length > 0 ? selectedMA.join(',') : undefined,
      });
      setRawChartData(response.data);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setChartLoading(false);
    }
  }, [symbol, selectedRange, selectedMA]);

  const macdChartData = useMemo(() => {
    return rawChartData.map((point) => {
      const modeData = point.indicators.macd_modes;
      if (!modeData) {
        return point;
      }

      const selectedMacd =
        modeData[selectedMacdType]
        ?? modeData.sma
        ?? modeData.ema
        ?? point.indicators.macd;

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

  const fetchDivergences = useCallback(async () => {
    try {
      const response = await getTickerDivergences(symbol);
      setDivergences(response.events);
    } catch {
      setDivergences([]);
    }
  }, [symbol]);

  const fetchTriangles = useCallback(async () => {
    try {
      const response = await getTickerTriangles(symbol, triangleQueryParams);
      setTriangles(response.events);
    } catch {
      // Triangle overlays are optional and should never block the main chart module.
      setTriangles([]);
    }
  }, [symbol, triangleQueryParams]);

  useEffect(() => {
    fetchTicker();
  }, [fetchTicker]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  useEffect(() => {
    fetchDivergences();
  }, [fetchDivergences]);

  useEffect(() => {
    fetchTriangles();
  }, [fetchTriangles]);

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
      subtitle={error ? 'Some data could not be loaded. Available modules are still shown below.' : 'Review valuation metrics, chart structure, and momentum overlays.'}
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
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-1 text-xs font-medium text-gemini-accent-red" title={error}>
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">Failed to load ticker profile</span>
            </div>
          </div>
        ) : ticker ? (
          <KeyMetrics
            symbol={ticker.symbol}
            name={ticker.name}
            sector={ticker.sector}
            metrics={ticker.key_metrics}
          />
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
              {selectedMacdType.toUpperCase()} data is not available yet for this ticker; showing fallback values from stored MACD series.
            </p>
          ) : null}
        </div>

        {/* Technical Indicators */}
        <MACDChart data={macdChartData} mode={selectedMacdType} />
      </div>
    </ControlShell>
  );
}