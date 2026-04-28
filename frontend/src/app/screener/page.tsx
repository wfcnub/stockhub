'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ControlShell } from '@/components/layout/ControlShell';
import { getDivergenceScreener, getTriangleScreener } from '@/lib/api';
import type { DivergenceConfigParams } from '@/lib/api';
import type {
  BreakoutDirection,
  DivergenceScreenerItem,
  TriangleConfigParams,
  TriangleScreenerItem,
  TriangleState,
  TriangleType,
} from '@/types';

type ScreenerMode = 'divergence' | 'triangle';

type SignalFilter = 'all' | 'regular' | 'hidden';
type StrategyFilter = 'all' | 'BULLISH_CONFIRMED' | 'BULLISH_AGGRESSIVE' | 'BULLISH_EMERGING';
type GradeFilter = 'all' | 'oversold' | 'neutral';

type TriangleTypeFilter = 'all' | TriangleType;
type TriangleStateFilter = 'all' | TriangleState;
type TriangleDirectionFilter = 'all' | BreakoutDirection;

type NormalizedSignalType = Exclude<SignalFilter, 'all'>;
type NormalizedStrategyType = Exclude<StrategyFilter, 'all'>;
type NormalizedGrade = 'oversold' | 'neutral';

const DEFAULT_ITEMS_PER_PAGE = 10;
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50] as const;

const DEFAULT_PIVOT_LEFT_WINDOW = 5;
const DEFAULT_CONFIRMED_RIGHT_MIN = 2;
const DEFAULT_CONFIRMED_RIGHT_MAX = 5;
const DEFAULT_AGGRESSIVE_RIGHT_MIN = 0;
const DEFAULT_AGGRESSIVE_RIGHT_MAX = 1;

const DEFAULT_TRIANGLE_LOOKBACK_BARS = 60;
const DEFAULT_TRIANGLE_PIVOT_LEFT = 3;
const DEFAULT_TRIANGLE_PIVOT_RIGHT = 1;
const DEFAULT_TRIANGLE_MIN_CONFIDENCE = 0;

type DivergenceItemAliases = Partial<{
  divergence_type: unknown;
  logic_type: unknown;
  signal_type: unknown;
  strategy: unknown;
  strategy_name: unknown;
  strategyType: unknown;
  grade_type: unknown;
  signal_grade: unknown;
}>;

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : null;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function normalizeSignalType(value: unknown): NormalizedSignalType | null {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return null;
  }

  if (
    normalized === 'regular'
    || normalized === 'regular_bullish'
    || normalized === 'bullish_regular'
    || normalized.includes('regular')
  ) {
    return 'regular';
  }
  if (
    normalized === 'hidden'
    || normalized === 'hidden_bullish'
    || normalized === 'bullish_hidden'
    || normalized.includes('hidden')
  ) {
    return 'hidden';
  }

  return null;
}

function normalizeGrade(value: unknown): NormalizedGrade | null {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return null;
  }

  if (normalized.includes('oversold')) {
    return 'oversold';
  }
  if (normalized.includes('neutral')) {
    return 'neutral';
  }

  return null;
}

function normalizeStrategyType(value: unknown): NormalizedStrategyType | null {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return null;
  }

  if (normalized.includes('aggressive')) {
    return 'BULLISH_AGGRESSIVE';
  }
  if (normalized.includes('emerging')) {
    return 'BULLISH_EMERGING';
  }
  if (normalized.includes('confirmed')) {
    return 'BULLISH_CONFIRMED';
  }

  return null;
}

function toSignalFilter(value: string): SignalFilter {
  if (value === 'regular' || value === 'hidden') {
    return value;
  }

  return 'all';
}

function toGradeFilter(value: string): GradeFilter {
  if (value === 'oversold' || value === 'neutral') {
    return value;
  }

  return 'all';
}

function toStrategyFilter(value: string): StrategyFilter {
  if (value === 'BULLISH_CONFIRMED' || value === 'BULLISH_AGGRESSIVE' || value === 'BULLISH_EMERGING') {
    return value;
  }

  return 'all';
}

function toMode(value: string | null): ScreenerMode {
  return value === 'triangle' ? 'triangle' : 'divergence';
}

function toTriangleTypeFilter(value: string | null): TriangleTypeFilter {
  if (value === 'ascending' || value === 'descending' || value === 'symmetrical') {
    return value;
  }

  return 'all';
}

function toTriangleStateFilter(value: string | null): TriangleStateFilter {
  if (value === 'potential' || value === 'breakout') {
    return value;
  }

  return 'all';
}

function toTriangleDirectionFilter(value: string | null): TriangleDirectionFilter {
  if (value === 'bullish' || value === 'bearish') {
    return value;
  }

  return 'all';
}

