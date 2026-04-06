'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TickerDetails, ChartDataPoint, TimeRangeValue } from '@/types';
import { TIME_RANGES } from '@/types';
import { getTicker, getChartData } from '@/lib/api';
import { KeyMetrics, TickerChart, RSIChart, MACDChart } from '@/components/ticker';
import { ControlShell } from '@/components/layout/ControlShell';

const DEFAULT_MA_PERIODS = [20, 50, 200];

export default function TickerDetailPage() {
  const params = useParams();
  const symbol = params.symbol as string;

  const [ticker, setTicker] = useState<TickerDetails | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRangeValue>('1Y');
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

  useEffect(() => {
    fetchTicker();
  }, [fetchTicker]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

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

  if (error) {
    return (
      <ControlShell
        activeSection="analysis"
        title={`${symbol} Analysis`}
        subtitle="Unable to load this ticker right now."
        actionLabel="Back to Tickers"
        actionHref="/tickers"
      >
        <div className="rounded-gemini border border-gemini-accent-red/35 bg-gemini-accent-red/10 p-4">
          <p className="text-gemini-accent-red">{error}</p>
          <Link href="/tickers" className="mt-2 inline-block text-gemini-accent-blue hover:underline">
              ← Back to Tickers
          </Link>
        </div>
      </ControlShell>
    );
  }

  return (
    <ControlShell
      activeSection="analysis"
      title={`${symbol} Overview`}
      subtitle="Review valuation metrics, chart structure, and momentum overlays."
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
        {ticker && (
          <KeyMetrics
            symbol={ticker.symbol}
            name={ticker.name}
            sector={ticker.sector}
            metrics={ticker.key_metrics}
          />
        )}

        {/* Price Chart with MA */}
        <TickerChart
          symbol={symbol}
          data={chartData}
          isLoading={chartLoading}
          error={chartError}
          selectedRange={selectedRange}
          selectedMA={selectedMA}
          onRangeChange={setSelectedRange}
          onMAChange={setSelectedMA}
        />

        {/* Technical Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RSIChart data={chartData} />
          <MACDChart data={chartData} />
        </div>
      </div>
    </ControlShell>
  );
}