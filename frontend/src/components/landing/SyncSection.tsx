'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Index, SyncProgress } from '@/types';
import { getIndexes, startSync, getSyncProgress, stopSync } from '@/lib/api';

const ACTIVE_SYNC_STORAGE_KEY = 'stockhub.active-sync-id';

const isTerminalStatus = (status: SyncProgress['status']) => {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
};

const isNotFoundError = (error: unknown) => {
  return error instanceof Error && error.message.includes('404');
};

export function SyncSection() {
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);

  useEffect(() => {
    const fetchIndexes = async () => {
      try {
        const data = await getIndexes(true);
        setIndexes(data);

        const firstActiveIndex = data.find((idx) => idx.is_active);
        if (firstActiveIndex) {
          setSelectedIndex(firstActiveIndex.code);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load indexes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchIndexes();
  }, []);

  // Poll for sync progress when syncing
  const pollProgress = useCallback(async (currentSyncId: string) => {
    try {
      const progress = await getSyncProgress(currentSyncId);
      setSyncProgress(progress);

      if (isTerminalStatus(progress.status)) {
        setIsSyncing(false);
        setSyncId(null);
        localStorage.removeItem(ACTIVE_SYNC_STORAGE_KEY);

        if (progress.status === 'failed') {
          setError('Sync failed. Please try again.');
        } else {
          setError(null);
        }

        return false;
      }

      setIsSyncing(true);
      return true;
    } catch (err) {
      console.error('Error polling progress:', err);

      // Clean up stale sync id if backend no longer knows this job.
      if (isNotFoundError(err)) {
        setIsSyncing(false);
        setSyncId(null);
        localStorage.removeItem(ACTIVE_SYNC_STORAGE_KEY);
        return false;
      }

      return true;
    }
  }, []);

  const restoreActiveSyncFromServer = useCallback(async () => {
    try {
      const activeProgress = await getSyncProgress();

      if (isTerminalStatus(activeProgress.status)) {
        return false;
      }

      setSyncId(activeProgress.sync_id);
      setSyncProgress(activeProgress);
      setIsSyncing(true);
      setError(null);
      localStorage.setItem(ACTIVE_SYNC_STORAGE_KEY, activeProgress.sync_id);
      return true;
    } catch (err) {
      if (!isNotFoundError(err)) {
        console.error('Error restoring active sync:', err);
      }

      return false;
    }
  }, []);

  useEffect(() => {
    const restoreSyncState = async () => {
      const activeSyncId = localStorage.getItem(ACTIVE_SYNC_STORAGE_KEY);

      if (activeSyncId) {
        setSyncId(activeSyncId);
        const restored = await pollProgress(activeSyncId);
        if (restored) {
          return;
        }
      }

      await restoreActiveSyncFromServer();
    };

    restoreSyncState();
  }, [pollProgress, restoreActiveSyncFromServer]);

  useEffect(() => {
    if (!isSyncing || !syncId) return;

    const interval = setInterval(() => {
      pollProgress(syncId);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSyncing, syncId, pollProgress]);

  const handleStartSync = async () => {
    if (!selectedIndex) return;

    setIsSyncing(true);
    setError(null);
    setSyncProgress(null);

    try {
      const response = await startSync(selectedIndex);
      setSyncId(response.sync_id);
      localStorage.setItem(ACTIVE_SYNC_STORAGE_KEY, response.sync_id);

      // Immediately fetch progress after starting
      const progress = await getSyncProgress(response.sync_id);
      setSyncProgress(progress);

      if (isTerminalStatus(progress.status)) {
        setIsSyncing(false);
        setSyncId(null);
        localStorage.removeItem(ACTIVE_SYNC_STORAGE_KEY);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
      setIsSyncing(false);
      setSyncId(null);
      localStorage.removeItem(ACTIVE_SYNC_STORAGE_KEY);
    }
  };

  const handleStopSync = async () => {
    if (!syncId) return;

    setIsStopping(true);
    setError(null);

    try {
      const response = await stopSync(syncId);
      setIsSyncing(false);
      setSyncId(null);
      localStorage.removeItem(ACTIVE_SYNC_STORAGE_KEY);

      try {
        const progress = await getSyncProgress(response.sync_id);
        setSyncProgress(progress);
      } catch {
        setSyncProgress((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'cancelled',
            progress: {
              ...prev.progress,
              current_ticker: null,
              estimated_remaining_seconds: 0,
            },
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop sync');
    } finally {
      setIsStopping(false);
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="hud-panel p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/3 rounded bg-gemini-surface-border/70"></div>
          <div className="h-12 rounded bg-gemini-surface-border/60"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="hud-panel p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gemini-accent-orange/15 p-2">
            <svg
              className={`w-5 h-5 text-gemini-accent-orange ${isSyncing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gemini-text-primary">Data Sync</h2>
            <p className="text-xs text-gemini-text-tertiary">Update market data for a selected index</p>
          </div>
        </div>

        <span className="hud-pill">Status</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-gemini border border-gemini-accent-red/30 bg-gemini-accent-red/10 p-4">
          <svg className="w-5 h-5 text-gemini-accent-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gemini-accent-red text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="index-select" className="mb-2 block text-sm font-medium text-gemini-text-secondary">
            Select Index
          </label>
          <select
            id="index-select"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
            disabled={isSyncing}
            className="gemini-select disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select an index</option>
            {indexes.map((idx) => (
              <option key={idx.code} value={idx.code}>
                {idx.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={isSyncing ? handleStopSync : handleStartSync}
          disabled={isSyncing ? isStopping || !syncId : !selectedIndex}
          className={`flex w-full items-center justify-center gap-2 ${
            isSyncing
              ? 'gemini-button border-gemini-accent-red/70 bg-transparent text-gemini-accent-red hover:bg-gemini-accent-red/10'
              : 'gemini-button-primary'
          }`}
        >
          {isSyncing ? (
            isStopping ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Stopping...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h12v12H6z" />
                </svg>
                <span>Stop Sync</span>
              </>
            )
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Start Sync</span>
            </>
          )}
        </button>

        {isSyncing && syncProgress && (
          <div className="space-y-4 border-t border-gemini-surface-border/75 pt-4">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gemini-text-secondary">Progress</span>
                <span className="font-medium text-gemini-accent-blue">
                  {syncProgress.progress.percent_complete.toFixed(1)}%
                </span>
              </div>
              <div className="hud-progress-track overflow-hidden">
                <div
                  className="hud-progress-bar transition-all duration-300"
                  style={{ width: `${syncProgress.progress.percent_complete}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="hud-subpanel p-3">
                <p className="gemini-stat-label">Processing</p>
                <p className="text-base font-semibold text-gemini-text-primary">
                  {syncProgress.progress.current_ticker || 'Starting...'}
                </p>
              </div>
              <div className="hud-subpanel p-3">
                <p className="gemini-stat-label">Tickers</p>
                <p className="text-base font-semibold text-gemini-text-primary">
                  <span className="text-gemini-accent-blue">{syncProgress.progress.processed_tickers}</span>
                  <span className="text-gemini-text-tertiary"> / </span>
                  <span>{syncProgress.progress.total_tickers}</span>
                </p>
              </div>
              <div className="hud-subpanel p-3">
                <p className="gemini-stat-label">Status</p>
                <p className="text-base font-semibold capitalize text-gemini-text-primary">
                  {syncProgress.status.replace('_', ' ')}
                </p>
              </div>
              <div className="hud-subpanel p-3">
                <p className="gemini-stat-label">Est. Remaining</p>
                <p className="text-base font-semibold text-gemini-text-primary">
                  {formatTime(syncProgress.progress.estimated_remaining_seconds)}
                </p>
              </div>
            </div>
          </div>
        )}

        {syncProgress?.status === 'completed' && (
          <div className="flex items-center gap-2 rounded-gemini border border-gemini-accent-green/30 bg-gemini-accent-green/10 p-4">
            <svg className="w-5 h-5 text-gemini-accent-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-gemini-accent-green">Sync completed successfully</p>
              <p className="text-sm text-gemini-text-secondary">
                Processed {syncProgress.progress.total_tickers} tickers.
              </p>
            </div>
          </div>
        )}

        {syncProgress?.status === 'cancelled' && (
          <div className="flex items-center gap-2 rounded-gemini border border-gemini-accent-orange/30 bg-gemini-accent-orange/10 p-4">
            <svg className="w-5 h-5 text-gemini-accent-orange flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h12v12H6z" />
            </svg>
            <div>
              <p className="font-medium text-gemini-accent-orange">Sync stopped</p>
              <p className="text-sm text-gemini-text-secondary">
                Processed {syncProgress.progress.processed_tickers} / {syncProgress.progress.total_tickers} tickers.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}