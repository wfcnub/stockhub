'use client';

import { useEffect, useState } from 'react';
import type { Stats } from '@/types';
import { getStats } from '@/lib/api';

export function HeroSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getStats();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (isLoading) {
    return (
      <div className="hud-panel p-6 md:p-8 animate-pulse">
        <div className="h-7 w-1/3 rounded bg-gemini-surface-border/70 mb-3"></div>
        <div className="h-4 w-2/3 rounded bg-gemini-surface-border/60 mb-6"></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-gemini bg-gemini-surface-border/55"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="hud-panel p-6 md:p-7">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-gemini-text-tertiary">StockHub Data</p>
          <h1 className="mt-1 text-2xl font-semibold text-gemini-text-primary md:text-3xl">Data Sync Overview</h1>
          <p className="mt-2 text-sm text-gemini-text-secondary">
            Track core market metrics and recent sync status for your indexed symbols.
          </p>

          {error ? (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-1 text-xs font-medium text-gemini-accent-red">
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate" title={error}>Failed to refresh stats</span>
            </div>
          ) : null}
        </div>
        <span
          className={error
            ? 'inline-flex items-center rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-1.5 text-xs font-medium text-gemini-accent-red'
            : 'hud-pill'}
          title={error || undefined}
        >
          Last sync: {error ? 'Failed' : (stats?.last_global_sync ? formatDate(stats.last_global_sync) : '—')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="hud-subpanel p-4">
          <p className="text-sm text-gemini-text-secondary">Indexes</p>
          {error ? (
            <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-2.5 py-1 text-xs font-semibold text-gemini-accent-red" title={error}>
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">Failed to load</span>
            </div>
          ) : (
            <p className="mt-2 text-3xl font-semibold text-gemini-text-primary">{stats?.total_indexes ?? '—'}</p>
          )}
        </div>
        
        <div className="hud-subpanel p-4">
          <p className="text-sm text-gemini-text-secondary">Tickers</p>
          {error ? (
            <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-2.5 py-1 text-xs font-semibold text-gemini-accent-red" title={error}>
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">Failed to load</span>
            </div>
          ) : (
            <p className="mt-2 text-3xl font-semibold text-gemini-text-primary">{stats?.total_tickers?.toLocaleString() ?? '—'}</p>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-5 border-t border-gemini-surface-border pt-5">
          <p className="mb-3 text-sm text-gemini-text-secondary">Tracked indexes</p>
          <div className="inline-flex max-w-full items-center gap-2 rounded-gemini border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-2 text-sm text-gemini-accent-red">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate" title={error}>Unable to load index details</span>
          </div>
        </div>
      ) : stats?.indexes && stats.indexes.length > 0 ? (
        <div className="mt-5 border-t border-gemini-surface-border pt-5">
          <p className="mb-3 text-sm text-gemini-text-secondary">Tracked indexes</p>
          <div className="flex flex-wrap gap-2">
            {stats.indexes.map((index) => (
              <span
                key={index.code}
                className="inline-flex items-center gap-2 rounded-full border border-gemini-surface-border bg-gemini-bg-tertiary px-3 py-1.5 text-sm"
              >
                <span className="text-gemini-text-primary">{index.name}</span>
                <span className="text-gemini-accent-blue">{index.ticker_count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}