function toBooleanQueryValue(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

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

function normalizeIndexCode(value: string): string {
  return value.trim().toUpperCase();
}

function resolveTriangleState(
  includePotential: boolean,
  includeBreakouts: boolean,
  stateFilter: TriangleStateFilter,
): TriangleStateFilter | null {
  if (!includePotential && !includeBreakouts) {
    return null;
  }

  if (includePotential && includeBreakouts) {
    return stateFilter;
  }

  return includePotential ? 'potential' : 'breakout';
}

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatPrice(value: number): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatRsi(value: number): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTriangleType(value: TriangleType): string {
  if (value === 'ascending') {
    return 'Ascending';
  }
  if (value === 'descending') {
    return 'Descending';
  }
  return 'Symmetrical';
}

function formatBreakoutDirection(value: BreakoutDirection | null): string {
  if (!value) {
    return '-';
  }

  return value === 'bullish' ? 'Bullish' : 'Bearish';
}

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = toMode(searchParams.get('mode'));
  const initialPageSizeValue = Number(searchParams.get('page_size'));
  const initialItemsPerPage = ITEMS_PER_PAGE_OPTIONS.some((size) => size === initialPageSizeValue)
    ? initialPageSizeValue
    : DEFAULT_ITEMS_PER_PAGE;
  const initialPageValue = Number(searchParams.get('page'));
  const initialPage = Number.isInteger(initialPageValue) && initialPageValue > 0
    ? initialPageValue - 1
    : 0;

  const initialPivotLeft = Number(searchParams.get('pivot_left')) || DEFAULT_PIVOT_LEFT_WINDOW;
  const initialConfirmedMin = Number(searchParams.get('conf_min')) || DEFAULT_CONFIRMED_RIGHT_MIN;
  const initialConfirmedMax = Number(searchParams.get('conf_max')) || DEFAULT_CONFIRMED_RIGHT_MAX;
  const initialAggressiveMin = Number(searchParams.get('agg_min')) || DEFAULT_AGGRESSIVE_RIGHT_MIN;
  const initialAggressiveMax = Number(searchParams.get('agg_max')) || DEFAULT_AGGRESSIVE_RIGHT_MAX;
  const initialAuditMode = toBooleanQueryValue(searchParams.get('audit'));

  const initialTriangleTypeFilter = toTriangleTypeFilter(searchParams.get('tri_type'));
  const initialTriangleStateFilter = toTriangleStateFilter(searchParams.get('tri_state'));
  const initialTriangleDirectionFilter = toTriangleDirectionFilter(searchParams.get('tri_dir'));
  const initialTriangleMinConfidence = toBoundedInteger(
    searchParams.get('tri_min_conf'),
    DEFAULT_TRIANGLE_MIN_CONFIDENCE,
    0,
    100,
  );
  const rawTrianglePotential = searchParams.get('tri_potential');
  const rawTriangleBreakout = searchParams.get('tri_breakout');
  const initialTriangleIncludePotential = rawTrianglePotential === null
    ? true
    : toBooleanQueryValue(rawTrianglePotential);
  const initialTriangleIncludeBreakouts = rawTriangleBreakout === null
    ? true
    : toBooleanQueryValue(rawTriangleBreakout);
  const initialTriangleLookbackBars = toBoundedInteger(
    searchParams.get('tri_lookback'),
    DEFAULT_TRIANGLE_LOOKBACK_BARS,
    30,
    180,
  );
  const initialTrianglePivotLeft = toBoundedInteger(
    searchParams.get('tri_left'),
    DEFAULT_TRIANGLE_PIVOT_LEFT,
    1,
    10,
  );
  const initialTrianglePivotRight = toBoundedInteger(
    searchParams.get('tri_right'),
    DEFAULT_TRIANGLE_PIVOT_RIGHT,
    0,
    10,
  );
  const initialTriangleBreakoutRelaxed = toBooleanQueryValue(searchParams.get('tri_breakout_relaxed'));
  const initialTriangleIndexCode = normalizeIndexCode(searchParams.get('tri_index') || '');

  const [mode, setMode] = useState<ScreenerMode>(initialMode);

  const [divergenceResults, setDivergenceResults] = useState<DivergenceScreenerItem[]>([]);
  const [triangleResults, setTriangleResults] = useState<TriangleScreenerItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('all');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');

  const [triangleTypeFilter, setTriangleTypeFilter] = useState<TriangleTypeFilter>(initialTriangleTypeFilter);
  const [triangleStateFilter, setTriangleStateFilter] = useState<TriangleStateFilter>(initialTriangleStateFilter);
  const [triangleDirectionFilter, setTriangleDirectionFilter] = useState<TriangleDirectionFilter>(initialTriangleDirectionFilter);
  const [triangleMinConfidence, setTriangleMinConfidence] = useState(initialTriangleMinConfidence);

  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);
  const [page, setPage] = useState(initialPage);

  const [pivotLeftWindow, setPivotLeftWindow] = useState(initialPivotLeft);
  const [confirmedRightMin, setConfirmedRightMin] = useState(initialConfirmedMin);
  const [confirmedRightMax, setConfirmedRightMax] = useState(initialConfirmedMax);
  const [aggressiveRightMin, setAggressiveRightMin] = useState(initialAggressiveMin);
  const [aggressiveRightMax, setAggressiveRightMax] = useState(initialAggressiveMax);
  const [includeInvalidated, setIncludeInvalidated] = useState(initialAuditMode);

  const [triangleIncludePotential, setTriangleIncludePotential] = useState(initialTriangleIncludePotential);
  const [triangleIncludeBreakouts, setTriangleIncludeBreakouts] = useState(initialTriangleIncludeBreakouts);
  const [triangleLookbackBars, setTriangleLookbackBars] = useState(initialTriangleLookbackBars);
  const [trianglePivotLeftWindow, setTrianglePivotLeftWindow] = useState(initialTrianglePivotLeft);
  const [trianglePivotRightWindow, setTrianglePivotRightWindow] = useState(initialTrianglePivotRight);
  const [triangleBreakoutRelaxed, setTriangleBreakoutRelaxed] = useState(initialTriangleBreakoutRelaxed);
  const [triangleIndexCode, setTriangleIndexCode] = useState(initialTriangleIndexCode);

  const effectiveTriangleState = useMemo(() => {
    return resolveTriangleState(triangleIncludePotential, triangleIncludeBreakouts, triangleStateFilter);
  }, [triangleIncludePotential, triangleIncludeBreakouts, triangleStateFilter]);

  const buildTriangleTickerHref = useCallback((symbol: string) => {
    const params = new URLSearchParams();
    params.set('mode', 'triangle');

    if (triangleTypeFilter !== 'all') params.set('tri_type', triangleTypeFilter);
    if (triangleStateFilter !== 'all') params.set('tri_state', triangleStateFilter);
    if (triangleDirectionFilter !== 'all') params.set('tri_dir', triangleDirectionFilter);
    if (triangleMinConfidence !== DEFAULT_TRIANGLE_MIN_CONFIDENCE) {
      params.set('tri_min_conf', String(triangleMinConfidence));
    }
    if (!triangleIncludePotential) params.set('tri_potential', '0');
    if (!triangleIncludeBreakouts) params.set('tri_breakout', '0');
    if (triangleLookbackBars !== DEFAULT_TRIANGLE_LOOKBACK_BARS) {
      params.set('tri_lookback', String(triangleLookbackBars));
    }
    if (trianglePivotLeftWindow !== DEFAULT_TRIANGLE_PIVOT_LEFT) {
      params.set('tri_left', String(trianglePivotLeftWindow));
    }
    if (trianglePivotRightWindow !== DEFAULT_TRIANGLE_PIVOT_RIGHT) {
      params.set('tri_right', String(trianglePivotRightWindow));
    }
    if (triangleBreakoutRelaxed) params.set('tri_breakout_relaxed', '1');

    const normalizedIndexCode = normalizeIndexCode(triangleIndexCode);
    if (normalizedIndexCode) {
      params.set('tri_index', normalizedIndexCode);
    }

    return `/tickers/${symbol}?${params.toString()}`;
  }, [
    triangleTypeFilter,
    triangleStateFilter,
    triangleDirectionFilter,
    triangleMinConfidence,
    triangleIncludePotential,
    triangleIncludeBreakouts,
    triangleLookbackBars,
    trianglePivotLeftWindow,
    trianglePivotRightWindow,
    triangleBreakoutRelaxed,
    triangleIndexCode,
  ]);

  const loadDivergenceSignals = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params: DivergenceConfigParams = {
        pivot_left_window: pivotLeftWindow,
        confirmed_right_min: confirmedRightMin,
        confirmed_right_max: confirmedRightMax,
        aggressive_right_min: aggressiveRightMin,
        aggressive_right_max: aggressiveRightMax,
        include_invalidated: includeInvalidated,
      };
      const response = await getDivergenceScreener(7, params);
      const normalizedResults = response.results.map((item) => {
        const itemWithAliases = item as DivergenceScreenerItem & DivergenceItemAliases;
        const signalType = normalizeSignalType(
          firstDefined(
            itemWithAliases.type,
            itemWithAliases.divergence_type,
            itemWithAliases.logic_type,
            itemWithAliases.signal_type,
          )
        );
        const grade = normalizeGrade(
          firstDefined(
            itemWithAliases.grade,
            itemWithAliases.grade_type,
            itemWithAliases.signal_grade,
          )
        );
        const strategyType = normalizeStrategyType(
          firstDefined(
            itemWithAliases.strategy_type,
            itemWithAliases.strategy,
            itemWithAliases.strategy_name,
            itemWithAliases.strategyType,
          )
        );

        const signalTimestamp = typeof (item as { signal_timestamp?: unknown }).signal_timestamp === 'number'
          ? Number((item as { signal_timestamp: number }).signal_timestamp)
          : (
            typeof item.confirmation_timestamp === 'number'
              ? Number(item.confirmation_timestamp)
              : Number(item.p2.timestamp)
          );

        const invalidationLevel = typeof (item as { invalidation_level?: unknown }).invalidation_level === 'number'
          ? Number((item as { invalidation_level: number }).invalidation_level)
          : null;

        const isInvalidated = typeof (item as { is_invalidated?: unknown }).is_invalidated === 'boolean'
          ? Boolean((item as { is_invalidated: boolean }).is_invalidated)
          : false;

        const inferredStrategyType = strategyType
          ?? (invalidationLevel !== null ? 'BULLISH_AGGRESSIVE' : 'BULLISH_CONFIRMED');

        const inferredGrade = grade
          ?? (
            inferredStrategyType === 'BULLISH_AGGRESSIVE' && item.p2.rsi_14 <= 30
              ? 'oversold'
              : 'neutral'
          );

        const actionHint = typeof (item as { action?: unknown }).action === 'string'
          ? String((item as { action: string }).action)
          : (inferredStrategyType === 'BULLISH_AGGRESSIVE'
              ? 'Potential Bottom - Monitor for Open Entry.'
              : 'Confirmed divergence setup');

        return {
          ...item,
          type: signalType ?? 'regular',
          strategy_type: inferredStrategyType,
          grade: inferredGrade,
          signal_timestamp: signalTimestamp,
          invalidation_level: invalidationLevel,
          is_invalidated: isInvalidated,
          action: actionHint,
        };
      });

      setDivergenceResults(normalizedResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load divergence screener');
      setDivergenceResults([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [pivotLeftWindow, confirmedRightMin, confirmedRightMax, aggressiveRightMin, aggressiveRightMax, includeInvalidated]);

  const loadTriangleSignals = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    const resolvedState = resolveTriangleState(
      triangleIncludePotential,
      triangleIncludeBreakouts,
      triangleStateFilter,
    );

    if (resolvedState === null) {
      setTriangleResults([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      const params: TriangleConfigParams = {
        lookback_bars: triangleLookbackBars,
        pivot_left_window: trianglePivotLeftWindow,
        pivot_right_window: trianglePivotRightWindow,
        breakout_relaxed: triangleBreakoutRelaxed,
        triangle_types: triangleTypeFilter === 'all' ? undefined : [triangleTypeFilter],
        direction: triangleDirectionFilter,
        min_confidence: triangleMinConfidence,
        state: resolvedState === 'all' ? undefined : resolvedState,
        index_code: normalizeIndexCode(triangleIndexCode) || undefined,
        limit: 500,
      };

      const response = await getTriangleScreener(7, params);
      setTriangleResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triangle screener');
      setTriangleResults([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    triangleIncludePotential,
    triangleIncludeBreakouts,
    triangleStateFilter,
    triangleLookbackBars,
    trianglePivotLeftWindow,
    trianglePivotRightWindow,
    triangleBreakoutRelaxed,
    triangleTypeFilter,
    triangleDirectionFilter,
    triangleMinConfidence,
    triangleIndexCode,
  ]);

  useEffect(() => {
    if (mode !== 'divergence') {
      return;
    }

    void loadDivergenceSignals();
  }, [mode, loadDivergenceSignals]);

  useEffect(() => {
    if (mode !== 'triangle') {
      return;
    }

    void loadTriangleSignals();
  }, [mode, loadTriangleSignals]);

  useEffect(() => {
    const params = new URLSearchParams();

    if (mode === 'triangle') {
      params.set('mode', 'triangle');
    }

    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) params.set('page_size', String(itemsPerPage));
    if (page > 0) params.set('page', String(page + 1));

    if (mode === 'divergence') {
      if (pivotLeftWindow !== DEFAULT_PIVOT_LEFT_WINDOW) params.set('pivot_left', String(pivotLeftWindow));
      if (confirmedRightMin !== DEFAULT_CONFIRMED_RIGHT_MIN) params.set('conf_min', String(confirmedRightMin));
      if (confirmedRightMax !== DEFAULT_CONFIRMED_RIGHT_MAX) params.set('conf_max', String(confirmedRightMax));
      if (aggressiveRightMin !== DEFAULT_AGGRESSIVE_RIGHT_MIN) params.set('agg_min', String(aggressiveRightMin));
      if (aggressiveRightMax !== DEFAULT_AGGRESSIVE_RIGHT_MAX) params.set('agg_max', String(aggressiveRightMax));
      if (includeInvalidated) params.set('audit', '1');
    } else {
      if (triangleTypeFilter !== 'all') params.set('tri_type', triangleTypeFilter);
      if (triangleStateFilter !== 'all') params.set('tri_state', triangleStateFilter);
      if (triangleDirectionFilter !== 'all') params.set('tri_dir', triangleDirectionFilter);
      if (triangleMinConfidence !== DEFAULT_TRIANGLE_MIN_CONFIDENCE) params.set('tri_min_conf', String(triangleMinConfidence));
      if (!triangleIncludePotential) params.set('tri_potential', '0');
      if (!triangleIncludeBreakouts) params.set('tri_breakout', '0');
      if (triangleLookbackBars !== DEFAULT_TRIANGLE_LOOKBACK_BARS) params.set('tri_lookback', String(triangleLookbackBars));
      if (trianglePivotLeftWindow !== DEFAULT_TRIANGLE_PIVOT_LEFT) params.set('tri_left', String(trianglePivotLeftWindow));
      if (trianglePivotRightWindow !== DEFAULT_TRIANGLE_PIVOT_RIGHT) params.set('tri_right', String(trianglePivotRightWindow));
      if (triangleBreakoutRelaxed) params.set('tri_breakout_relaxed', '1');
      if (normalizeIndexCode(triangleIndexCode)) params.set('tri_index', normalizeIndexCode(triangleIndexCode));
    }

    const currentQueryString = searchParams.toString();
    const queryString = params.toString();

    if (queryString === currentQueryString) {
      return;
    }

    router.replace(`/screener${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [
    mode,
    itemsPerPage,
    page,
    pivotLeftWindow,
    confirmedRightMin,
    confirmedRightMax,
    aggressiveRightMin,
    aggressiveRightMax,
    includeInvalidated,
    triangleTypeFilter,
    triangleStateFilter,
    triangleDirectionFilter,
    triangleMinConfidence,
    triangleIncludePotential,
    triangleIncludeBreakouts,
    triangleLookbackBars,
    trianglePivotLeftWindow,
    trianglePivotRightWindow,
    triangleBreakoutRelaxed,
    triangleIndexCode,
    router,
    searchParams,
  ]);

  const filteredDivergenceResults = useMemo(() => {
    return divergenceResults.filter((item) => {
      const normalizedStrategy = normalizeStrategyType(item.strategy_type);
      const normalizedSignalType = normalizeSignalType(item.type);
      const normalizedGrade = normalizeGrade(item.grade);

      if (strategyFilter !== 'all' && normalizedStrategy !== strategyFilter) {
        return false;
      }

      if (signalFilter !== 'all' && normalizedSignalType !== signalFilter) {
        return false;
      }

      if (gradeFilter === 'oversold') {
        if (normalizedGrade !== 'oversold') {
          return false;
        }
      } else if (gradeFilter !== 'all' && normalizedGrade !== gradeFilter) {
        return false;
      }

      return true;
    });
  }, [gradeFilter, divergenceResults, signalFilter, strategyFilter]);

  const filteredTriangleResults = useMemo(() => {
    if (effectiveTriangleState === null) {
      return [];
    }

    return triangleResults.filter((item) => {
      if (triangleTypeFilter !== 'all' && item.triangle_type !== triangleTypeFilter) {
        return false;
      }

      if (effectiveTriangleState !== 'all' && item.state !== effectiveTriangleState) {
        return false;
      }

      if (triangleDirectionFilter !== 'all') {
        if (item.state !== 'breakout') {
          return false;
        }
        if (item.breakout_direction !== triangleDirectionFilter) {
          return false;
        }
      }

      if (item.confidence_score < triangleMinConfidence) {
        return false;
      }

      return true;
    });
  }, [
    effectiveTriangleState,
    triangleResults,
    triangleTypeFilter,
    triangleDirectionFilter,
    triangleMinConfidence,
  ]);

  const activeFilteredCount = mode === 'divergence'
    ? filteredDivergenceResults.length
    : filteredTriangleResults.length;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const maxPage = Math.max(0, Math.ceil(activeFilteredCount / itemsPerPage) - 1);
    setPage((currentPage) => (currentPage > maxPage ? maxPage : currentPage));
  }, [activeFilteredCount, itemsPerPage, isLoading]);

  const paginatedDivergenceResults = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredDivergenceResults.slice(start, start + itemsPerPage);
  }, [filteredDivergenceResults, itemsPerPage, page]);

  const paginatedTriangleResults = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredTriangleResults.slice(start, start + itemsPerPage);
  }, [filteredTriangleResults, itemsPerPage, page]);

  const handleItemsPerPageChange = (value: number) => {
    const nextItemsPerPage = ITEMS_PER_PAGE_OPTIONS.some((size) => size === value)
      ? value
      : DEFAULT_ITEMS_PER_PAGE;

    setItemsPerPage(nextItemsPerPage);
    setPage(0);
  };

  const handleResetDivergenceDefaults = () => {
    setPivotLeftWindow(DEFAULT_PIVOT_LEFT_WINDOW);
    setConfirmedRightMin(DEFAULT_CONFIRMED_RIGHT_MIN);
    setConfirmedRightMax(DEFAULT_CONFIRMED_RIGHT_MAX);
    setAggressiveRightMin(DEFAULT_AGGRESSIVE_RIGHT_MIN);
    setAggressiveRightMax(DEFAULT_AGGRESSIVE_RIGHT_MAX);
  };

  const handleResetTriangleDefaults = () => {
    setTriangleTypeFilter('all');
    setTriangleStateFilter('all');
    setTriangleDirectionFilter('all');
    setTriangleMinConfidence(DEFAULT_TRIANGLE_MIN_CONFIDENCE);
    setTriangleIncludePotential(true);
    setTriangleIncludeBreakouts(true);
    setTriangleLookbackBars(DEFAULT_TRIANGLE_LOOKBACK_BARS);
    setTrianglePivotLeftWindow(DEFAULT_TRIANGLE_PIVOT_LEFT);
    setTrianglePivotRightWindow(DEFAULT_TRIANGLE_PIVOT_RIGHT);
    setTriangleBreakoutRelaxed(false);
    setTriangleIndexCode('');
  };

  const handleModeChange = (nextMode: ScreenerMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setPage(0);
    setError(null);
  };

  const regularCount = divergenceResults.filter((item) => item.type === 'regular').length;
  const hiddenCount = divergenceResults.filter((item) => item.type === 'hidden').length;
  const aggressiveCount = divergenceResults.filter((item) => item.strategy_type === 'BULLISH_AGGRESSIVE').length;
  const confirmedCount = divergenceResults.filter((item) => item.strategy_type === 'BULLISH_CONFIRMED').length;
  const emergingCount = divergenceResults.filter((item) => item.strategy_type === 'BULLISH_EMERGING').length;
  const invalidatedCount = divergenceResults.filter((item) => item.is_invalidated === true).length;
  const oversoldCount = divergenceResults.filter((item) => normalizeGrade(item.grade) === 'oversold').length;

  const trianglePotentialCount = triangleResults.filter((item) => item.state === 'potential').length;
  const triangleBreakoutCount = triangleResults.filter((item) => item.state === 'breakout').length;
  const triangleBullishCount = triangleResults.filter((item) => item.breakout_direction === 'bullish').length;
  const triangleBearishCount = triangleResults.filter((item) => item.breakout_direction === 'bearish').length;
  const triangleHighConfidenceCount = triangleResults.filter((item) => item.confidence_level === 'high').length;

  const totalPages = Math.ceil(activeFilteredCount / itemsPerPage);
  const visibleStart = activeFilteredCount === 0 ? 0 : (page * itemsPerPage) + 1;
  const visibleEnd = Math.min((page + 1) * itemsPerPage, activeFilteredCount);

  return (
    <ControlShell
      activeSection="screener"
      title={mode === 'divergence' ? 'Signal Screener' : 'Pattern Screener'}
      subtitle={
        mode === 'divergence'
          ? 'Fresh bullish divergence signals (confirmed + aggressive) ranked by newest signal date.'
          : 'Recent triangle pattern setups and breakouts with confidence scoring.'
      }
      actionLabel="Refresh Signals"
      actionHref="/screener"
    >
      <div className="space-y-5">
        <section className="hud-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm uppercase tracking-[0.14em] text-gemini-text-tertiary">Screening Mode</h3>
              <p className="mt-1 text-xs text-gemini-text-secondary">
                Switch between bullish divergences and triangle pattern screening.
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-gemini border border-gemini-surface-border">
              <button
                type="button"
                onClick={() => handleModeChange('divergence')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  mode === 'divergence'
                    ? 'bg-gemini-accent-cyan/20 text-gemini-accent-cyan'
                    : 'bg-transparent text-gemini-text-secondary hover:bg-gemini-surface-hover/70'
                }`}
              >
                Divergence
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('triangle')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  mode === 'triangle'
                    ? 'bg-gemini-accent-cyan/20 text-gemini-accent-cyan'
                    : 'bg-transparent text-gemini-text-secondary hover:bg-gemini-surface-hover/70'
                }`}
              >
                Triangle
              </button>
            </div>
          </div>
        </section>

        {mode === 'divergence' ? (
          <div className="grid gap-4 md:grid-cols-6">
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Regular Bullish</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-green">{regularCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Hidden Bullish</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-cyan">{hiddenCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Confirmed</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: '#EC4899' }}>{confirmedCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Aggressive</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: '#FFBF00' }}>{aggressiveCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Emerging</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: '#9333EA' }}>{emergingCount}</p>
              {includeInvalidated ? (
                <p className="mt-1 text-xs text-gemini-text-tertiary">Invalidated: {invalidatedCount}</p>
              ) : null}
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Oversold Grade</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-orange">{oversoldCount}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-5">
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Potential</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-cyan">{trianglePotentialCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Breakouts</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-green">{triangleBreakoutCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Bullish Breakouts</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-green">{triangleBullishCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Bearish Breakouts</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-red">{triangleBearishCount}</p>
            </div>
            <div className="hud-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">High Confidence</p>
              <p className="mt-2 text-2xl font-semibold text-gemini-accent-orange">{triangleHighConfidenceCount}</p>
            </div>
          </div>
        )}

        {mode === 'divergence' ? (
          <section className="hud-panel p-5">
            <div className="mb-4">
              <h3 className="mb-2 text-sm uppercase tracking-[0.14em] text-gemini-text-tertiary">Detection Parameters</h3>
              <p className="text-xs text-gemini-text-secondary">
                Adjust pivot window settings. Higher right windows = stronger confirmation but later signals.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="pivotLeftWindow" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Pivot Left Window
                </label>
                <input
                  id="pivotLeftWindow"
                  type="number"
                  min={1}
                  max={20}
                  value={pivotLeftWindow}
                  onChange={(e) => setPivotLeftWindow(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="confirmedRightMin" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Confirmed Min
                </label>
                <input
                  id="confirmedRightMin"
                  type="number"
                  min={0}
                  max={10}
                  value={confirmedRightMin}
                  onChange={(e) => setConfirmedRightMin(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="confirmedRightMax" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Confirmed Max
                </label>
                <input
                  id="confirmedRightMax"
                  type="number"
                  min={0}
                  max={10}
                  value={confirmedRightMax}
                  onChange={(e) => setConfirmedRightMax(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="aggressiveRightMin" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Aggressive Min
                </label>
                <input
                  id="aggressiveRightMin"
                  type="number"
                  min={0}
                  max={10}
                  value={aggressiveRightMin}
                  onChange={(e) => setAggressiveRightMin(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="aggressiveRightMax" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Aggressive Max
                </label>
                <input
                  id="aggressiveRightMax"
                  type="number"
                  min={0}
                  max={10}
                  value={aggressiveRightMax}
                  onChange={(e) => setAggressiveRightMax(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={handleResetDivergenceDefaults}
                className="gemini-button px-4 py-2 text-sm"
              >
                Reset Defaults
              </button>

              <button
                onClick={() => loadDivergenceSignals(true)}
                className="gemini-button-primary px-4 py-2 text-sm"
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </section>
        ) : (
          <section className="hud-panel p-5">
            <div className="mb-4">
              <h3 className="mb-2 text-sm uppercase tracking-[0.14em] text-gemini-text-tertiary">Triangle Detector Settings</h3>
              <p className="text-xs text-gemini-text-secondary">
                Tune the window and pivot configuration. Narrower windows produce more signals, broader windows are stricter.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="triangleLookback" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Lookback Bars
                </label>
                <input
                  id="triangleLookback"
                  type="number"
                  min={30}
                  max={180}
                  value={triangleLookbackBars}
                  onChange={(e) => setTriangleLookbackBars(Number(e.target.value))}
                  className="gemini-input w-28 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="trianglePivotLeft" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Pivot Left
                </label>
                <input
                  id="trianglePivotLeft"
                  type="number"
                  min={1}
                  max={10}
                  value={trianglePivotLeftWindow}
                  onChange={(e) => setTrianglePivotLeftWindow(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="trianglePivotRight" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Pivot Right
                </label>
                <input
                  id="trianglePivotRight"
                  type="number"
                  min={0}
                  max={10}
                  value={trianglePivotRightWindow}
                  onChange={(e) => setTrianglePivotRightWindow(Number(e.target.value))}
                  className="gemini-input w-24 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="triangleIndexCode" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Index Code (Optional)
                </label>
                <input
                  id="triangleIndexCode"
                  type="text"
                  value={triangleIndexCode}
                  onChange={(e) => setTriangleIndexCode(normalizeIndexCode(e.target.value))}
                  placeholder="JCI"
                  className="gemini-input w-28 rounded px-3 py-2 text-sm uppercase"
                />
              </div>

              <button
                onClick={handleResetTriangleDefaults}
                className="gemini-button px-4 py-2 text-sm"
              >
                Reset Defaults
              </button>

              <button
                onClick={() => loadTriangleSignals(true)}
                className="gemini-button-primary px-4 py-2 text-sm"
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </section>
        )}

        {mode === 'divergence' ? (
          <section className="hud-panel p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="strategyFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Strategy
                </label>
                <select
                  id="strategyFilter"
                  value={strategyFilter}
                  onChange={(event) => setStrategyFilter(toStrategyFilter(event.target.value))}
                  className="gemini-select min-w-[200px]"
                >
                  <option value="all">All Strategies</option>
                  <option value="BULLISH_CONFIRMED">Bullish Confirmed</option>
                  <option value="BULLISH_AGGRESSIVE">Bullish Aggressive</option>
                  <option value="BULLISH_EMERGING">Bullish Emerging</option>
                </select>
              </div>

              <div>
                <label htmlFor="signalFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Signal Type
                </label>
                <select
                  id="signalFilter"
                  value={signalFilter}
                  onChange={(event) => setSignalFilter(toSignalFilter(event.target.value))}
                  className="gemini-select min-w-[180px]"
                >
                  <option value="all">All Signals</option>
                  <option value="regular">Regular Bullish</option>
                  <option value="hidden">Hidden Bullish</option>
                </select>
              </div>

              <div>
                <label htmlFor="gradeFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Grade
                </label>
                <select
                  id="gradeFilter"
                  value={gradeFilter}
                  onChange={(event) => setGradeFilter(toGradeFilter(event.target.value))}
                  className="gemini-select min-w-[180px]"
                >
                  <option value="all">All Grades</option>
                  <option value="oversold">Oversold</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div>
                <label htmlFor="auditMode" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Audit Mode
                </label>
                <button
                  id="auditMode"
                  type="button"
                  onClick={() => {
                    setIncludeInvalidated((current) => !current);
                    setPage(0);
                  }}
                  className={`gemini-button min-w-[180px] px-4 py-2 text-sm ${includeInvalidated ? 'text-gemini-accent-cyan' : ''}`}
                >
                  {includeInvalidated ? 'Including Invalidated' : 'Hide Invalidated'}
                </button>
              </div>

              <div>
                <label htmlFor="itemsPerPage" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Items / Page
                </label>
                <select
                  id="itemsPerPage"
                  value={itemsPerPage}
                  onChange={(event) => handleItemsPerPageChange(Number(event.target.value))}
                  className="gemini-select min-w-[140px]"
                  aria-label="Items per page"
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        ) : (
          <section className="hud-panel p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="triangleTypeFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Triangle Type
                </label>
                <select
                  id="triangleTypeFilter"
                  value={triangleTypeFilter}
                  onChange={(event) => setTriangleTypeFilter(toTriangleTypeFilter(event.target.value))}
                  className="gemini-select min-w-[180px]"
                >
                  <option value="all">All Types</option>
                  <option value="symmetrical">Symmetrical</option>
                  <option value="ascending">Ascending</option>
                  <option value="descending">Descending</option>
                </select>
              </div>

              <div>
                <label htmlFor="triangleStateFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  State
                </label>
                <select
                  id="triangleStateFilter"
                  value={triangleStateFilter}
                  onChange={(event) => setTriangleStateFilter(toTriangleStateFilter(event.target.value))}
                  className="gemini-select min-w-[160px]"
                >
                  <option value="all">All States</option>
                  <option value="potential">Potential</option>
                  <option value="breakout">Breakout</option>
                </select>
              </div>

              <div>
                <label htmlFor="triangleDirectionFilter" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Direction
                </label>
                <select
                  id="triangleDirectionFilter"
                  value={triangleDirectionFilter}
                  onChange={(event) => setTriangleDirectionFilter(toTriangleDirectionFilter(event.target.value))}
                  className="gemini-select min-w-[160px]"
                >
                  <option value="all">All Directions</option>
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                </select>
              </div>

              <div>
                <label htmlFor="triangleMinConfidence" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Min Confidence
                </label>
                <input
                  id="triangleMinConfidence"
                  type="number"
                  min={0}
                  max={100}
                  value={triangleMinConfidence}
                  onChange={(event) => setTriangleMinConfidence(Number(event.target.value))}
                  className="gemini-input w-28 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="triangleIncludePotential" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Include Potential
                </label>
                <button
                  id="triangleIncludePotential"
                  type="button"
                  onClick={() => {
                    setTriangleIncludePotential((current) => !current);
                    setPage(0);
                  }}
                  className={`gemini-button min-w-[150px] px-4 py-2 text-sm ${triangleIncludePotential ? 'text-gemini-accent-cyan' : ''}`}
                >
                  {triangleIncludePotential ? 'Included' : 'Excluded'}
                </button>
              </div>

              <div>
                <label htmlFor="triangleIncludeBreakouts" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Include Breakouts
                </label>
                <button
                  id="triangleIncludeBreakouts"
                  type="button"
                  onClick={() => {
                    setTriangleIncludeBreakouts((current) => !current);
                    setPage(0);
                  }}
                  className={`gemini-button min-w-[160px] px-4 py-2 text-sm ${triangleIncludeBreakouts ? 'text-gemini-accent-green' : ''}`}
                >
                  {triangleIncludeBreakouts ? 'Included' : 'Excluded'}
                </button>
              </div>

              <div>
                <label htmlFor="triangleBreakoutRelaxed" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Breakout Mode
                </label>
                <button
                  id="triangleBreakoutRelaxed"
                  type="button"
                  onClick={() => {
                    setTriangleBreakoutRelaxed((current) => !current);
                    setPage(0);
                  }}
                  className={`gemini-button min-w-[170px] px-4 py-2 text-sm ${triangleBreakoutRelaxed ? 'text-gemini-accent-orange' : ''}`}
                >
                  {triangleBreakoutRelaxed ? 'Relaxed' : 'Standard'}
                </button>
              </div>

              <div>
                <label htmlFor="itemsPerPageTriangle" className="mb-1 block text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">
                  Items / Page
                </label>
                <select
                  id="itemsPerPageTriangle"
                  value={itemsPerPage}
                  onChange={(event) => handleItemsPerPageChange(Number(event.target.value))}
                  className="gemini-select min-w-[140px]"
                  aria-label="Items per page"
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-gemini border border-gemini-accent-red/35 bg-gemini-accent-red/10 p-4 text-gemini-accent-red">
            {error}
          </div>
        )}

        <section className="hud-panel overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gemini-text-secondary">
              {mode === 'divergence' ? 'Loading divergence signals...' : 'Loading triangle signals...'}
            </div>
          ) : mode === 'divergence' ? (
            filteredDivergenceResults.length === 0 ? (
              <div className="p-10 text-center text-gemini-text-secondary">
                No divergence signals match this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="gemini-table min-w-full">
                  <thead className="bg-gemini-bg-secondary/85">
                    <tr>
                      <th className="px-5 py-3">Signal Date</th>
                      <th className="px-5 py-3">Symbol</th>
                      <th className="px-5 py-3">Strategy</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Grade</th>
                      <th className="px-5 py-3">Conf.</th>
                      <th className="px-5 py-3">P1 (Low / RSI)</th>
                      <th className="px-5 py-3">P2 (Low / RSI)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gemini-surface-border/35">
                    {paginatedDivergenceResults.map((item) => (
                      <tr key={`${item.symbol}-${item.strategy_type}-${item.type}-${item.p1.timestamp}-${item.p2.timestamp}-${item.signal_timestamp}`} className="hover:bg-gemini-surface-hover/55">
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {formatTimestamp(item.signal_timestamp)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Link href={buildTriangleTickerHref(item.symbol)} className="font-semibold text-gemini-accent-blue hover:text-gemini-accent-cyan">
                            {item.symbol}
                          </Link>
                          <p className="mt-0.5 text-xs text-gemini-text-tertiary">{item.name}</p>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="gemini-badge"
                              style={{
                                color: item.strategy_type === 'BULLISH_AGGRESSIVE' 
                                  ? '#FFBF00' 
                                  : item.strategy_type === 'BULLISH_EMERGING'
                                  ? '#9333EA'
                                  : undefined,
                              }}
                            >
                              {item.strategy_type === 'BULLISH_AGGRESSIVE' 
                                ? 'Aggressive' 
                                : item.strategy_type === 'BULLISH_EMERGING'
                                ? 'Emerging'
                                : 'Confirmed'}
                            </span>
                            {item.is_invalidated ? (
                              <span className="gemini-badge text-gemini-accent-red">
                                Invalidated
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`gemini-badge ${item.type === 'regular' ? 'text-gemini-accent-green' : 'text-gemini-accent-cyan'}`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span
                            className={`gemini-badge ${
                              normalizeGrade(item.grade) === 'oversold'
                                ? 'text-gemini-accent-orange'
                                : 'text-gemini-text-secondary'
                            }`}
                          >
                            {normalizeGrade(item.grade) ?? 'neutral'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {(item as { confirmation_degree?: number }).confirmation_degree ?? '-'}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {formatPrice(item.p1.low)} / {formatRsi(item.p1.rsi_14)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {formatPrice(item.p2.low)} / {formatRsi(item.p2.rsi_14)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredTriangleResults.length === 0 ? (
              <div className="p-10 text-center text-gemini-text-secondary">
                No triangle signals match this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="gemini-table min-w-full">
                  <thead className="bg-gemini-bg-secondary/85">
                    <tr>
                      <th className="px-5 py-3">Signal Date</th>
                      <th className="px-5 py-3">Symbol</th>
                      <th className="px-5 py-3">Triangle Type</th>
                      <th className="px-5 py-3">State</th>
                      <th className="px-5 py-3">Direction</th>
                      <th className="px-5 py-3">Confidence</th>
                      <th className="px-5 py-3">Touches (U/L/T)</th>
                      <th className="px-5 py-3">Breakout Closes</th>
                      <th className="px-5 py-3">Volume Ratio</th>
                      <th className="px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gemini-surface-border/35">
                    {paginatedTriangleResults.map((item) => (
                      <tr key={`${item.symbol}-${item.triangle_type}-${item.state}-${item.signal_timestamp}-${item.confidence_score}`} className="hover:bg-gemini-surface-hover/55">
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {formatTimestamp(item.signal_timestamp)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Link href={buildTriangleTickerHref(item.symbol)} className="font-semibold text-gemini-accent-blue hover:text-gemini-accent-cyan">
                            {item.symbol}
                          </Link>
                          <p className="mt-0.5 text-xs text-gemini-text-tertiary">{item.name}</p>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="gemini-badge text-gemini-accent-cyan">
                            {formatTriangleType(item.triangle_type)}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span
                            className={`gemini-badge ${
                              item.state === 'breakout' ? 'text-gemini-accent-green' : 'text-gemini-accent-cyan'
                            }`}
                          >
                            {item.state}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {formatBreakoutDirection(item.breakout_direction)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span
                            className={`gemini-badge ${
                              item.confidence_level === 'high'
                                ? 'text-gemini-accent-green'
                                : (item.confidence_level === 'medium'
                                    ? 'text-gemini-accent-orange'
                                    : 'text-gemini-text-secondary')
                            }`}
                          >
                            {item.confidence_level} ({item.confidence_score})
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {item.upper_touch_count} / {item.lower_touch_count} / {item.total_touch_count}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {item.breakout_close_count}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                          {item.volume_ratio !== null
                            ? item.volume_ratio.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                            : '-'}
                        </td>
                        <td className="px-5 py-3 text-gemini-text-secondary">
                          {item.action}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-gemini-text-tertiary">
            {activeFilteredCount === 0
              ? '0 signals shown'
              : `Showing ${visibleStart} to ${visibleEnd} of ${activeFilteredCount} signals`}
          </span>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="gemini-button px-4 py-2 text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="gemini-button px-4 py-2 text-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </ControlShell>
  );
}

function ScreenerLoading() {
  return (
    <ControlShell
      activeSection="screener"
      title="Signal Screener"
      subtitle="Loading screener signals..."
      actionLabel="Refresh Signals"
      actionHref="/screener"
    >
      <div className="animate-pulse space-y-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="hud-panel h-24"></div>
          <div className="hud-panel h-24"></div>
          <div className="hud-panel h-24"></div>
          <div className="hud-panel h-24"></div>
        </div>
        <div className="hud-panel h-24"></div>
        <div className="hud-panel h-80"></div>
      </div>
    </ControlShell>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={<ScreenerLoading />}>
      <ScreenerContent />
    </Suspense>
  );
}
