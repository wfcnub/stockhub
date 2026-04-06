import Link from 'next/link';
import type { ReactNode } from 'react';
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
              <div className="hud-side-link">
                <span className="text-gemini-text-tertiary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.3 3.8a2 2 0 0 1 3.4 0l.3.5a2 2 0 0 0 1.6 1l.6.1a2 2 0 0 1 1.7 2l.1.6a2 2 0 0 0 1 1.6l.5.3a2 2 0 0 1 0 3.4l-.5.3a2 2 0 0 0-1 1.6l-.1.6a2 2 0 0 1-1.7 2l-.6.1a2 2 0 0 0-1.6 1l-.3.5a2 2 0 0 1-3.4 0l-.3-.5a2 2 0 0 0-1.6-1l-.6-.1a2 2 0 0 1-1.7-2l-.1-.6a2 2 0 0 0-1-1.6l-.5-.3a2 2 0 0 1 0-3.4l.5-.3a2 2 0 0 0 1-1.6l.1-.6a2 2 0 0 1 1.7-2l.6-.1a2 2 0 0 0 1.6-1l.3-.5Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
                  </svg>
                </span>
                <span className="text-sm">Settings</span>
              </div>
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

                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div className="space-y-5 p-4 md:p-6">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
