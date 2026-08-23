import { NextRequest } from 'next/server';
import { createSession, getSession } from '@/lib/athena/store';
import { preflight, withCors } from '@/lib/athena/cors';

/** Below this, there is not enough material to build a viva out of. */
const MIN_PASSAGE_CHARS = 80;
const MAX_PASSAGE_CHARS = 20000;

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/**
 * Creates a viva session from highlighted text.
 *
 * Called by the extension's side panel the moment the student clicks "Start
 * viva". Returns an id the viva page uses to fetch the passage, so the passage
 * itself never has to survive a URL length limit.
 */
export async function POST(request: NextRequest) {
  let body: { passage?: string; sourceTitle?: string; sourceUrl?: string };
  try {
    body = await request.json();
  } catch {
    return withCors(request, { error: 'Invalid JSON body' }, { status: 400 });
  }

  const passage = (body.passage ?? '').trim();

  if (passage.length < MIN_PASSAGE_CHARS) {
    return withCors(
      request,
      {
        error: `Highlight a bit more text — Athena needs at least ${MIN_PASSAGE_CHARS} characters to build a viva from.`,
      },
      { status: 400 },
    );
  }

  if (passage.length > MAX_PASSAGE_CHARS) {
    return withCors(
      request,
      { error: 'That selection is too long. Highlight a few paragraphs rather than a whole page.' },
      { status: 400 },
    );
  }

  const session = createSession({
    passage,
    sourceTitle: body.sourceTitle?.slice(0, 200),
    sourceUrl: body.sourceUrl?.slice(0, 500),
  });

  return withCors(request, {
    session_id: session.id,
    passage_chars: passage.length,
  });
}

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return withCors(request, { error: 'id is required' }, { status: 400 });
  }

  const session = getSession(id);
  if (!session) {
    return withCors(
      request,
      { error: 'That viva session has expired. Highlight your passage again to start a new one.' },
      { status: 404 },
    );
  }

  return withCors(request, {
    session_id: session.id,
    passage: session.passage,
    source_title: session.sourceTitle,
    source_url: session.sourceUrl,
  });
}
