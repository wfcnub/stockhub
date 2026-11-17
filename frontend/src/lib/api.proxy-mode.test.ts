import { afterEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock('axios', () => {
  const isAxiosError = (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { isAxiosError?: boolean }).isAxiosError === true;
  const axios = { create: vi.fn(() => http), isAxiosError };
  return { default: axios, ...axios };
});

// The module reads NEXT_PUBLIC_* at import time, so each case resets modules and re-imports.
async function loadApi(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import('./api');
}

afterEach(() => {
  vi.unstubAllEnvs();
  Object.values(http).forEach((fn) => fn.mockReset());
});

describe('same-origin proxy mode (NEXT_PUBLIC_API_URL=/api/v1)', () => {
  it('disables admin actions and rejects writes without calling the network', async () => {
    const api = await loadApi({ NEXT_PUBLIC_API_URL: '/api/v1' });

    expect(api.ADMIN_ACTIONS_ENABLED).toBe(false);

    for (const call of [
      () => api.startSync('JCI'),
      () => api.stopSync('sync_1'),
      () => api.addIndex({ code: 'X', name: 'X' }),
      () => api.updateIndex(1, { name: 'Y' }),
      () => api.deleteIndex(1, true),
    ]) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(api.ApiError);
      expect((error as { status: number }).status).toBe(405);
      expect((error as { kind: string }).kind).toBe('admin-disabled');
      expect((error as Error).message).toBe(api.ADMIN_ACTIONS_DISABLED_MESSAGE);
    }

    expect(http.post).not.toHaveBeenCalled();
    expect(http.patch).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('keeps read calls working', async () => {
    const api = await loadApi({ NEXT_PUBLIC_API_URL: '/api/v1' });
    http.get.mockResolvedValue({ data: { sync_id: 's', status: 'in_progress', progress: {} } });

    await expect(api.getSyncProgress()).resolves.toMatchObject({ sync_id: 's' });
  });

  it('treats a network failure as a possible expired session', async () => {
    const api = await loadApi({ NEXT_PUBLIC_API_URL: '/api/v1' });
    http.get.mockRejectedValue({ isAxiosError: true, response: undefined });

    const error = await api.getStats().catch((e: unknown) => e);

    expect(api.isSessionError(error)).toBe(true);
    expect((error as Error).message).toBe(api.SESSION_EXPIRED_MESSAGE);
  });

  it('NEXT_PUBLIC_ADMIN_ACTIONS=enabled turns writes back on (once an admin token exists)', async () => {
    const api = await loadApi({ NEXT_PUBLIC_API_URL: '/api/v1', NEXT_PUBLIC_ADMIN_ACTIONS: 'enabled' });
    http.post.mockResolvedValue({ data: { sync_id: 's' } });

    expect(api.ADMIN_ACTIONS_ENABLED).toBe(true);
    await expect(api.startSync('JCI')).resolves.toEqual({ sync_id: 's' });
  });
});

describe('direct mode (absolute NEXT_PUBLIC_API_URL)', () => {
  it('keeps admin actions enabled and can be forced off', async () => {
    const direct = await loadApi({ NEXT_PUBLIC_API_URL: 'http://localhost:8000/api/v1' });
    expect(direct.ADMIN_ACTIONS_ENABLED).toBe(true);

    const forcedOff = await loadApi({
      NEXT_PUBLIC_API_URL: 'http://localhost:8000/api/v1',
      NEXT_PUBLIC_ADMIN_ACTIONS: 'disabled',
    });
    expect(forcedOff.ADMIN_ACTIONS_ENABLED).toBe(false);
  });
});
