'use client';

import Link from 'next/link';
import { ControlShell } from '@/components/layout/ControlShell';

export default function ScreenerPage() {
  const plannedFeatures = [
    'Bullish and bearish divergence detection',
    'Custom technical indicator filters',
    'Fundamental metric screening',
    'Saved and shareable screener presets',
  ];

  return (
    <ControlShell
      activeSection="screener"
      title="Signal Screener"
      subtitle="Build precision stock filters for momentum and valuation setups."
      actionLabel="Browse Tickers"
      actionHref="/tickers"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="hud-panel p-7">
          <span className="hud-pill">Module status: In development</span>

          <div className="mt-5 flex items-center gap-4">
            <div className="rounded-2xl border border-gemini-accent-purple/35 bg-gemini-accent-purple/15 p-3">
              <svg className="h-7 w-7 text-gemini-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-5.2-5.2m2.2-4.8a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gemini-text-primary md:text-3xl">Screener module is coming soon</h1>
              <p className="mt-1 text-gemini-text-secondary">
                We are finishing a high-speed query engine to filter stocks by indicator regimes and valuation profiles.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {plannedFeatures.map((feature) => (
              <div key={feature} className="hud-subpanel flex items-center gap-3 p-3">
                <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gemini-accent-blue/15 text-gemini-accent-blue">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <p className="text-sm text-gemini-text-secondary">{feature}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="hud-panel p-6">
          <h2 className="text-lg font-semibold text-gemini-text-primary">Deployment notes</h2>
          <div className="mt-4 space-y-3">
            <div className="hud-subpanel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Current phase</p>
              <p className="mt-1 text-base font-semibold text-gemini-text-primary">Filter engine integration</p>
            </div>
            <div className="hud-subpanel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-gemini-text-tertiary">Next milestone</p>
              <p className="mt-1 text-base font-semibold text-gemini-text-primary">Saved presets and backtest snapshots</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <Link href="/tickers" className="gemini-button-primary text-center">
              Browse Tickers
            </Link>
            <Link href="/" className="gemini-button text-center">
              Back to Dashboard
            </Link>
          </div>
        </aside>
      </div>
    </ControlShell>
  );
}