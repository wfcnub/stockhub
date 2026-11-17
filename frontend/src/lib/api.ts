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

/** True when the browser talks to this app's own origin (the /api proxy) instead of the backend directly. */
const USES_SAME_ORIGIN_PROXY = API_BASE_URL.startsWith('/');

/**
 * Whether write endpoints (sync start/stop, index create/update/delete) can be used from the UI.
 *
 * The /api proxy forwards GET and HEAD only until the backend has an admin token, so by default
 * writes are disabled when the client uses the same-origin proxy and enabled when it talks to the
 * backend directly (local dev). Override with NEXT_PUBLIC_ADMIN_ACTIONS=enabled|disabled.
 */
export const ADMIN_ACTIONS_ENABLED =
  process.env.NEXT_PUBLIC_ADMIN_ACTIONS === 'enabled'
    ? true
    : process.env.NEXT_PUBLIC_ADMIN_ACTIONS === 'disabled'
      ? false
      : !USES_SAME_ORIGIN_PROXY;

export const ADMIN_ACTIONS_DISABLED_MESSAGE =
  'Admin actions are disabled: this deployment is read-only until the admin token is configured.';

export const SESSION_EXPIRED_MESSAGE =
  'Could not reach StockHub. If your session expired, reload the page to sign in again.';

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
  /** `session` = the request most likely hit an Access login redirect (reload to sign in again). */
  readonly kind: 'session' | 'admin-disabled' | null;

  constructor(message: string, status: number | null, kind: 'session' | 'admin-disabled' | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
  }
}

export function isSessionError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'session';
}

function assertAdminActionsEnabled(): void {
  if (!ADMIN_ACTIONS_ENABLED) {
    throw new ApiError(ADMIN_ACTIONS_DISABLED_MESSAGE, 405, 'admin-disabled');
  }
}

/**
 * Behind Cloudflare Access an expired session answers API calls with a redirect to the login host.
 * The browser blocks that cross-origin redirect (no response, network error), or a login page
 * (text/html) comes back instead of JSON.
 */
function looksLikeAccessLogin(status: number | null, contentType: unknown): boolean {
  if (status === null) {
    return USES_SAME_ORIGIN_PROXY;
  }
  return typeof contentType === 'string' && contentType.includes('text/html') && [200, 401, 403].includes(status);
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

    if (looksLikeAccessLogin(status, axiosError.response?.headers?.['content-type'])) {
      return new ApiError(SESSION_EXPIRED_MESSAGE, status, 'session');
    }

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

/** Read calls accept an AbortSignal so TanStack Query can cancel requests that are no longer needed. */
export interface RequestOptions {
  signal?: AbortSignal;
}

function withSignal<C extends object>(
  config: C | undefined,
  options: RequestOptions,
): (C & RequestOptions) | undefined {
  return options.signal ? ({ ...config, signal: options.signal } as C & RequestOptions) : config;
}

function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(',') : undefined;
}

// ============ Stats ============

export function getStats(options: RequestOptions = {}): Promise<Stats> {
  return request(client.get<Stats>('/stats', withSignal(undefined, options)));
}

// ============ Indexes ============

/** `GET /indexes`. Pass `true` to list only active indexes. Returns the unwrapped `data` array. */
export async function getIndexes(isActive?: boolean, options: RequestOptions = {}): Promise<Index[]> {
  const response = await request<IndexesResponse>(
    client.get<IndexesResponse>(
      '/indexes',
      withSignal({ params: isActive === undefined ? undefined : { is_active: isActive } }, options),
    ),
  );
  return response.data;
}

export async function addIndex(payload: CreateIndexRequest): Promise<Index> {
  assertAdminActionsEnabled();
  return request(client.post<Index>('/indexes', payload));
}

export async function updateIndex(id: number, payload: UpdateIndexRequest): Promise<Index> {
  assertAdminActionsEnabled();
  return request(client.patch<Index>(`/indexes/${id}`, payload));
}

/** `DELETE /indexes/{id}`. Soft delete by default; `hardDelete` permanently removes the index and its tickers. */
export async function deleteIndex(id: number, hardDelete = false): Promise<DeleteIndexResponse> {
  assertAdminActionsEnabled();
  return request(client.delete<DeleteIndexResponse>(`/indexes/${id}`, { params: { hard_delete: hardDelete } }));
}

