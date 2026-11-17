import { methodNotAllowed, proxyRequest } from '@/lib/apiProxy';

// Always evaluated per request: BACKEND_INTERNAL_URL is read at runtime, never baked in at build time.
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = forward;
export const HEAD = forward;

// Writes stay blocked until the backend has an admin token. Explicit handlers give a `{ detail }` body
// instead of Next's empty default 405.
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
