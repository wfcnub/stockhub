'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ControlShell } from '@/components/layout/ControlShell';
import { getDivergenceScreener } from '@/lib/api';
import type { DivergenceScreenerItem } from '@/types';
import type { DivergenceConfigParams } from '@/lib/api';

type SignalFilter = 'all' | 'regular' | 'hidden';
type StrategyFilter = 'all' | 'BULLISH_CONFIRMED' | 'BULLISH_AGGRESSIVE';
type GradeFilter = 'all' | 'oversold' | 'neutral';

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
  if (value === 'BULLISH_CONFIRMED' || value === 'BULLISH_AGGRESSIVE') {
    return value;
  }

  return 'all';
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

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const [results, setResults] = useState<DivergenceScreenerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('all');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);
  const [page, setPage] = useState(initialPage);

  const [pivotLeftWindow, setPivotLeftWindow] = useState(initialPivotLeft);
  const [confirmedRightMin, setConfirmedRightMin] = useState(initialConfirmedMin);
  const [confirmedRightMax, setConfirmedRightMax] = useState(initialConfirmedMax);
  const [aggressiveRightMin, setAggressiveRightMin] = useState(initialAggressiveMin);
  const [aggressiveRightMax, setAggressiveRightMax] = useState(initialAggressiveMax);

  const loadSignals = useCallback(async (refresh = false) => {
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
          action: actionHint,
        };
      });

      setResults(normalizedResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load divergence screener');
      setResults([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [pivotLeftWindow, confirmedRightMin, confirmedRightMax, aggressiveRightMin, aggressiveRightMax]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) params.set('page_size', String(itemsPerPage));
    if (page > 0) params.set('page', String(page + 1));
    if (pivotLeftWindow !== DEFAULT_PIVOT_LEFT_WINDOW) params.set('pivot_left', String(pivotLeftWindow));
    if (confirmedRightMin !== DEFAULT_CONFIRMED_RIGHT_MIN) params.set('conf_min', String(confirmedRightMin));
    if (confirmedRightMax !== DEFAULT_CONFIRMED_RIGHT_MAX) params.set('conf_max', String(confirmedRightMax));
    if (aggressiveRightMin !== DEFAULT_AGGRESSIVE_RIGHT_MIN) params.set('agg_min', String(aggressiveRightMin));
    if (aggressiveRightMax !== DEFAULT_AGGRESSIVE_RIGHT_MAX) params.set('agg_max', String(aggressiveRightMax));

    const currentQueryString = searchParams.toString();
    const queryString = params.toString();

    if (queryString === currentQueryString) {
      return;
    }

    router.replace(`/screener${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [itemsPerPage, page, pivotLeftWindow, confirmedRightMin, confirmedRightMax, aggressiveRightMin, aggressiveRightMax, router, searchParams]);

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
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
  }, [gradeFilter, results, signalFilter, strategyFilter]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const maxPage = Math.max(0, Math.ceil(filteredResults.length / itemsPerPage) - 1);
    setPage((currentPage) => (currentPage > maxPage ? maxPage : currentPage));
  }, [filteredResults.length, itemsPerPage, isLoading]);

  const paginatedResults = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredResults.slice(start, start + itemsPerPage);
  }, [filteredResults, itemsPerPage, page]);

  const handleItemsPerPageChange = (value: number) => {
    const nextItemsPerPage = ITEMS_PER_PAGE_OPTIONS.some((size) => size === value)
      ? value
      : DEFAULT_ITEMS_PER_PAGE;

    setItemsPerPage(nextItemsPerPage);
    setPage(0);
  };

  const handleResetDefaults = () => {
    setPivotLeftWindow(DEFAULT_PIVOT_LEFT_WINDOW);
    setConfirmedRightMin(DEFAULT_CONFIRMED_RIGHT_MIN);
    setConfirmedRightMax(DEFAULT_CONFIRMED_RIGHT_MAX);
    setAggressiveRightMin(DEFAULT_AGGRESSIVE_RIGHT_MIN);
    setAggressiveRightMax(DEFAULT_AGGRESSIVE_RIGHT_MAX);
  };

  const regularCount = results.filter((item) => item.type === 'regular').length;
  const hiddenCount = results.filter((item) => item.type === 'hidden').length;
  const aggressiveCount = results.filter((item) => item.strategy_type === 'BULLISH_AGGRESSIVE').length;
  const oversoldCount = results.filter((item) => normalizeGrade(item.grade) === 'oversold').length;
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const visibleStart = filteredResults.length === 0 ? 0 : (page * itemsPerPage) + 1;
  const visibleEnd = Math.min((page + 1) * itemsPerPage, filteredResults.length);

  return (
    <ControlShell
      activeSection="screener"
      title="Divergence Discovery"
      subtitle="Fresh bullish divergence signals (confirmed + aggressive) ranked by newest signal date."
      actionLabel="Refresh Signals"
      actionHref="/screener"
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="hud-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Regular Bullish</p>
            <p className="mt-2 text-2xl font-semibold text-gemini-accent-green">{regularCount}</p>
          </div>
          <div className="hud-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Hidden Bullish</p>
            <p className="mt-2 text-2xl font-semibold text-gemini-accent-cyan">{hiddenCount}</p>
          </div>
          <div className="hud-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Aggressive</p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: '#FFBF00' }}>{aggressiveCount}</p>
          </div>
          <div className="hud-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Oversold Grade</p>
            <p className="mt-2 text-2xl font-semibold text-gemini-accent-orange">{oversoldCount}</p>
          </div>
        </div>

        <section className="hud-panel p-5">
          <div className="mb-4">
            <h3 className="text-sm uppercase tracking-[0.14em] text-gemini-text-tertiary mb-2">Detection Parameters</h3>
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
              onClick={handleResetDefaults}
              className="gemini-button px-4 py-2 text-sm"
            >
              Reset Defaults
            </button>

            <button
              onClick={() => loadSignals(true)}
              className="gemini-button-primary px-4 py-2 text-sm"
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </section>

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

        {error && (
          <div className="rounded-gemini border border-gemini-accent-red/35 bg-gemini-accent-red/10 p-4 text-gemini-accent-red">
            {error}
          </div>
        )}

        <section className="hud-panel overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gemini-text-secondary">Loading divergence signals...</div>
          ) : filteredResults.length === 0 ? (
            <div className="p-10 text-center text-gemini-text-secondary">
              No recently confirmed divergence signals match this filter.
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
                  {paginatedResults.map((item) => (
                    <tr key={`${item.symbol}-${item.strategy_type}-${item.type}-${item.p1.timestamp}-${item.p2.timestamp}-${item.signal_timestamp}`} className="hover:bg-gemini-surface-hover/55">
                      <td className="px-5 py-3 whitespace-nowrap text-gemini-text-secondary">
                        {formatTimestamp(item.signal_timestamp)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <Link href={`/tickers/${item.symbol}`} className="font-semibold text-gemini-accent-blue hover:text-gemini-accent-cyan">
                          {item.symbol}
                        </Link>
                        <p className="mt-0.5 text-xs text-gemini-text-tertiary">{item.name}</p>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className="gemini-badge"
                          style={{
                            color: item.strategy_type === 'BULLISH_AGGRESSIVE' ? '#FFBF00' : undefined,
                          }}
                        >
                          {item.strategy_type === 'BULLISH_AGGRESSIVE' ? 'Aggressive' : 'Confirmed'}
                        </span>
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
          )}
        </section>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-gemini-text-tertiary">
            {filteredResults.length === 0
              ? '0 signals shown'
              : `Showing ${visibleStart} to ${visibleEnd} of ${filteredResults.length} signals`}
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
      title="Divergence Discovery"
      subtitle="Loading bullish divergence signals..."
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