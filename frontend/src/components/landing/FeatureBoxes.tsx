'use client';

import Link from 'next/link';

export function FeatureBoxes() {
  const features = [
    {
      title: 'Ticker List',
      description: 'Browse every listed symbol with fast symbol, name, and index filters.',
      href: '/tickers',
      tag: 'Up',
      cta: 'Open list',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10m10-10a2 2 0 00-2-2h-2a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'blue',
    },
    {
      title: 'Signal Screener',
      description: 'Detect setups from technical and fundamental criteria in seconds.',
      href: '/screener',
      tag: 'Up',
      cta: 'View module',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      ),
      color: 'purple',
    },
  ];

  const colorClasses = {
    blue: {
      tag: 'bg-gemini-accent-green/10 text-gemini-accent-green border-gemini-accent-green/20',
      border: 'hover:border-gemini-accent-blue/50',
      iconBg: 'bg-gemini-accent-blue/10',
      icon: 'text-gemini-accent-blue',
      arrow: 'text-gemini-accent-blue',
    },
    purple: {
      tag: 'bg-gemini-accent-green/10 text-gemini-accent-green border-gemini-accent-green/20',
      border: 'hover:border-gemini-accent-purple/50',
      iconBg: 'bg-gemini-accent-purple/10',
      icon: 'text-gemini-accent-purple',
      arrow: 'text-gemini-accent-purple',
    },
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {features.map((feature) => {
        const colors = colorClasses[feature.color as keyof typeof colorClasses];
        
        return (
          <Link
            key={feature.title}
            href={feature.href}
            className={`gemini-card-hover group block p-5 ${colors.border}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className={`rounded-lg p-2 ${colors.iconBg} ${colors.icon}`}>
                {feature.icon}
              </div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${colors.tag}`}>
                {feature.tag}
              </span>
            </div>

            <h3 className="mb-2 text-lg font-semibold text-gemini-text-primary">
              {feature.title}
            </h3>

            <p className="mb-5 text-sm leading-relaxed text-gemini-text-secondary">
              {feature.description}
            </p>

            <span className={`inline-flex items-center text-sm font-medium ${colors.arrow} transition-transform group-hover:translate-x-1`}>
              {feature.cta}
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        );
      })}
    </div>
  );
}