import { NextResponse } from 'next/server';

// Callers are the viva page (same-origin) and the extension's side panel, which
// lives on chrome-extension://<id>.
//
// Set ATHENA_ALLOWED_ORIGINS to a comma-separated allowlist before deploying:
//
//   ATHENA_ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnop,https://athena.example.com
//
// An unpacked extension gets a fresh ID per install path, so pin it with a
// `key` in manifest.json first, otherwise the allowlist goes stale every time
// someone re-loads the extension.
//
// With no allowlist set, development falls back to allowing any
// chrome-extension:// or loopback origin. That is what makes an unpacked load
// work without configuration, and it is exactly what you must not ship, so a
// production build with no allowlist refuses every cross-origin caller rather
// than quietly staying open.
const allowlist = (process.env.ATHENA_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;

  if (allowlist.length > 0) {
    return allowlist.includes(origin) ? origin : null;
  }

  if (process.env.NODE_ENV === 'production') return null;

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
