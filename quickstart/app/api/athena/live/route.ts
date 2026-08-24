import { NextRequest } from 'next/server';
import { getSession, updateSession } from '@/lib/athena/store';
import { preflight, withCors } from '@/lib/athena/cors';
import type { Topic } from '@/lib/athena/types';

// Live channel between a running viva and anyone watching it.
//
// Plain HTTP rather than a second RTM channel. A watcher isn't a participant,
// and putting them in the channel would mean handing RTC credentials to anyone
// with the link. Polling a couple of small objects a second is cheaper anyway.

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

function sanitiseTopics(input: unknown): Topic[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t): t is Topic => !!t && typeof t === 'object' && typeof (t as Topic).name === 'string')
    .slice(0, 6)
    .map((t) => ({
      name: String(t.name).slice(0, 60),
      status: t.status,
      attempts: Number(t.attempts) || 0,
      redeemed: Boolean(t.redeemed),
    }));
}

// Two callers. The viva POSTs its map on a heartbeat and gets any waiting nudge
// back in the same response, so there's no second polling loop. The watch page
// POSTs { nudge } to ask Athena to go back to a topic.
export async function POST(request: NextRequest) {
  let body: {
    sessionId?: string;
    topics?: unknown;
    outsideAsk?: string;
    ended?: boolean;
    nudge?: string;
  };
  try {
    body = await request.json();
  } catch {
    return withCors(request, { error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = (body.sessionId ?? '').trim();
  const session = id ? getSession(id) : undefined;
  if (!session) {
    return withCors(request, { error: 'Unknown session' }, { status: 404 });
  }

  // A watcher asking Athena to double back.
  if (typeof body.nudge === 'string' && body.nudge.trim()) {
    updateSession(id, {
      nudge: { topic: body.nudge.trim().slice(0, 60), at: Date.now() },
    });
    return withCors(request, { ok: true });
  }

  // The viva publishing its map.
  updateSession(id, {
    live: {
      topics: sanitiseTopics(body.topics),
      outsideAsk: body.outsideAsk?.slice(0, 40),
      ended: Boolean(body.ended),
      updatedAt: Date.now(),
    },
  });

  // Deliver a pending nudge once only, or one press makes her double back twice.
  const nudge = session.nudge ?? null;
  if (nudge) updateSession(id, { nudge: undefined });

  return withCors(request, { ok: true, nudge });
}

// What the watch page reads. Doesn't expose the passage or the transcript.
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return withCors(request, { error: 'id is required' }, { status: 400 });

  const session = getSession(id);
  if (!session) {
    return withCors(request, { error: 'Unknown session' }, { status: 404 });
  }

  return withCors(request, {
    session_id: session.id,
    source_title: session.sourceTitle ?? null,
    live: session.live ?? null,
    has_summary: Boolean(session.summary),
  });
}