// ============ Sync ============

export async function startSync(indexCode: string, startDate?: string): Promise<SyncStartResponse> {
  assertAdminActionsEnabled();
  return request(
    client.post<SyncStartResponse>('/sync/start', null, {
      params: { index_code: indexCode, start_date: startDate },
    }),
  );
}

/** Without `syncId` the server returns the latest active job (404 when none exists). */
export function getSyncProgress(syncId?: string, options: RequestOptions = {}): Promise<SyncProgress> {
  return request(client.get<SyncProgress>('/sync/progress', withSignal({ params: { sync_id: syncId } }, options)));
}

export async function stopSync(syncId?: string): Promise<SyncStopResponse> {
  assertAdminActionsEnabled();
  return request(client.post<SyncStopResponse>('/sync/stop', null, { params: { sync_id: syncId } }));
}

// ============ Tickers ============

export function getTickers(params: TickersQueryParams = {}, options: RequestOptions = {}): Promise<TickersResponse> {
  return request(client.get<TickersResponse>('/tickers', withSignal({ params }, options)));
}

export function getTicker(symbol: string, options: RequestOptions = {}): Promise<TickerDetails> {
  return request(client.get<TickerDetails>(`/tickers/${encodeURIComponent(symbol)}`, withSignal(undefined, options)));
}

export function getChartData(
  symbol: string,
  params: ChartQueryParams = {},
  options: RequestOptions = {},
): Promise<ChartDataResponse> {
  return request(
    client.get<ChartDataResponse>(`/tickers/${encodeURIComponent(symbol)}/chart`, withSignal({ params }, options)),
  );
}

// ============ Screener ============

/** Generic screener: preset mode returns `{ preset, results }`, custom filters return `{ total, results }`. */
export function getScreener(params: ScreenerQueryParams = {}, options: RequestOptions = {}): Promise<ScreenerResponse> {
  return request(client.get<ScreenerResponse>('/screener', withSignal({ params }, options)));
}

// ============ Divergences ============

export function getTickerDivergences(
  symbol: string,
  params: DivergenceConfigParams = {},
  options: RequestOptions = {},
): Promise<TickerDivergencesResponse> {
  // `limit` only exists on the screener endpoint.
  const { limit: _limit, ...chartParams } = params;
  return request(
    client.get<TickerDivergencesResponse>(
      `/charts/${encodeURIComponent(symbol)}/divergences`,
      withSignal({ params: chartParams }, options),
    ),
  );
}

/** `days` is the lookback window (contract: 1-30, default 7). */
export function getDivergenceScreener(
  days = 7,
  params: DivergenceConfigParams = {},
  options: RequestOptions = {},
): Promise<DivergenceScreenerResponse> {
  return request(
    client.get<DivergenceScreenerResponse>(
      '/screener/divergences',
      withSignal({ params: { days, ...params } }, options),
    ),
  );
}

// ============ Triangles ============

export async function getTickerTriangles(
  symbol: string,
  params: TriangleConfigParams = {},
  options: RequestOptions = {},
): Promise<TickerTrianglesResponse> {
  // The ticker endpoint has no `state`, `index_code` or `limit` params (those are screener-only);
  // `state` is applied client-side so the ticker page keeps its existing filter behaviour.
  const { state, index_code: _indexCode, limit: _limit, triangle_types, ...chartParams } = params;

  const response = await request(
    client.get<TickerTrianglesResponse>(
      `/charts/${encodeURIComponent(symbol)}/triangles`,
      withSignal({ params: { ...chartParams, triangle_types: csv(triangle_types) } }, options),
    ),
  );

  if (!state || state === 'all') {
    return response;
  }

  return { ...response, events: response.events.filter((event) => event.state === state) };
}

/** `days` is the lookback window (contract: 1-30, default 7). */
export function getTriangleScreener(
  days = 7,
  params: TriangleConfigParams = {},
  options: RequestOptions = {},
): Promise<TriangleScreenerResponse> {
  const { triangle_types, ...rest } = params;
  return request(
    client.get<TriangleScreenerResponse>(
      '/screener/triangles',
      withSignal({ params: { days, ...rest, triangle_types: csv(triangle_types) } }, options),
    ),
  );
}
