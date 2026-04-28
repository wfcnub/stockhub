// API Contract v1.0.5 Types

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
  offset?: number;
  skip?: number;
  limit?: number;
  search?: string;
  index?: string;
  sector?: string;
  sort_by?: 'symbol' | 'name';
  sort_order?: 'asc' | 'desc';
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
    ma_10?: number;
    ma_15?: number;
    ma_20?: number;
    ma_50?: number;
    ma_100?: number;
    ma_200?: number;
    rsi_14?: number;
    macd?: {
      value: number;
      signal: number;
      histogram: number;
      ma_type?: MACDMovingAverageType;
    };
    macd_modes?: {
      sma?: {
        value: number;
        signal: number;
        histogram: number;
        ma_type?: MACDMovingAverageType;
      };
      ema?: {
        value: number;
        signal: number;
        histogram: number;
        ma_type?: MACDMovingAverageType;
      };
    };
  };
}

export type MACDMovingAverageType = 'sma' | 'ema';

export interface ChartDataResponse {
  symbol: string;
  range: string;
  macd_ma_type?: MACDMovingAverageType;
  data: ChartDataPoint[];
}

export interface ChartQueryParams {
  range?: '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL';
  ma_periods?: string; // Comma-separated, e.g., "10,15,20,50,100,200"
  macd_ma_type?: MACDMovingAverageType;
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

// ============ Divergence Detection ============

export type DivergenceType = 'regular' | 'hidden';
export type DivergenceGrade = 'oversold' | 'neutral';
export type DivergenceStrategyType = 'BULLISH_CONFIRMED' | 'BULLISH_AGGRESSIVE' | 'BULLISH_EMERGING';
export type DivergenceLineStyle = 'dashed' | 'dotted';

export interface DivergencePoint {
  timestamp: number;
  low: number;
  rsi_14: number;
}

export interface DivergenceEvent {
  strategy_type: DivergenceStrategyType;
  type: DivergenceType;
  logic_type: DivergenceType;
  line_style: DivergenceLineStyle;
  color_hex: string;
  grade: DivergenceGrade;
  confirmation_degree: number;
  p1: DivergencePoint;
  p2: DivergencePoint;
  trough_timestamp: number;
  confirmation_timestamp: number;
  signal_timestamp: number;
  invalidation_level: number | null;
  is_invalidated?: boolean;
  action: string;
}

export interface TickerDivergencesResponse {
  symbol: string;
  events: DivergenceEvent[];
}

export interface DivergenceScreenerItem extends DivergenceEvent {
  symbol: string;
  name: string;
}

export interface DivergenceScreenerResponse {
  lookback_days: number;
  include_invalidated?: boolean;
  count: number;
  results: DivergenceScreenerItem[];
}

// ============ Triangle Detection ============

export type TriangleType = 'symmetrical' | 'ascending' | 'descending';
export type TriangleState = 'potential' | 'breakout';
export type BreakoutDirection = 'bullish' | 'bearish';
export type TriangleConfidenceLevel = 'low' | 'medium' | 'high';

export interface TriangleLineAnchor {
  timestamp: number;
  price: number;
}

export interface TriangleLine {
  start_timestamp: number;
  start_price: number;
  end_timestamp: number;
  end_price: number;
}

export interface TriangleEvent {
  triangle_type: TriangleType;
  state: TriangleState;
  breakout_direction: BreakoutDirection | null;
  line_style: 'solid' | 'dashed' | 'dotted';
  color_hex: string;
  confidence_level: TriangleConfidenceLevel;
  confidence_score: number;
  upper_touch_count: number;
  lower_touch_count: number;
  total_touch_count: number;
  breakout_close_count: number;
  volume_ratio: number | null;
  upper_line: TriangleLine;
  lower_line: TriangleLine;
  formation_start_timestamp: number;
  apex_timestamp: number;
  signal_timestamp: number;
  invalidation_level: number | null;
  action: string;
}

export interface TickerTrianglesResponse {
  symbol: string;
  events: TriangleEvent[];
}

export interface TriangleScreenerItem extends TriangleEvent {
  symbol: string;
  name: string;
}

export interface TriangleScreenerResponse {
  lookback_days: number;
  count: number;
  results: TriangleScreenerItem[];
}

export interface TriangleConfigParams {
  lookback_bars?: number;
  pivot_left_window?: number;
  pivot_right_window?: number;
  breakout_relaxed?: boolean;
  include_potential?: boolean;
  include_breakouts?: boolean;
  triangle_types?: TriangleType[];
  direction?: 'all' | BreakoutDirection;
  state?: 'all' | TriangleState;
  min_confidence?: number;
  index_code?: string;
  limit?: number;
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
  { label: 'MA 10', value: 10 },
  { label: 'MA 15', value: 15 },
  { label: 'MA 20', value: 20 },
  { label: 'MA 50', value: 50 },
  { label: 'MA 100', value: 100 },
  { label: 'MA 200', value: 200 },
];