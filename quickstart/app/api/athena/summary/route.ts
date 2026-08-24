import { NextRequest } from 'next/server';
import { getSession, updateSession } from '@/lib/athena/store';
import { preflight, withCors } from '@/lib/athena/cors';
import { renderSummary, summaryFilename } from '@/lib/athena/summary';
import type { SummaryRequest } from '@/lib/athena/types';

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

// Builds the summary and stores it on the session. Two steps on purpose: the
// browser POSTs the final state here, then links to the GET to download it.
// A plain link to a Content-Disposition: attachment URL is the download path
// that actually works inside the side panel, where blob downloads are flaky.
export async function POST(request: NextRequest) {
  let body: SummaryRequest;
  try {
    body = await request.json();
  } catch {
    return withCors(request, { error: 'Invalid JSON body' }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return withCors(request, { error: 'Session not found' }, { status: 404 });
  }

  const markdown = renderSummary(
    session,
    body.topics ?? [],
    body.transcript ?? [],
    body.durationMs ?? 0,
  );

  updateSession(session.id, { summary: markdown });

  return withCors(request, {
    markdown,
    filename: summaryFilename(session),
    download_url: `/api/athena/summary?id=${session.id}&download=1`,
  });
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (!id) return withCors(request, { error: 'id is required' }, { status: 400 });

  const session = getSession(id);
  if (!session?.summary) {
    return withCors(
      request,
      { error: 'No summary has been generated for that session yet.' },
      { status: 404 },
    );
  }

  return new Response(session.summary, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${summaryFilename(session)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
