import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/components/providers/QueryProvider';

const api = vi.hoisted(() => ({ getStats: vi.fn() }));
vi.mock('@/lib/api', () => api);

import { HeroSection } from './HeroSection';

function renderHero() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <HeroSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getStats.mockReset();
});

describe('HeroSection with TanStack Query', () => {
  it('shows the stats once loaded', async () => {
    api.getStats.mockResolvedValue({
      total_tickers: 850,
      total_indexes: 2,
      last_global_sync: '2026-04-01T10:30:00+00:00',
      indexes: [],
    });

    renderHero();

    expect(await screen.findByText('850')).toBeInTheDocument();
    expect(api.getStats).toHaveBeenCalledTimes(1);
    // The query function receives an AbortSignal for cancellation.
    expect(api.getStats.mock.calls[0][0]).toHaveProperty('signal');
  });

  it('shows the failure state with the error message and does not retry', async () => {
    api.getStats.mockRejectedValue(new Error('Backend unavailable (HTTP 502)'));

    renderHero();

    expect(await screen.findByText('Failed to refresh stats')).toBeInTheDocument();
    expect(api.getStats).toHaveBeenCalledTimes(1);
  });
});
