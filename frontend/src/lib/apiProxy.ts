/**
 * Server-side proxy used by `app/api/[...path]/route.ts`.
 *
 * In the container image the browser talks to this Next.js server (NEXT_PUBLIC_API_URL=/api/v1) and the
 * server forwards to the FastAPI backend at BACKEND_INTERNAL_URL. Only GET and HEAD are forwarded until the
 * backend has an admin token; every other method gets a 405 `{ detail }`.
 *
 * Environment (read per request, so it works with container env as well as build args):
 * - BACKEND_INTERNAL_URL: backend origin, default http://localhost:8000 (no trailing path).
 * - BACKEND_PROXY_TIMEOUT_MS: upstream timeout, default 60000.
 */

export const ALLOWED_METHODS = ['GET', 'HEAD'] as const;

/** Only the contract's versioned API is exposed (not /docs, /openapi.json, /health, ...). */
const ALLOWED_FIRST_SEGMENT = 'v1';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 60_000;

// Allow-lists on purpose: cookies (e.g. the Cloudflare Access session) and Authorization must never reach the
// backend, and hop-by-hop / encoding headers must not be copied across the two HTTP hops.
const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'if-none-match', 'if-modified-since'] as const;
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'last-modified',
  'expires',
  'content-language',
] as const;

export function json(status: number, body: { detail: string }, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export function methodNotAllowed(): Response {
  return json(
    405,
    { detail: 'Method not allowed: this proxy only forwards GET and HEAD requests' },
    { allow: ALLOWED_METHODS.join(', ') },
  );
}

export function getBackendBaseUrl(): string {
  const configured = process.env.BACKEND_INTERNAL_URL?.trim();
  return (configured || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

function getTimeoutMs(): number {
  const parsed = Number(process.env.BACKEND_PROXY_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Returns the upstream URL for `/api/<segments>?<query>`, or null when the path is not allowed. */
export function buildUpstreamUrl(segments: readonly string[], search: string): string | null {
  if (segments.length === 0 || segments[0] !== ALLOWED_FIRST_SEGMENT) {
    return null;
  }

  // Next decodes path segments; reject anything that could climb out of /api/v1 once re-joined.
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('/'))) {
    return null;
  }

  const path = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `${getBackendBaseUrl()}/api/${path}${search}`;
}

function pick(source: Headers, names: readonly string[]): Headers {
  const picked = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) {
      picked.set(name, value);
    }
  }
  return picked;
}

export async function proxyRequest(request: Request, segments: readonly string[]): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const upstreamUrl = buildUpstreamUrl(segments, url.search);
  if (!upstreamUrl) {
    return json(404, { detail: 'Not found' });
  }

  const timeoutSignal = AbortSignal.timeout(getTimeoutMs());
  const signal = AbortSignal.any([request.signal, timeoutSignal]);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: pick(request.headers, FORWARDED_REQUEST_HEADERS),
      redirect: 'follow',
      cache: 'no-store',
      signal,
    });
  } catch {
    if (request.signal.aborted) {
      // Client went away; nobody reads this response.
      return new Response(null, { status: 499 });
    }
    if (timeoutSignal.aborted) {
      return json(504, { detail: 'Backend request timed out' });
    }
    return json(502, { detail: 'Backend unavailable' });
  }

  const headers = pick(upstream.headers, FORWARDED_RESPONSE_HEADERS);
  // Stream the body through; HEAD/204/304 have no body.
  const body = method === 'HEAD' ? null : upstream.body;
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
}
