'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { TickerListItem, Index } from '@/types';
import { getIndexes, getTickers } from '@/lib/api';
import { ControlShell } from '@/components/layout/ControlShell';

const ITEMS_PER_PAGE = 50;

function TickersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialSearch = searchParams.get('search') || '';
  const initialIndex = searchParams.get('index') || '';
  
  const [tickers, setTickers] = useState<TickerListItem[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [page, setPage] = useState(0);

  const fetchTickers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getTickers({
        skip: page * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
        search: searchQuery || undefined,
        index: selectedIndex || undefined,
      });
      
      setTickers(response.data);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickers');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, selectedIndex]);

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
    router.push(`/tickers?${params.toString()}`, { scroll: false });
  }, [searchQuery, selectedIndex, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(0);
  };

  const handleIndexChange = (index: string) => {
    setSelectedIndex(index);
    setPage(0);
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <ControlShell
      activeSection="tickers"
      title="Ticker Reports"
      subtitle="Browse and search market symbols with fast filters and paginated results."
      actionLabel="Back to Dashboard"
      actionHref="/"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="hud-pill">Universe query</span>
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
                      <th className="px-6 py-4">Symbol</th>
                      <th className="px-6 py-4">Name</th>
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
                  Showing {page * ITEMS_PER_PAGE + 1} to {Math.min((page + 1) * ITEMS_PER_PAGE, total)} of {total} results
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