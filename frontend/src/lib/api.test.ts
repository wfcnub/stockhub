import { beforeEach, describe, expect, it, vi } from 'vitest';

// api.ts builds its axios instance at import time, so the mock must exist before the import.
const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('axios', () => {
  const isAxiosError = (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { isAxiosError?: boolean }).isAxiosError === true;
  const axios = { create: vi.fn(() => http), isAxiosError };
  return { default: axios, ...axios };
});

import {
  ApiError,
  deleteIndex,
  getChartData,
  getDivergenceScreener,
  getIndexes,
  getScreener,
  getSyncProgress,
  getTicker,
  getTickerDivergences,
  getTickerTriangles,
  getTriangleScreener,
  startSync,
} from './api';
import type { TriangleEvent } from '@/types';

function axiosError(status: number | null, data?: unknown) {
  return {
    isAxiosError: true,
    response: status === null ? undefined : { status, data },
  };
}

function triangle(state: 'potential' | 'breakout'): TriangleEvent {
  return { state } as unknown as TriangleEvent;
}

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  http.patch.mockReset();
  http.delete.mockReset();
});

describe('error mapping', () => {
  it('uses the string detail and appends the HTTP status', async () => {
    http.get.mockRejectedValue(axiosError(404, { detail: 'Ticker not found' }));

    const error = await getTicker('NOPE').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('Ticker not found (HTTP 404)');
    // SyncSection detects "not found" with message.includes('404').
    expect((error as ApiError).message).toContain('404');
  });

  it('joins FastAPI validation issues and drops the query/body prefix', async () => {
    http.get.mockRejectedValue(
      axiosError(422, {
        detail: [
          { loc: ['query', 'days'], msg: 'ensure this value is less than or equal to 30', type: 'value_error' },
          { loc: ['query', 'limit'], msg: 'field required', type: 'value_error' },
        ],
      }),
    );

    await expect(getDivergenceScreener(99)).rejects.toThrow(
      'days: ensure this value is less than or equal to 30; limit: field required (HTTP 422)',
    );
  });

  it('falls back to the legacy { error } body and then to a generic message', async () => {
    http.get.mockRejectedValueOnce(axiosError(404, { error: 'Ticker not found' }));
    await expect(getTicker('X')).rejects.toThrow('Ticker not found (HTTP 404)');

    http.get.mockRejectedValueOnce(axiosError(500, undefined));
    await expect(getTicker('X')).rejects.toThrow('Request failed (HTTP 500)');
  });

  it('reports an unreachable API without a status', async () => {
    http.get.mockRejectedValue(axiosError(null));

    const error = await getTicker('BBCA').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeNull();
    expect((error as ApiError).message).toMatch(/Cannot reach the StockHub API/);
  });
});

