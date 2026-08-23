import { randomUUID } from 'crypto';
import type { AthenaSession } from './types';

/**
 * In-memory session store.
 *
 * Sessions exist so the highlighted passage never has to travel in a URL — the
 * extension POSTs the text, gets a short id back, and the viva page fetches it.
 *
 * Deliberately not a database: a viva is a single-user, single-machine,
 * minutes-long interaction. This is a documented limitation in the README —
 * sessions do not survive a server restart and are not shared across replicas.
 *
 * Held on globalThis because Next.js dev hot-reloading re-evaluates modules,
 * which would otherwise drop every in-flight session on the first file save.
 */
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
}): AthenaSession {
  evictExpired();
  const session: AthenaSession = {
    id: randomUUID().slice(0, 8),
    passage: input.passage,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
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
  patch: Partial<Pick<AthenaSession, 'agentId' | 'channel' | 'summary'>>,
): AthenaSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  Object.assign(session, patch);
  return session;
}
