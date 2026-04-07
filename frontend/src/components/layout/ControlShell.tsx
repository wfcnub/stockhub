'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addIndex, deleteIndex, getIndexes, updateIndex } from '@/lib/api';
import type { Index } from '@/types';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

type SectionKey = 'dashboard' | 'tickers' | 'screener' | 'analysis';

interface ControlShellProps {
  activeSection: SectionKey;
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionHref?: string;
  children: ReactNode;
}

const navItems: Array<{
  key: SectionKey;
  label: string;
  href: string;
  icon: ReactNode;
}> = [
  {
    key: 'dashboard',
    label: 'Main Dashboard',
    href: '/',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h7v6H4V5zm9 0h7v10h-7V5zM4 13h7v6H4v-6zm9 4h7v2h-7v-2z" />
      </svg>
    ),
  },
  {
    key: 'tickers',
    label: 'Tickers',
    href: '/tickers',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V8m5 11V5m5 14v-7m5 7V10" />
      </svg>
    ),
  },
  {
    key: 'screener',
    label: 'Screener',
    href: '/screener',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18M6 4v16m6-13v10m6-6v6" />
      </svg>
    ),
  },
];

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.3 3.8a2 2 0 0 1 3.4 0l.3.5a2 2 0 0 0 1.6 1l.6.1a2 2 0 0 1 1.7 2l.1.6a2 2 0 0 0 1 1.6l.5.3a2 2 0 0 1 0 3.4l-.5.3a2 2 0 0 0-1 1.6l-.1.6a2 2 0 0 1-1.7 2l-.6.1a2 2 0 0 0-1.6 1l-.3.5a2 2 0 0 1-3.4 0l-.3-.5a2 2 0 0 0-1.6-1l-.6-.1a2 2 0 0 1-1.7-2l-.1-.6a2 2 0 0 0-1-1.6l-.5-.3a2 2 0 0 1 0-3.4l.5-.3a2 2 0 0 0 1-1.6l.1-.6a2 2 0 0 1 1.7-2l.6-.1a2 2 0 0 0 1.6-1l.3-.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
    </svg>
  );
}

