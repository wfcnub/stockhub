'use client';

import type { KeyMetrics as KeyMetricsType } from '@/types';

interface KeyMetricsProps {
  symbol: string;
  name: string;
  sector: string | null;
  metrics: KeyMetricsType | null;
}

function formatNumber(value: number | null | undefined, prefix = '', suffix = ''): string {
  if (value === null || value === undefined) return '-';
  
  // Format large numbers (market cap)
  if (Math.abs(value) >= 1e12) {
    return `${prefix}${(value / 1e12).toFixed(2)}T${suffix}`;
  }
  if (Math.abs(value) >= 1e9) {
    return `${prefix}${(value / 1e9).toFixed(2)}B${suffix}`;
  }
  if (Math.abs(value) >= 1e6) {
    return `${prefix}${(value / 1e6).toFixed(2)}M${suffix}`;
  }
  
  return `${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(2)}%`;
}

export function KeyMetrics({ symbol, name, sector, metrics }: KeyMetricsProps) {
  const metricsData = [
    {
      label: 'Market Cap',
      value: formatNumber(metrics?.market_cap, '$'),
      gradient: 'from-blue-400 to-blue-600',
    },
    {
      label: 'P/E Ratio',
      value: formatNumber(metrics?.pe_ratio),
      gradient: 'from-green-400 to-emerald-600',
    },
    {
      label: 'PBV',
      value: formatNumber(metrics?.pbv),
      gradient: 'from-purple-400 to-purple-600',
    },
    {
      label: 'Dividend Yield',
      value: formatPercent(metrics?.dividend_yield),
      gradient: 'from-orange-400 to-orange-600',
    },
    {
      label: 'EPS',
      value: formatNumber(metrics?.eps),
      gradient: 'from-teal-400 to-teal-600',
    },
    {
      label: 'ROE',
      value: formatPercent(metrics?.roe),
      gradient: 'from-pink-400 to-rose-600',
    },
  ];

  return (
    <div className="hud-panel p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gemini-text-primary">{symbol}</h1>
        <p className="mt-1 text-lg text-gemini-text-secondary">{name}</p>
        {sector && (
          <span className="mt-2 inline-block rounded-full border border-gemini-accent-purple/30 bg-gemini-accent-purple/15 px-3 py-1 text-sm font-medium text-gemini-accent-purple">
            {sector}
          </span>
        )}
      </div>

      {metrics?.observation_date && (
        <p className="mb-4 text-xs text-gemini-text-tertiary">
          Data as of {new Date(metrics.observation_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {metricsData.map((metric) => (
          <div
            key={metric.label}
            className="hud-subpanel rounded-xl p-4 transition-colors hover:border-gemini-accent-blue/45"
          >
            <p className="mb-1 text-sm text-gemini-text-tertiary">{metric.label}</p>
            <p className={`text-xl font-bold bg-gradient-to-r ${metric.gradient} bg-clip-text text-transparent`}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}