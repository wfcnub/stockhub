import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUpstreamUrl, proxyRequest } from './apiProxy';
import * as route from '@/app/api/[...path]/route';

function upstreamResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:8000');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('method filter', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)(
    '%s returns 405 with a detail body',
    async (method) => {
      const handler = route[method];
      const response = await handler();

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      const body = await response.json();
      expect(body.detail).toMatch(/only forwards GET and HEAD/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('proxyRequest itself rejects a non-GET/HEAD method before any upstream call', async () => {
    const response = await proxyRequest(new Request('http://app/api/v1/sync/start', { method: 'POST' }), [
      'v1',
      'sync',
      'start',
    ]);

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards GET and HEAD', async () => {
    fetchMock.mockImplementation(async () => upstreamResponse('{}', { status: 200 }));

    expect((await route.GET(new Request('http://app/api/v1/stats'), context('v1', 'stats'))).status).toBe(200);
    expect(
      (await route.HEAD(new Request('http://app/api/v1/stats', { method: 'HEAD' }), context('v1', 'stats'))).status,
    ).toBe(200);
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'HEAD']);
  });
});

describe('upstream URL', () => {
  it('maps /api/v1/... to BACKEND_INTERNAL_URL/api/v1/... and keeps the query string', () => {
    expect(buildUpstreamUrl(['v1', 'tickers', 'BBCA', 'chart'], '?range=1Y&ma_periods=10%2C20')).toBe(
      'http://backend:8000/api/v1/tickers/BBCA/chart?range=1Y&ma_periods=10%2C20',
    );
  });

  it('reads BACKEND_INTERNAL_URL at request time and tolerates a trailing slash', () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://other:9000/');
    expect(buildUpstreamUrl(['v1', 'stats'], '')).toBe('http://other:9000/api/v1/stats');
  });

  it('defaults to localhost:8000 when unset', () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', '');
    expect(buildUpstreamUrl(['v1', 'stats'], '')).toBe('http://localhost:8000/api/v1/stats');
  });

  it('encodes segments and rejects traversal or non-v1 paths', () => {
    expect(buildUpstreamUrl(['v1', 'tickers', 'A B'], '')).toBe('http://backend:8000/api/v1/tickers/A%20B');
    expect(buildUpstreamUrl(['v1', '..', 'admin'], '')).toBeNull();
    expect(buildUpstreamUrl(['v1', '.', 'stats'], '')).toBeNull();
    expect(buildUpstreamUrl(['v1', 'a/b'], '')).toBeNull();
    expect(buildUpstreamUrl(['v1', '', 'x'], '')).toBeNull();
    expect(buildUpstreamUrl(['docs'], '')).toBeNull();
    expect(buildUpstreamUrl([], '')).toBeNull();
  });

  it('answers 404 for a path outside /api/v1 without calling the backend', async () => {
    const response = await route.GET(new Request('http://app/api/openapi.json'), context('openapi.json'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: 'Not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('headers', () => {
  it('forwards only allow-listed request headers (no cookies or authorization)', async () => {
    fetchMock.mockResolvedValue(upstreamResponse('{}'));

    await route.GET(
      new Request('http://app/api/v1/stats', {
        headers: {
          accept: 'application/json',
          'accept-language': 'en',
          'accept-encoding': 'br',
          cookie: 'CF_Authorization=secret',
          authorization: 'Bearer secret',
          'cf-access-jwt-assertion': 'secret',
          'x-custom': 'nope',
        },
      }),
      context('v1', 'stats'),
    );

    const sent = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(sent.get('accept')).toBe('application/json');
    expect(sent.get('accept-language')).toBe('en');
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
    expect(sent.get('cf-access-jwt-assertion')).toBeNull();
    expect(sent.get('accept-encoding')).toBeNull();
    expect(sent.get('x-custom')).toBeNull();
  });

  it('passes status, body and relevant response headers through, dropping the rest', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('{"detail":"Ticker not found"}', {
        status: 404,
        headers: {
          'content-type': 'application/json',
          etag: '"abc"',
          'cache-control': 'max-age=60',
          'set-cookie': 'session=1',
          'content-encoding': 'gzip',
          'transfer-encoding': 'chunked',
          server: 'uvicorn',
        },
      }),
    );

    const response = await route.GET(new Request('http://app/api/v1/tickers/NOPE'), context('v1', 'tickers', 'NOPE'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: 'Ticker not found' });
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(response.headers.get('cache-control')).toBe('max-age=60');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('server')).toBeNull();
  });

  it('passes a 304 through with no body', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(null, { status: 304 }));

    const response = await route.GET(new Request('http://app/api/v1/stats'), context('v1', 'stats'));

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
  });

  it('HEAD returns no body', async () => {
    fetchMock.mockResolvedValue(upstreamResponse('{"a":1}', { headers: { 'content-type': 'application/json' } }));

    const response = await route.HEAD(
      new Request('http://app/api/v1/stats', { method: 'HEAD' }),
      context('v1', 'stats'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

describe('streaming', () => {
  it('returns the upstream body as a stream without buffering it', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"results":['));
        controller.enqueue(encoder.encode(']}'));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(upstreamResponse(stream, { headers: { 'content-type': 'application/json' } }));

    const response = await route.GET(new Request('http://app/api/v1/screener'), context('v1', 'screener'));

    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(await response.text()).toBe('{"results":[]}');
  });
});

describe('failures', () => {
  it('maps a connection failure to 502 with a detail body', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const response = await route.GET(new Request('http://app/api/v1/stats'), context('v1', 'stats'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: 'Backend unavailable' });
  });

  it('maps an upstream timeout to 504', async () => {
    vi.stubEnv('BACKEND_PROXY_TIMEOUT_MS', '20');
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const response = await route.GET(
      new Request('http://app/api/v1/screener/divergences'),
      context('v1', 'screener', 'divergences'),
    );

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ detail: 'Backend request timed out' });
  });

  it('passes an upstream 5xx through unchanged', async () => {
    fetchMock.mockResolvedValue(upstreamResponse('{"detail":"boom"}', { status: 500 }));

    const response = await route.GET(new Request('http://app/api/v1/stats'), context('v1', 'stats'));

    expect(response.status).toBe(500);
  });

  it('stops quietly when the client aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    const response = await route.GET(
      new Request('http://app/api/v1/stats', { signal: controller.signal }),
      context('v1', 'stats'),
    );

    expect(response.status).toBe(499);
  });
});
