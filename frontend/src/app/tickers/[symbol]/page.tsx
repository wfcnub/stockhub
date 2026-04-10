'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TickerDetails, ChartDataPoint, TimeRangeValue, DivergenceEvent } from '@/types';
import { TIME_RANGES } from '@/types';
import { getTicker, getChartData, getTickerDivergences } from '@/lib/api';
import { KeyMetrics, TickerChart, MACDChart } from '@/components/ticker';
import { ControlShell } from '@/components/layout/ControlShell';

const DEFAULT_MA_PERIODS = [10, 15, 20, 50, 100, 200];

export default function TickerDetailPage() {
  const params = useParams();
  const symbol = params.symbol as string;

  const [ticker, setTicker] = useState<TickerDetails | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [divergences, setDivergences] = useState<DivergenceEvent[]>([]);
  const [selectedRange, setSelectedRange] = useState<TimeRangeValue>('ALL');
  const [selectedMA, setSelectedMA] = useState<number[]>(DEFAULT_MA_PERIODS);

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
      setChartData(response.data);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setChartLoading(false);
    }
  }, [symbol, selectedRange, selectedMA]);

  const fetchDivergences = useCallback(async () => {
    try {
      const response = await getTickerDivergences(symbol);
      setDivergences(response.events);
    } catch {
      setDivergences([]);
    }
  }, [symbol]);

  useEffect(() => {
    fetchTicker();
  }, [fetchTicker]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  useEffect(() => {
    fetchDivergences();
  }, [fetchDivergences]);

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
          data={chartData}
          divergences={divergences}
          isLoading={chartLoading}
          error={chartError}
          selectedRange={selectedRange}
          selectedMA={selectedMA}
          onRangeChange={setSelectedRange}
          onMAChange={setSelectedMA}
        />

        {/* Technical Indicators */}
        <MACDChart data={chartData} />
      </div>
    </ControlShell>
  );
}