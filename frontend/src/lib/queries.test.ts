import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getChartData: vi.fn(),
  getDivergenceScreener: vi.fn(),
  getIndexes: vi.fn(),
  getStats: vi.fn(),
  getSyncProgress: vi.fn(),
  getTicker: vi.fn(),
  getTickerDivergences: vi.fn(),
  getTickers: vi.fn(),
  getTickerTriangles: vi.fn(),
  getTriangleScreener: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

import {
  chartQuery,
  divergenceScreenerQuery,
  indexesQuery,
  queryKeys,
  syncProgressQuery,
  tickerDivergencesQuery,
  tickersQuery,
  tickerTrianglesQuery,
  triangleScreenerQuery,
} from './queries';

const MINUTE = 60_000;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('query keys', () => {
  it('differ per parameter set so each combination has its own cache entry', () => {
    expect(queryKeys.tickers({ offset: 0 })).not.toEqual(queryKeys.tickers({ offset: 10 }));
    expect(queryKeys.chart('BBCA', { range: '1Y' })).not.toEqual(queryKeys.chart('BBCA', { range: '5Y' }));
    expect(queryKeys.divergenceScreener(7, {})).not.toEqual(queryKeys.divergenceScreener(30, {}));
    expect(queryKeys.syncProgress()).not.toEqual(queryKeys.syncProgress('sync_1'));
  });

  it('every index list shares the "indexes" prefix so one invalidation refreshes them all', () => {
    expect(queryKeys.indexes(true)[0]).toBe(queryKeys.indexesAll()[0]);
    expect(queryKeys.indexes()[0]).toBe(queryKeys.indexesAll()[0]);
    expect(queryKeys.indexes(true)).not.toEqual(queryKeys.indexes());
  });
});

describe('stale times', () => {
  it('slow screener and overlay detection calls are cached for 5 minutes', () => {
    expect(divergenceScreenerQuery(7, {}).staleTime).toBe(5 * MINUTE);
    expect(triangleScreenerQuery(7, {}).staleTime).toBe(5 * MINUTE);
    expect(tickerDivergencesQuery('BBCA', {}).staleTime).toBe(5 * MINUTE);
    expect(tickerTrianglesQuery('BBCA', undefined).staleTime).toBe(5 * MINUTE);
  });

  it('sync progress is never fresh', () => {
    expect(syncProgressQuery('sync_1').staleTime).toBe(0);
  });
});

describe('query functions', () => {
  it('pass the AbortSignal through so superseded requests are cancelled', async () => {
    api.getIndexes.mockResolvedValue([]);
    api.getTickers.mockResolvedValue({ total: 0, data: [] });
    api.getChartData.mockResolvedValue({ data: [] });
    api.getDivergenceScreener.mockResolvedValue({ results: [] });
    const { signal } = new AbortController();
    const context = { signal } as never;

    await indexesQuery(true).queryFn?.(context);
    expect(api.getIndexes).toHaveBeenCalledWith(true, { signal });

    await tickersQuery({ limit: 10 }).queryFn?.(context);
    expect(api.getTickers).toHaveBeenCalledWith({ limit: 10 }, { signal });

    await chartQuery('BBCA', { range: '1Y' }).queryFn?.(context);
    expect(api.getChartData).toHaveBeenCalledWith('BBCA', { range: '1Y' }, { signal });

    await divergenceScreenerQuery(14, { include_invalidated: true }).queryFn?.(context);
    expect(api.getDivergenceScreener).toHaveBeenCalledWith(14, { include_invalidated: true }, { signal });
  });
});
