import { NextResponse } from 'next/server';

// Callers are the viva page (same-origin) and the extension's side panel
// (chrome-extension://<id>). Unpacked extension IDs aren't known ahead of time,
// so origins are allowed by scheme. Fine for a local dev server, not for a
// public one. See "Known limitations" in the README.
function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  if (origin.startsWith('http://localhost:')) return origin;
  if (origin.startsWith('http://127.0.0.1:')) return origin;
  return null;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request.headers.get('origin'));
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function withCors<T>(request: Request, body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...corsHeaders(request) },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
