import { randomUUID } from 'crypto';
import type { AthenaSession } from './types';

// In-memory session store. The extension POSTs a passage and gets back a short
// id, so the text never has to travel in a URL.
//
// Not a database on purpose: a viva is one user on one machine for a few
// minutes. Sessions don't survive a restart. Kept on globalThis because Next's
// dev hot reload re-evaluates modules and would otherwise drop them all.
const TTL_MS = 6 * 60 * 60 * 1000;

type Store = Map<string, AthenaSession>;

const globalStore = globalThis as typeof globalThis & {
  __athenaSessions?: Store;
};

const sessions: Store = (globalStore.__athenaSessions ??= new Map());

function evictExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}

export function createSession(input: {
  passage: string;
  sourceTitle?: string;
  sourceUrl?: string;
  focusTopics?: string[];
}): AthenaSession {
  evictExpired();
  const session: AthenaSession = {
    id: randomUUID().slice(0, 8),
    passage: input.passage,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    focusTopics: input.focusTopics?.length ? input.focusTopics : undefined,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): AthenaSession | undefined {
  evictExpired();
  return sessions.get(id);
}

export function updateSession(
  id: string,
  patch: Partial<
    Pick<AthenaSession, 'agentId' | 'channel' | 'summary' | 'live' | 'nudge'>
  >,
): AthenaSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  Object.assign(session, patch);
  return session;
}
