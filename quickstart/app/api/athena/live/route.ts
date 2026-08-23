import { NextRequest } from 'next/server';
import { getSession, updateSession } from '@/lib/athena/store';
import { preflight, withCors } from '@/lib/athena/cors';
import type { Topic } from '@/lib/athena/types';

/**
 * The live channel between a running viva and anyone watching it.
 *
 * Deliberately plain HTTP rather than a second RTM channel. A watcher is not a
 * participant — they have no microphone, no token, and no business in the RTC
 * channel — and giving them one would mean issuing credentials to a URL anyone
 * with the link can open. Polling a few small objects a second is the cheaper
 * and safer shape for a read-only shoulder-surf.
 */

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

/**
 * Two callers, one route.
 *
 * The viva window POSTs its map on a short heartbeat and gets back any waiting
 * nudge — so the same request that publishes state also collects instructions,
 * and there is no second polling loop to keep alive.
 *
 * The watch page POSTs `{ nudge }` to ask Athena to return to a topic.
 */
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

  // A watcher asking for an intervention.
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

  // Hand over any pending nudge exactly once — a second delivery would make
  // Athena double back twice on one press.
  const nudge = session.nudge ?? null;
  if (nudge) updateSession(id, { nudge: undefined });

  return withCors(request, { ok: true, nudge });
}

/** What the watch page reads. Never exposes the passage or the transcript. */
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
