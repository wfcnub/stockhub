import { queryOptions } from '@tanstack/react-query';
import {
  getChartData,
  getDivergenceScreener,
  getIndexes,
  getStats,
  getSyncProgress,
  getTicker,
  getTickerDivergences,
  getTickers,
  getTickerTriangles,
  getTriangleScreener,
} from '@/lib/api';
import type { ChartQueryParams, DivergenceConfigParams, TickersQueryParams, TriangleConfigParams } from '@/types';

/**
 * Query keys and options, one per endpoint. `signal` is passed to the HTTP client so superseded
 * requests (changed filters, unmount) are cancelled instead of racing.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Screener and overlay detection run over market data on demand and are slow: cache them longer. */
const SLOW_STALE_TIME = 5 * MINUTE;

export const queryKeys = {
  stats: () => ['stats'] as const,
  // Prefix used to invalidate every index list after an index is added, edited or deleted.
  indexesAll: () => ['indexes'] as const,
  indexes: (activeOnly?: boolean) => ['indexes', { activeOnly: activeOnly ?? null }] as const,
  tickers: (params: TickersQueryParams) => ['tickers', params] as const,
  ticker: (symbol: string) => ['ticker', symbol] as const,
  chart: (symbol: string, params: ChartQueryParams) => ['chart', symbol, params] as const,
  tickerDivergences: (symbol: string, params: DivergenceConfigParams) =>
    ['ticker-divergences', symbol, params] as const,
  tickerTriangles: (symbol: string, params: TriangleConfigParams | undefined) =>
    ['ticker-triangles', symbol, params ?? null] as const,
  divergenceScreener: (days: number, params: DivergenceConfigParams) => ['screener-divergences', days, params] as const,
  triangleScreener: (days: number, params: TriangleConfigParams) => ['screener-triangles', days, params] as const,
  syncProgress: (syncId?: string) => ['sync-progress', syncId ?? 'active'] as const,
};

export const statsQuery = () =>
  queryOptions({
    queryKey: queryKeys.stats(),
    queryFn: ({ signal }) => getStats({ signal }),
    staleTime: MINUTE,
  });

export const indexesQuery = (activeOnly?: boolean) =>
  queryOptions({
    queryKey: queryKeys.indexes(activeOnly),
    queryFn: ({ signal }) => getIndexes(activeOnly, { signal }),
    staleTime: MINUTE,
  });

export const tickersQuery = (params: TickersQueryParams) =>
  queryOptions({
    queryKey: queryKeys.tickers(params),
    queryFn: ({ signal }) => getTickers(params, { signal }),
    staleTime: MINUTE,
  });

export const tickerQuery = (symbol: string) =>
  queryOptions({
    queryKey: queryKeys.ticker(symbol),
    queryFn: ({ signal }) => getTicker(symbol, { signal }),
    staleTime: 5 * MINUTE,
  });

export const chartQuery = (symbol: string, params: ChartQueryParams) =>
  queryOptions({
    queryKey: queryKeys.chart(symbol, params),
    queryFn: ({ signal }) => getChartData(symbol, params, { signal }),
    staleTime: 5 * MINUTE,
  });

export const tickerDivergencesQuery = (symbol: string, params: DivergenceConfigParams) =>
  queryOptions({
    queryKey: queryKeys.tickerDivergences(symbol, params),
    queryFn: ({ signal }) => getTickerDivergences(symbol, params, { signal }),
    staleTime: SLOW_STALE_TIME,
  });

export const tickerTrianglesQuery = (symbol: string, params: TriangleConfigParams | undefined) =>
  queryOptions({
    queryKey: queryKeys.tickerTriangles(symbol, params),
    queryFn: ({ signal }) => getTickerTriangles(symbol, params, { signal }),
    staleTime: SLOW_STALE_TIME,
  });

export const divergenceScreenerQuery = (days: number, params: DivergenceConfigParams) =>
  queryOptions({
    queryKey: queryKeys.divergenceScreener(days, params),
    queryFn: ({ signal }) => getDivergenceScreener(days, params, { signal }),
    staleTime: SLOW_STALE_TIME,
  });

export const triangleScreenerQuery = (days: number, params: TriangleConfigParams) =>
  queryOptions({
    queryKey: queryKeys.triangleScreener(days, params),
    queryFn: ({ signal }) => getTriangleScreener(days, params, { signal }),
    staleTime: SLOW_STALE_TIME,
  });

/** Progress is live data: never treat it as fresh. */
export const syncProgressQuery = (syncId?: string) =>
  queryOptions({
    queryKey: queryKeys.syncProgress(syncId),
    queryFn: ({ signal }) => getSyncProgress(syncId, { signal }),
    staleTime: 0,
  });