describe('request params', () => {
  it('getIndexes unwraps data and only sends is_active when asked', async () => {
    http.get.mockResolvedValue({ data: { total: 1, data: [{ id: 1, code: 'JCI' }] } });

    expect(await getIndexes()).toEqual([{ id: 1, code: 'JCI' }]);
    expect(http.get).toHaveBeenLastCalledWith('/indexes', { params: undefined });

    await getIndexes(true);
    expect(http.get).toHaveBeenLastCalledWith('/indexes', { params: { is_active: true } });
  });

  it('deleteIndex sends hard_delete as a query param (default false)', async () => {
    http.delete.mockResolvedValue({ data: { deleted: true } });

    await deleteIndex(3);
    expect(http.delete).toHaveBeenLastCalledWith('/indexes/3', { params: { hard_delete: false } });

    await deleteIndex(3, true);
    expect(http.delete).toHaveBeenLastCalledWith('/indexes/3', { params: { hard_delete: true } });
  });

  it('sync endpoints use query params, not bodies', async () => {
    http.post.mockResolvedValue({ data: {} });
    http.get.mockResolvedValue({ data: {} });

    await startSync('JCI');
    expect(http.post).toHaveBeenLastCalledWith('/sync/start', null, {
      params: { index_code: 'JCI', start_date: undefined },
    });

    await getSyncProgress();
    expect(http.get).toHaveBeenLastCalledWith('/sync/progress', { params: { sync_id: undefined } });
  });

  it('encodes the symbol in path segments', async () => {
    http.get.mockResolvedValue({ data: {} });

    await getTicker('A/B');
    expect(http.get).toHaveBeenLastCalledWith('/tickers/A%2FB');

    await getChartData('BBCA', { range: '1Y', ma_periods: '10,20' });
    expect(http.get).toHaveBeenLastCalledWith('/tickers/BBCA/chart', {
      params: { range: '1Y', ma_periods: '10,20' },
    });
  });

  it('passes the screener lookback days through, defaulting to 7', async () => {
    http.get.mockResolvedValue({ data: { results: [] } });

    await getDivergenceScreener(undefined, { include_invalidated: true });
    expect(http.get).toHaveBeenLastCalledWith('/screener/divergences', {
      params: { days: 7, include_invalidated: true },
    });

    await getDivergenceScreener(30);
    expect(http.get).toHaveBeenLastCalledWith('/screener/divergences', { params: { days: 30 } });
  });

  it('getScreener forwards filters unchanged', async () => {
    http.get.mockResolvedValue({ data: { total: 0, results: [] } });

    await getScreener({ min_price: 100, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith('/screener', { params: { min_price: 100, limit: 10 } });
  });

  it('ticker divergences drop the screener-only limit param', async () => {
    http.get.mockResolvedValue({ data: { symbol: 'BBCA', events: [] } });

    await getTickerDivergences('BBCA', { include_invalidated: true, limit: 5 });

    expect(http.get).toHaveBeenLastCalledWith('/charts/BBCA/divergences', {
      params: { include_invalidated: true },
    });
  });
});

describe('triangle endpoints', () => {
  it('ticker triangles send CSV types and omit screener-only params', async () => {
    http.get.mockResolvedValue({ data: { symbol: 'BBCA', events: [] } });

    await getTickerTriangles('BBCA', {
      lookback_bars: 90,
      triangle_types: ['ascending', 'descending'],
      index_code: 'JCI',
      limit: 500,
      direction: 'bullish',
    });

    expect(http.get).toHaveBeenLastCalledWith('/charts/BBCA/triangles', {
      params: { lookback_bars: 90, direction: 'bullish', triangle_types: 'ascending,descending' },
    });
  });

  it('omits triangle_types when none are selected', async () => {
    http.get.mockResolvedValue({ data: { symbol: 'BBCA', events: [] } });

    await getTickerTriangles('BBCA', { triangle_types: [] });
    await getTickerTriangles('BBCA');

    for (const call of http.get.mock.calls) {
      expect(call[1].params.triangle_types).toBeUndefined();
    }
  });

  it('applies the state filter client-side, because the ticker endpoint has no state param', async () => {
    const events = [triangle('potential'), triangle('breakout'), triangle('potential')];
    http.get.mockResolvedValue({ data: { symbol: 'BBCA', events } });

    const potential = await getTickerTriangles('BBCA', { state: 'potential' });
    expect(potential.events).toHaveLength(2);
    expect(potential.events.every((event) => event.state === 'potential')).toBe(true);
    expect(http.get.mock.calls[0][1].params).not.toHaveProperty('state');

    const breakout = await getTickerTriangles('BBCA', { state: 'breakout' });
    expect(breakout.events).toHaveLength(1);

    const all = await getTickerTriangles('BBCA', { state: 'all' });
    expect(all.events).toHaveLength(3);

    const unset = await getTickerTriangles('BBCA');
    expect(unset.events).toHaveLength(3);
  });

  it('the screener sends state and index_code to the server along with days', async () => {
    http.get.mockResolvedValue({ data: { results: [] } });

    await getTriangleScreener(14, {
      state: 'breakout',
      index_code: 'JCI',
      triangle_types: ['symmetrical'],
      limit: 500,
    });

    expect(http.get).toHaveBeenLastCalledWith('/screener/triangles', {
      params: { days: 14, state: 'breakout', index_code: 'JCI', limit: 500, triangle_types: 'symmetrical' },
    });
  });
});
