// API Contract v0.2.4 Types

// ============ Platform Statistics ============

export interface IndexInfo {
  code: string;
  name: string;
  ticker_count: number;
  last_sync: string;
}

export interface Stats {
  total_tickers: number;
  total_indexes: number;
  last_global_sync: string;
  indexes: IndexInfo[];
}

// ============ Index Selection ============

export interface Index {
  id: number;
  code: string;
  name: string;
  yfinance_suffix?: string | null;
  ticker_count?: number;
  is_active: boolean;
  last_synced_at?: string | null;
  created_at?: string | null;
}

export interface IndexesResponse {
  total?: number;
  data: Index[];
}

export interface CreateIndexRequest {
  code: string;
  name: string;
  yfinance_suffix?: string;
}

export interface UpdateIndexRequest {
  code?: string;
  name?: string;
  yfinance_suffix?: string;
  is_active?: boolean;
}

export interface DeleteIndexResponse {
  deleted: boolean;
  hard_delete: boolean;
  id: number;
  code: string;
  is_active?: boolean;
  message: string;
}

// ============ Sync Operations ============

export interface SyncStartRequest {
  index_code: string;
}

export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface SyncStartResponse {
  sync_id: string;
  index_code: string;
  status: SyncStatus;
  message: string;
}

export interface SyncStopResponse {
  sync_id: string;
  status: SyncStatus;
  message: string;
}

export interface SyncProgress {
  sync_id: string;
  status: SyncStatus;
  progress: {
    total_tickers: number;
    processed_tickers: number;
    percent_complete: number;
    current_ticker: string | null;
    estimated_remaining_seconds: number | null;
  };
}

// ============ Ticker Discovery ============

export interface TickerListItem {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  index: string;
}

export interface TickersResponse {
  total: number;
  data: TickerListItem[];
}

export interface TickersQueryParams {
  skip?: number;
  limit?: number;
  search?: string;
  index?: string;
  sector?: string;
}

// ============ Ticker Details ============

export interface KeyMetrics {
  market_cap: number | null;
  pe_ratio: number | null;
  pbv: number | null;
  dividend_yield: number | null;
  eps: number | null;
  roe: number | null;
  observation_date: string;
}

export interface TickerDetails {
  symbol: string;
  name: string;
  sector: string | null;
  key_metrics: KeyMetrics | null;
}

// ============ Chart Data ============

export interface ChartDataPoint {
  date: string;
  price: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  indicators: {
    ma_20?: number;
    ma_50?: number;
    ma_200?: number;
    rsi_14?: number;
    macd?: {
      value: number;
      signal: number;
      histogram: number;
    };
  };
}

export interface ChartDataResponse {
  symbol: string;
  range: string;
  data: ChartDataPoint[];
}

export interface ChartQueryParams {
  range?: '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL';
  ma_periods?: string; // Comma-separated, e.g., "20,50,200"
}

// ============ Screener ============

export interface ScreenerResult {
  symbol: string;
  name: string;
}

export interface ScreenerResponse {
  preset: string;
  results: ScreenerResult[];
}

// ============ Time Range Options ============

export const TIME_RANGES = [
  { label: '1M', value: '1M' as const },
  { label: '3M', value: '3M' as const },
  { label: '6M', value: '6M' as const },
  { label: '1Y', value: '1Y' as const },
  { label: '5Y', value: '5Y' as const },
  { label: 'ALL', value: 'ALL' as const },
];

export type TimeRangeValue = typeof TIME_RANGES[number]['value'];

// ============ MA Period Options ============

export const MA_PERIOD_OPTIONS = [
  { label: 'MA 20', value: 20 },
  { label: 'MA 50', value: 50 },
  { label: 'MA 200', value: 200 },
];