export function ControlShell({
  activeSection,
  title,
  subtitle,
  actionLabel,
  actionHref,
  children,
}: ControlShellProps) {
  const mainNav = navItems.slice(0, 1);
  const featuresNav = navItems.slice(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [isIndexesLoading, setIsIndexesLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [suffixInput, setSuffixInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<Index | null>(null);
  const [editCodeInput, setEditCodeInput] = useState('');
  const [editNameInput, setEditNameInput] = useState('');
  const [editSuffixInput, setEditSuffixInput] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Index | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadIndexes = useCallback(async () => {
    setIsIndexesLoading(true);
    setSettingsError(null);

    try {
      const data = await getIndexes();
      setIndexes(data);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to load indexes');
    } finally {
      setIsIndexesLoading(false);
    }
  }, []);

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
    setPendingDelete(null);
    setEditingIndex(null);
    setSettingsError(null);
    setSettingsSuccess(null);
  }, []);

  const closeSettings = useCallback(() => {
    if (isAdding || isDeleting || isUpdating) {
      return;
    }

    setPendingDelete(null);
    setEditingIndex(null);
    setIsSettingsOpen(false);
  }, [isAdding, isDeleting, isUpdating]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void loadIndexes();
  }, [isSettingsOpen, loadIndexes]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (pendingDelete) {
        setPendingDelete(null);
        return;
      }

      if (editingIndex) {
        setEditingIndex(null);
        return;
      }

      closeSettings();
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeSettings, editingIndex, isSettingsOpen, pendingDelete]);

  const handleAddIndex = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCode = codeInput.trim().toUpperCase();
    const normalizedName = nameInput.trim();
    const normalizedSuffix = suffixInput.trim().toUpperCase();

    if (!normalizedCode || !normalizedName) {
      setSettingsError('Index code and name are required.');
      return;
    }

    if (!/^[A-Z0-9._-]+$/.test(normalizedCode)) {
      setSettingsError('Index code can only contain letters, numbers, dot, underscore, and dash.');
      return;
    }

    if (normalizedSuffix && !/^[A-Z0-9._-]+$/.test(normalizedSuffix)) {
      setSettingsError('Suffix can only contain letters, numbers, dot, underscore, and dash.');
      return;
    }

    if (indexes.some((idx) => idx.code.toUpperCase() === normalizedCode)) {
      setSettingsError(`Index ${normalizedCode} already exists.`);
      return;
    }

    setIsAdding(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const createdIndex = await addIndex({
        code: normalizedCode,
        name: normalizedName,
        yfinance_suffix: normalizedSuffix,
      });
      await loadIndexes();
      setCodeInput('');
      setNameInput('');
      setSuffixInput('');
      setSettingsSuccess(`Index ${createdIndex.code} added.`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to add index');
    } finally {
      setIsAdding(false);
    }
  };

  const openEditIndex = (index: Index) => {
    setPendingDelete(null);
    setEditingIndex(index);
    setEditCodeInput(index.code);
    setEditNameInput(index.name);
    setEditSuffixInput((index.yfinance_suffix || '').toUpperCase());
    setEditIsActive(index.is_active);
    setSettingsError(null);
    setSettingsSuccess(null);
  };

  const handleUpdateIndex = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingIndex) {
      return;
    }

    const normalizedCode = editCodeInput.trim().toUpperCase();
    const normalizedName = editNameInput.trim();
    const normalizedSuffix = editSuffixInput.trim().toUpperCase();

    if (!normalizedCode || !normalizedName) {
      setSettingsError('Index code and name are required.');
      return;
    }

    if (!/^[A-Z0-9._-]+$/.test(normalizedCode)) {
      setSettingsError('Index code can only contain letters, numbers, dot, underscore, and dash.');
      return;
    }

    if (normalizedSuffix && !/^[A-Z0-9._-]+$/.test(normalizedSuffix)) {
      setSettingsError('Suffix can only contain letters, numbers, dot, underscore, and dash.');
      return;
    }

    if (
      indexes.some(
        (idx) => idx.id !== editingIndex.id && idx.code.toUpperCase() === normalizedCode
      )
    ) {
      setSettingsError(`Index ${normalizedCode} already exists.`);
      return;
    }

    setIsUpdating(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const updatedIndex = await updateIndex(editingIndex.id, {
        code: normalizedCode,
        name: normalizedName,
        yfinance_suffix: normalizedSuffix,
        is_active: editIsActive,
      });

      await loadIndexes();
      setEditingIndex(null);
      setSettingsSuccess(`Index ${updatedIndex.code} updated.`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update index');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    setIsDeleting(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const deleteResult = await deleteIndex(pendingDelete.id, true);
      await loadIndexes();
      setSettingsSuccess(deleteResult.message || `Index ${pendingDelete.code} deleted.`);
      setPendingDelete(null);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to delete index');
    } finally {
      setIsDeleting(false);
    }
  };

  const sortedIndexes = useMemo(() => {
    return [...indexes].sort((left, right) => {
      if (left.is_active !== right.is_active) {
        return left.is_active ? -1 : 1;
      }

      return left.code.localeCompare(right.code);
    });
  }, [indexes]);

  return (
    <main className="hud-stage">
      <div className="mx-auto max-w-[1460px] animate-raise">
        <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="hud-panel hidden xl:flex xl:min-h-[calc(100vh-3.5rem)] xl:flex-col">
            <div className="border-b border-gemini-surface-border px-4 py-5">
              <div className="flex items-center gap-2 text-gemini-accent-orange">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4h16v16H4V4Zm3 3v3h3V7H7Zm0 7h10" />
                </svg>
                <span className="text-sm font-semibold tracking-wide">StockHub Analytics</span>
              </div>
            </div>

            <nav className="px-3 py-4">
              <p className="mb-2 px-3 text-[11px] uppercase tracking-[0.14em] text-gemini-text-muted">Home</p>
              <div className="space-y-1">
                {mainNav.map((item) => {
                  const isActive = item.key === activeSection;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`hud-side-link ${isActive ? 'hud-side-link-active' : ''}`}
                    >
                      <span className="text-gemini-accent-blue">{item.icon}</span>
                      <span className="flex-1 text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <p className="mb-2 mt-5 px-3 text-[11px] uppercase tracking-[0.14em] text-gemini-text-muted">Features</p>
              <div className="space-y-1">
                {featuresNav.map((item) => {
                  const isActive = item.key === activeSection;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`hud-side-link ${isActive ? 'hud-side-link-active' : ''}`}
                    >
                      <span className="text-gemini-accent-blue">{item.icon}</span>
                      <span className="flex-1 text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="mt-auto border-t border-gemini-surface-border p-3">
              <button
                type="button"
                onClick={openSettings}
                className="hud-side-link w-full"
              >
                <span className="text-gemini-text-tertiary">
                  <SettingsIcon />
                </span>
                <span className="text-sm text-left">Settings</span>
              </button>
            </div>
          </aside>

          <section className="hud-panel overflow-hidden">
            <header className="border-b border-gemini-surface-border px-4 py-4 md:px-6">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">
                {navItems.map((item) => {
                  const isActive = item.key === activeSection;
                  return (
                    <Link
                      key={`mobile-${item.key}`}
                      href={item.href}
                      className={`hud-side-link whitespace-nowrap ${isActive ? 'hud-side-link-active' : ''}`}
                    >
                      <span className="text-gemini-accent-blue">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="mt-1 text-2xl font-semibold text-gemini-text-primary md:text-3xl">{title}</h2>
                  <p className="mt-1 text-sm text-gemini-text-secondary">{subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {actionLabel && actionHref ? (
                    <Link
                      href={actionHref}
                      className="gemini-button rounded-full px-3 py-2 text-xs font-semibold"
                    >
                      {actionLabel}
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={openSettings}
                    className="gemini-button rounded-full px-3 py-2 text-xs font-semibold xl:hidden"
                  >
                    Settings
                  </button>

                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div className="space-y-5 p-4 md:p-6">{children}</div>
          </section>
        </div>
      </div>

      {isSettingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pendingDelete && !editingIndex) {
              closeSettings();
            }
          }}
        >
          <div
            className="hud-panel relative flex h-[92vh] w-full max-w-[1400px] flex-col overflow-hidden"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gemini-surface-border px-4 py-4 md:px-6">
              <div>
                <h3 id="settings-title" className="text-xl font-semibold text-gemini-text-primary">
                  Settings
                </h3>
                <p className="mt-1 text-sm text-gemini-text-secondary">
                  System settings, configurations, and preferences.
                </p>
              </div>

              <button
                type="button"
                onClick={closeSettings}
                className="gemini-button inline-flex h-9 w-9 items-center justify-center rounded-full p-0"
                aria-label="Close settings"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6 lg:p-7">
              {settingsError ? (
                <div className="rounded-gemini border border-gemini-accent-red/35 bg-gemini-accent-red/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gemini-accent-red">{settingsError}</p>
                    <button
                      type="button"
                      onClick={() => setSettingsError(null)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gemini-accent-red/80 transition-colors hover:bg-gemini-accent-red/20 hover:text-gemini-accent-red"
                      aria-label="Dismiss error"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : null}

              {settingsSuccess ? (
                <div className="rounded-gemini border border-gemini-accent-green/35 bg-gemini-accent-green/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gemini-accent-green">{settingsSuccess}</p>
                    <button
                      type="button"
                      onClick={() => setSettingsSuccess(null)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gemini-accent-green/80 transition-colors hover:bg-gemini-accent-green/20 hover:text-gemini-accent-green"
                      aria-label="Dismiss success message"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="space-y-3">
                <h4 className="text-base font-semibold text-gemini-text-primary">Manage Indexes</h4>
                <p className="text-sm text-gemini-text-secondary">
                  Add, update, and remove index definitions.
                </p>

                <form onSubmit={handleAddIndex} className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_140px_auto]">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                    placeholder="Code"
                    maxLength={12}
                    className="gemini-input"
                    disabled={isAdding || isDeleting || isUpdating}
                  />
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="Index name"
                    className="gemini-input"
                    disabled={isAdding || isDeleting || isUpdating}
                  />
                  <input
                    type="text"
                    value={suffixInput}
                    onChange={(event) => setSuffixInput(event.target.value.toUpperCase())}
                    placeholder="Suffix (.JK)"
                    maxLength={12}
                    className="gemini-input"
                    disabled={isAdding || isDeleting || isUpdating}
                  />
                  <button
                    type="submit"
                    className="gemini-button-primary whitespace-nowrap px-4 py-3 text-sm"
                    disabled={isAdding || isDeleting || isUpdating}
                  >
                    {isAdding ? 'Adding...' : 'Add Index'}
                  </button>
                </form>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-gemini-text-primary">Current Indexes</h4>
                    <p className="mt-1 text-xs text-gemini-text-tertiary">Use Edit Index on any row to update code, name, suffix, or status.</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadIndexes}
                    className="gemini-button px-3 py-1.5 text-xs"
                    disabled={isIndexesLoading || isAdding || isDeleting || isUpdating}
                  >
                    Refresh
                  </button>
                </div>

                {isIndexesLoading ? (
                  <div className="space-y-2">
                    <div className="h-14 rounded-gemini bg-gemini-bg-secondary/70 animate-pulse" />
                    <div className="h-14 rounded-gemini bg-gemini-bg-secondary/70 animate-pulse" />
                  </div>
                ) : sortedIndexes.length === 0 ? (
                  <div className="rounded-gemini border border-gemini-surface-border bg-gemini-bg-secondary/45 p-3 text-sm text-gemini-text-secondary">
                    No indexes available.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedIndexes.map((idx) => (
                      <div
                        key={idx.id}
                        className="hud-subpanel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gemini-text-primary">{idx.code}</span>
                            <span className="rounded-full border border-gemini-surface-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-gemini-text-tertiary">
                              {idx.is_active ? 'active' : 'inactive'}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-gemini-text-secondary">{idx.name}</p>
                          <p className="mt-1 text-xs text-gemini-text-tertiary">
                            Suffix: {idx.yfinance_suffix || '-'}
                          </p>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditIndex(idx)}
                            className="gemini-button-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                            aria-label={`Edit index ${idx.code}`}
                            disabled={isDeleting || isAdding || isUpdating}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.9 3.1a2.8 2.8 0 1 1 4 4L9 19l-5 1 1-5L16.9 3.1Z" />
                            </svg>
                            Edit Index
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(idx)}
                            className="gemini-button border-gemini-accent-red/35 px-3 py-1.5 text-xs text-gemini-accent-red"
                            disabled={isDeleting || isAdding || isUpdating}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {editingIndex ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                <div className="hud-panel w-full max-w-lg p-5">
                  <h4 className="text-lg font-semibold text-gemini-text-primary">Update index</h4>
                  <p className="mt-2 text-sm text-gemini-text-secondary">
                    Edit code, name, suffix, and active status for {editingIndex.code}.
                  </p>

                  <form onSubmit={handleUpdateIndex} className="mt-5 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editCodeInput}
                        onChange={(event) => setEditCodeInput(event.target.value.toUpperCase())}
                        placeholder="Code"
                        maxLength={12}
                        className="gemini-input"
                        disabled={isUpdating}
                      />
                      <input
                        type="text"
                        value={editSuffixInput}
                        onChange={(event) => setEditSuffixInput(event.target.value.toUpperCase())}
                        placeholder="Suffix (.JK)"
                        maxLength={12}
                        className="gemini-input"
                        disabled={isUpdating}
                      />
                    </div>

                    <input
                      type="text"
                      value={editNameInput}
                      onChange={(event) => setEditNameInput(event.target.value)}
                      placeholder="Index name"
                      className="gemini-input"
                      disabled={isUpdating}
                    />

                    <label className="flex items-center gap-2 rounded-gemini border border-gemini-surface-border px-3 py-2 text-sm text-gemini-text-secondary">
                      <input
                        type="checkbox"
                        checked={editIsActive}
                        onChange={(event) => setEditIsActive(event.target.checked)}
                        disabled={isUpdating}
                      />
                      Active index
                    </label>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="gemini-button px-3 py-1.5 text-sm"
                        disabled={isUpdating}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="gemini-button-primary px-3 py-1.5 text-sm"
                        disabled={isUpdating}
                      >
                        {isUpdating ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {pendingDelete ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                <div className="hud-panel w-full max-w-md p-5">
                  <h4 className="text-lg font-semibold text-gemini-text-primary">Delete index?</h4>
                  <p className="mt-2 text-sm text-gemini-text-secondary">
                    This will remove {pendingDelete.code} from the available index list. This action cannot be undone.
                  </p>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="gemini-button px-3 py-1.5 text-sm"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="gemini-button border-gemini-accent-red/35 px-3 py-1.5 text-sm text-gemini-accent-red"
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Index'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
