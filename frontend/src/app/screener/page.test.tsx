import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/components/providers/QueryProvider';

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const api = vi.hoisted(() => ({
  getDivergenceScreener: vi.fn(),
  getTriangleScreener: vi.fn(),
  getIndexes: vi.fn(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

import ScreenerPage from './page';

function renderScreener(search = '') {
  nav.search = search;
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ScreenerPage />
    </QueryClientProvider>,
  );
}

function lastReplacedUrl(): string {
  return nav.replace.mock.calls.at(-1)?.[0] ?? '';
}

beforeEach(() => {
  nav.replace.mockReset();
  api.getDivergenceScreener.mockReset().mockResolvedValue({ lookback_days: 7, count: 0, results: [] });
  api.getTriangleScreener.mockReset().mockResolvedValue({ lookback_days: 7, count: 0, results: [] });
  api.getIndexes.mockReset().mockResolvedValue([]);
});

describe('screener URL defaults', () => {
  it('does not write tri_right=0 (or any default) when switching to triangle mode', async () => {
    renderScreener();
    await waitFor(() => expect(api.getDivergenceScreener).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Triangle' }));

    await waitFor(() => expect(api.getTriangleScreener).toHaveBeenCalled());
    await waitFor(() => expect(lastReplacedUrl()).toContain('mode=triangle'));
    expect(lastReplacedUrl()).not.toContain('tri_right');
    expect(lastReplacedUrl()).not.toContain('tri_left');
  });

  it('requests the contract default pivot_right_window of 1 when the URL has no tri_right', async () => {
    renderScreener('?mode=triangle');

    await waitFor(() => expect(api.getTriangleScreener).toHaveBeenCalled());

    const [days, params] = api.getTriangleScreener.mock.calls[0];
    expect(days).toBe(7);
    expect(params.pivot_right_window).toBe(1);
    expect(params.pivot_left_window).toBe(3);
  });

  it('keeps an explicit tri_right=0 (0 is valid) and leaves the URL as is', async () => {
    renderScreener('?mode=triangle&tri_right=0');

    await waitFor(() => expect(api.getTriangleScreener).toHaveBeenCalled());

    expect(api.getTriangleScreener.mock.calls[0][1].pivot_right_window).toBe(0);
    // The URL already matches the state (tri_right=0 is a non-default value), so it is left alone.
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('keeps explicit 0 for the divergence right-window params instead of replacing it with the default', async () => {
    renderScreener('?conf_min=0&conf_max=0&agg_max=0');

    await waitFor(() => expect(api.getDivergenceScreener).toHaveBeenCalled());

    const params = api.getDivergenceScreener.mock.calls[0][1];
    expect(params.confirmed_right_min).toBe(0);
    expect(params.confirmed_right_max).toBe(0);
    expect(params.aggressive_right_max).toBe(0);
  });

  it('uses the divergence defaults when those params are missing', async () => {
    renderScreener();

    await waitFor(() => expect(api.getDivergenceScreener).toHaveBeenCalled());

    expect(api.getDivergenceScreener.mock.calls[0][1]).toMatchObject({
      pivot_left_window: 5,
      confirmed_right_min: 2,
      confirmed_right_max: 5,
      aggressive_right_min: 0,
      aggressive_right_max: 1,
      include_invalidated: false,
    });
  });
});
