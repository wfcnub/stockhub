import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyMetrics } from './KeyMetrics';

describe('KeyMetrics', () => {
  it('formats large numbers and percentages', () => {
    render(
      <KeyMetrics
        symbol="BBCA"
        name="Bank Central Asia Tbk"
        sector="Financials"
        metrics={{
          market_cap: 950_000_000_000_000,
          pe_ratio: 25.5,
          pbv: 4.2,
          dividend_yield: 1.2,
          eps: 356,
          roe: 16.8,
          observation_date: '2026-04-01',
        }}
      />,
    );

    expect(screen.getByText('BBCA')).toBeInTheDocument();
    expect(screen.getByText('$950.00T')).toBeInTheDocument();
    expect(screen.getByText('25.5')).toBeInTheDocument();
    expect(screen.getByText('1.20%')).toBeInTheDocument();
  });

  it('shows dashes when metrics are unavailable', () => {
    render(<KeyMetrics symbol="XXXX" name="Unknown" sector={null} metrics={null} />);

    expect(screen.getByText('XXXX')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});
