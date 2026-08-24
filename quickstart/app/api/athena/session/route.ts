import { NextRequest } from 'next/server';
import { createSession, getSession } from '@/lib/athena/store';
import { preflight, withCors } from '@/lib/athena/cors';

// Below this there isn't enough material to build a viva out of.
const MIN_PASSAGE_CHARS = 80;
const MAX_PASSAGE_CHARS = 20000;

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

// Called by the side panel on "Start viva". Returns an id used to fetch the
// passage later, so the text itself never has to fit in a URL.
export async function POST(request: NextRequest) {
  let body: {
    passage?: string;
    sourceTitle?: string;
    sourceUrl?: string;
    focusTopics?: unknown;
  };
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
        error: `Highlight a bit more text. Athena needs at least ${MIN_PASSAGE_CHARS} characters to build a viva from.`,
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

  // Topics that sent the student back here, on a revision session. Capped at
  // six, past which it's a syllabus rather than a revision list.
  const focusTopics = Array.isArray(body.focusTopics)
    ? body.focusTopics
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim().slice(0, 60))
        .slice(0, 6)
    : undefined;

  const session = createSession({
    passage,
    sourceTitle: body.sourceTitle?.slice(0, 200),
    sourceUrl: body.sourceUrl?.slice(0, 500),
    focusTopics,
  });

  return withCors(request, {
    session_id: session.id,
    passage_chars: passage.length,
    focus_topics: session.focusTopics ?? [],
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
