'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

const THEME_SLIDE_DURATION_MS = 420;

type ThemeTransitionDirection = 'ltr' | 'rtl';

type ViewTransitionCapableDocument = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const transitionCleanupRef = useRef<number | null>(null);

  const clearThemeTransitionMarker = () => {
    if (transitionCleanupRef.current !== null) {
      window.clearTimeout(transitionCleanupRef.current);
      transitionCleanupRef.current = null;
    }

    document.documentElement.removeAttribute('data-theme-transition');
  };

  useEffect(() => {
    setMounted(true);

    return () => {
      clearThemeTransitionMarker();
    };
  }, []);

  const isDark = resolvedTheme === 'dark';
  const nextTheme: 'light' | 'dark' = isDark ? 'light' : 'dark';

  const handleToggleTheme = () => {
    if (!mounted) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearThemeTransitionMarker();
      setTheme(nextTheme);
      return;
    }

    const direction: ThemeTransitionDirection = nextTheme === 'dark' ? 'ltr' : 'rtl';
    const rootElement = document.documentElement;
    clearThemeTransitionMarker();
    rootElement.setAttribute('data-theme-transition', direction);

    const transitionDocument = document as ViewTransitionCapableDocument;

    if (!transitionDocument.startViewTransition) {
      setTheme(nextTheme);
      transitionCleanupRef.current = window.setTimeout(() => {
        clearThemeTransitionMarker();
      }, THEME_SLIDE_DURATION_MS + 40);
      return;
    }

    const transition = transitionDocument.startViewTransition(() => {
      setTheme(nextTheme);
    });

    transition.finished.finally(() => {
      clearThemeTransitionMarker();
    });

  };

  return (
    <button
      type="button"
      onClick={handleToggleTheme}
      className="gemini-button-ghost inline-flex items-center gap-2.5 rounded-full border border-gemini-surface-border px-2.5 py-1.5 text-xs font-semibold text-gemini-text-secondary transition-colors duration-200 hover:text-gemini-text-primary motion-reduce:transition-none"
      aria-label={mounted ? `Switch to ${nextTheme} theme` : 'Toggle color theme'}
      title={mounted ? `Switch to ${nextTheme} theme` : 'Toggle color theme'}
      aria-pressed={mounted ? isDark : undefined}
    >
      <span className="relative flex h-6 w-11 shrink-0 items-center rounded-full border border-gemini-surface-border bg-gemini-bg-tertiary p-0.5">
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-gemini-surface shadow-gemini transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            mounted && isDark ? 'translate-x-5' : 'translate-x-0'
          }`}
        />

        <svg
          className={`relative z-10 h-3 w-3 transition-all duration-300 motion-reduce:transition-none ${
            mounted && isDark
              ? 'scale-90 text-gemini-text-muted opacity-45'
              : 'scale-100 text-gemini-accent-yellow opacity-100'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 3v2.4m0 13.2V21m9-9h-2.4M5.4 12H3m15.36 6.36-1.7-1.7M7.34 7.34l-1.7-1.7m12.72 0-1.7 1.7m-9.32 9.32-1.7 1.7M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
          />
        </svg>

        <svg
          className={`relative z-10 ml-auto h-3 w-3 transition-all duration-300 motion-reduce:transition-none ${
            mounted && isDark
              ? 'scale-100 text-gemini-accent-blue opacity-100'
              : 'scale-90 text-gemini-text-muted opacity-45'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M21 12.8A8.6 8.6 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          />
        </svg>
      </span>

      <span className="hidden sm:inline">{mounted ? (isDark ? 'Dark' : 'Light') : 'Theme'}</span>
    </button>
  );
}