import axios, { AxiosError } from 'axios';
import type {
  ChartDataResponse,
  ChartQueryParams,
  CreateIndexRequest,
  DeleteIndexResponse,
  DivergenceConfigParams,
  DivergenceScreenerResponse,
  Index,
  IndexesResponse,
  ScreenerQueryParams,
  ScreenerResponse,
  Stats,
  SyncProgress,
  SyncStartResponse,
  SyncStopResponse,
  TickerDetails,
  TickerDivergencesResponse,
  TickersQueryParams,
  TickersResponse,
  TickerTrianglesResponse,
  TriangleConfigParams,
  TriangleScreenerResponse,
  UpdateIndexRequest,
} from '@/types';

// Re-exported because pages import it from '@/lib/api'.
export type { DivergenceConfigParams };

// API contract: all public routes live under /api/v1 (see API_CONTRACT.md, "Environment Variable").
const DEFAULT_API_URL = 'http://localhost:8000/api/v1';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ============ Errors ============

/**
 * Error thrown for every failed request.
 *
 * `message` is human readable and always ends with `(HTTP <status>)` when the server answered, so
 * callers that only inspect `error.message` (e.g. `message.includes('404')`) keep working.
 * Contract error bodies are `{ "detail": string | ValidationIssue[] }`.
 */
export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function formatDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue) => {
        if (issue && typeof issue === 'object' && 'msg' in issue) {
          const { msg, loc } = issue as { msg?: unknown; loc?: unknown };
          const field = Array.isArray(loc) ? loc.filter((part) => part !== 'query' && part !== 'body').join('.') : '';
          return typeof msg === 'string' ? (field ? `${field}: ${msg}` : msg) : null;
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join('; ') : null;
  }

  return null;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: unknown; error?: unknown }>;
    const status = axiosError.response?.status ?? null;

    if (status === null) {
      return new ApiError(`Cannot reach the StockHub API at ${API_BASE_URL}`, null);
    }

    const body = axiosError.response?.data;
    // Contract notes a legacy `{ "error": ... }` shape on indicator endpoints.
    const detail = formatDetail(body?.detail) ?? (typeof body?.error === 'string' ? body.error : null);
    return new ApiError(`${detail ?? 'Request failed'} (HTTP ${status})`, status);
  }

  return new ApiError(error instanceof Error ? error.message : 'Unexpected error', null);
}

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(',') : undefined;
}

// ============ Stats ============

export function getStats(): Promise<Stats> {
  return request(client.get<Stats>('/stats'));
}

// ============ Indexes ============

/** `GET /indexes`. Pass `true` to list only active indexes. Returns the unwrapped `data` array. */
export async function getIndexes(isActive?: boolean): Promise<Index[]> {
  const response = await request<IndexesResponse>(
    client.get<IndexesResponse>('/indexes', {
      params: isActive === undefined ? undefined : { is_active: isActive },
    }),
  );
  return response.data;
}

export function addIndex(payload: CreateIndexRequest): Promise<Index> {
  return request(client.post<Index>('/indexes', payload));
}

export function updateIndex(id: number, payload: UpdateIndexRequest): Promise<Index> {
  return request(client.patch<Index>(`/indexes/${id}`, payload));
}

/** `DELETE /indexes/{id}`. Soft delete by default; `hardDelete` permanently removes the index and its tickers. */
export function deleteIndex(id: number, hardDelete = false): Promise<DeleteIndexResponse> {
  return request(client.delete<DeleteIndexResponse>(`/indexes/${id}`, { params: { hard_delete: hardDelete } }));
}

// ============ Sync ============

export function startSync(indexCode: string, startDate?: string): Promise<SyncStartResponse> {
  return request(
    client.post<SyncStartResponse>('/sync/start', null, {
      params: { index_code: indexCode, start_date: startDate },
    }),
  );
}

/** Without `syncId` the server returns the latest active job (404 when none exists). */
export function getSyncProgress(syncId?: string): Promise<SyncProgress> {
  return request(client.get<SyncProgress>('/sync/progress', { params: { sync_id: syncId } }));
}

export function stopSync(syncId?: string): Promise<SyncStopResponse> {
  return request(client.post<SyncStopResponse>('/sync/stop', null, { params: { sync_id: syncId } }));
}

// ============ Tickers ============

export function getTickers(params: TickersQueryParams = {}): Promise<TickersResponse> {
  return request(client.get<TickersResponse>('/tickers', { params }));
}

export function getTicker(symbol: string): Promise<TickerDetails> {
  return request(client.get<TickerDetails>(`/tickers/${encodeURIComponent(symbol)}`));
}

export function getChartData(symbol: string, params: ChartQueryParams = {}): Promise<ChartDataResponse> {
  return request(client.get<ChartDataResponse>(`/tickers/${encodeURIComponent(symbol)}/chart`, { params }));
}

// ============ Screener ============

/** Generic screener: preset mode returns `{ preset, results }`, custom filters return `{ total, results }`. */
export function getScreener(params: ScreenerQueryParams = {}): Promise<ScreenerResponse> {
  return request(client.get<ScreenerResponse>('/screener', { params }));
}

// ============ Divergences ============

export function getTickerDivergences(
  symbol: string,
  params: DivergenceConfigParams = {},
): Promise<TickerDivergencesResponse> {
  // `limit` only exists on the screener endpoint.
  const { limit: _limit, ...chartParams } = params;
  return request(
    client.get<TickerDivergencesResponse>(`/charts/${encodeURIComponent(symbol)}/divergences`, {
      params: chartParams,
    }),
  );
}

/** `days` is the lookback window (contract: 1-30, default 7). */
export function getDivergenceScreener(
  days = 7,
  params: DivergenceConfigParams = {},
): Promise<DivergenceScreenerResponse> {
  return request(client.get<DivergenceScreenerResponse>('/screener/divergences', { params: { days, ...params } }));
}

// ============ Triangles ============

export async function getTickerTriangles(
  symbol: string,
  params: TriangleConfigParams = {},
): Promise<TickerTrianglesResponse> {
  // The ticker endpoint has no `state`, `index_code` or `limit` params (those are screener-only);
  // `state` is applied client-side so the ticker page keeps its existing filter behaviour.
  const { state, index_code: _indexCode, limit: _limit, triangle_types, ...chartParams } = params;

  const response = await request(
    client.get<TickerTrianglesResponse>(`/charts/${encodeURIComponent(symbol)}/triangles`, {
      params: { ...chartParams, triangle_types: csv(triangle_types) },
    }),
  );

  if (!state || state === 'all') {
    return response;
  }

  return { ...response, events: response.events.filter((event) => event.state === state) };
}

/** `days` is the lookback window (contract: 1-30, default 7). */
export function getTriangleScreener(days = 7, params: TriangleConfigParams = {}): Promise<TriangleScreenerResponse> {
  const { triangle_types, ...rest } = params;
  return request(
    client.get<TriangleScreenerResponse>('/screener/triangles', {
      params: { days, ...rest, triangle_types: csv(triangle_types) },
    }),
  );
}
