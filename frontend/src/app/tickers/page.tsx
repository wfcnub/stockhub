'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { TickerListItem, Index } from '@/types';
import { getIndexes, getTickers } from '@/lib/api';
import { ControlShell } from '@/components/layout/ControlShell';

const DEFAULT_ITEMS_PER_PAGE = 10;
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50] as const;

type SortField = 'symbol' | 'name';
type SortOrder = 'asc' | 'desc';

function TickersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialSearch = searchParams.get('search') || '';
  const initialIndex = searchParams.get('index') || '';
  const initialPageSizeValue = Number(searchParams.get('page_size'));
  const initialItemsPerPage = ITEMS_PER_PAGE_OPTIONS.includes(initialPageSizeValue as 10 | 20 | 50)
    ? initialPageSizeValue
    : DEFAULT_ITEMS_PER_PAGE;
  const initialSortBy: SortField = searchParams.get('sort_by') === 'name' ? 'name' : 'symbol';
  const initialSortOrder: SortOrder = searchParams.get('sort_order') === 'desc' ? 'desc' : 'asc';
  
  const [tickers, setTickers] = useState<TickerListItem[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);
  const [sortBy, setSortBy] = useState<SortField>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
  const [page, setPage] = useState(0);

  const fetchTickers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getTickers({
        offset: page * itemsPerPage,
        limit: itemsPerPage,
        search: searchQuery || undefined,
        index: selectedIndex || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      
      setTickers(response.data);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickers');
    } finally {
      setIsLoading(false);
    }
  }, [page, itemsPerPage, searchQuery, selectedIndex, sortBy, sortOrder]);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  useEffect(() => {
    const fetchIndexes = async () => {
      try {
        const data = await getIndexes(true);
        setIndexes(data);
      } catch {
        // Keep the index filter available with the default option even if index loading fails.
        setIndexes([]);
      }
    };

    void fetchIndexes();
  }, []);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (selectedIndex) params.set('index', selectedIndex);
    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) params.set('page_size', String(itemsPerPage));
    if (sortBy !== 'symbol') params.set('sort_by', sortBy);
    if (sortOrder !== 'asc') params.set('sort_order', sortOrder);
    const queryString = params.toString();
    router.push(`/tickers${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [searchQuery, selectedIndex, itemsPerPage, sortBy, sortOrder, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(0);
  };

  const handleIndexChange = (index: string) => {
    setSelectedIndex(index);
    setPage(0);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setPage(0);
  };

  const handleSort = (field: SortField) => {
    setPage(0);
    if (sortBy === field) {
      setSortOrder((currentOrder) => (currentOrder === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(field);
    setSortOrder('asc');
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  return (
    <ControlShell
      activeSection="tickers"
      title="Ticker List"
      subtitle="Browse and search market symbols with fast filters and paginated results."
      actionLabel="Back to Dashboard"
      actionHref="/"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gemini-text-secondary">
            {isLoading ? 'Loading symbols...' : `${total.toLocaleString()} symbols indexed`}
          </p>
        </div>

        <div className="hud-panel p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by symbol or name..."
                  className="gemini-input pr-24"
                />
                <button
                  type="submit"
                  className="gemini-button-primary absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 text-sm"
                >
                  Search
                </button>
              </div>
            </form>

            <div className="w-full md:w-48">
              <select
                value={selectedIndex}
                onChange={(e) => handleIndexChange(e.target.value)}
                className="gemini-select"
              >
                <option value="">All Indexes</option>
                {indexes.map((index) => (
                  <option key={index.id} value={index.code}>
                    {index.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-36">
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="gemini-select"
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
        </div>

        {error && (
          <div className="rounded-gemini border border-gemini-accent-red/30 bg-gemini-accent-red/10 p-4">
            <p className="text-gemini-accent-red">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gemini-accent-blue"></div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="hud-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="gemini-table min-w-full">
                  <thead className="bg-gemini-bg-secondary/85">
                    <tr>
                      <th className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleSort('symbol')}
                          className="inline-flex items-center gap-1"
                        >
                          Symbol
                          {sortBy === 'symbol' && (
                            <span className="text-xs text-gemini-text-secondary">
                              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                            </span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className="inline-flex items-center gap-1"
                        >
                          Name
                          {sortBy === 'name' && (
                            <span className="text-xs text-gemini-text-secondary">
                              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                            </span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4">Sector</th>
                      <th className="px-6 py-4">Industry</th>
                      <th className="px-6 py-4">Index</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gemini-surface-border/35">
                    {tickers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-gemini-text-tertiary">
                          No tickers found
                        </td>
                      </tr>
                    ) : (
                      tickers.map((ticker) => (
                        <tr
                          key={ticker.symbol}
                          className="cursor-pointer hover:bg-gemini-surface-hover/55"
                          onClick={() => router.push(`/tickers/${ticker.symbol}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-semibold text-gemini-accent-blue">{ticker.symbol}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gemini-text-primary">{ticker.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gemini-text-secondary">{ticker.sector || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gemini-text-secondary">{ticker.industry || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="gemini-badge">{ticker.index}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
                <p className="text-sm text-gemini-text-secondary">
                  Showing {page * itemsPerPage + 1} to {Math.min((page + 1) * itemsPerPage, total)} of {total} results
                </p>
                <div className="flex gap-2">
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
              </div>
            )}
          </>
        )}
      </div>
    </ControlShell>
  );
}

function TickersLoading() {
  return (
    <ControlShell
      activeSection="tickers"
      title="Ticker Reports"
      subtitle="Loading indexed market symbols..."
      actionLabel="Back to Dashboard"
      actionHref="/"
    >
      <div className="animate-pulse space-y-5">
        <div className="h-7 w-1/4 rounded bg-gemini-surface-border/60"></div>
        <div className="hud-panel p-4">
          <div className="h-12 rounded bg-gemini-bg-secondary/80"></div>
        </div>
        <div className="hud-panel">
          <div className="h-96 rounded-gemini bg-gemini-bg-secondary/70"></div>
        </div>
      </div>
    </ControlShell>
  );
}

export default function TickersPage() {
  return (
    <Suspense fallback={<TickersLoading />}>
      <TickersContent />
    </Suspense>
  );
}