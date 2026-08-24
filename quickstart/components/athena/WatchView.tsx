'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LiveState, Topic } from '@/lib/athena/types';
import { UnderstandingMap } from './UnderstandingMap';

const POLL_MS = 1000;
// No heartbeat for this long means the viva is gone, not just quiet.
const STALE_MS = 6000;

export function WatchView({ sessionId }: { sessionId: string }) {
  const [live, setLive] = useState<LiveState | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudged, setNudged] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/athena/live?id=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
        });
        if (stopped) return;
        if (!res.ok) {
          setError(
            res.status === 404
              ? 'No viva with that link. Sessions are held in memory and do not survive a server restart.'
              : 'Could not reach the session.',
          );
          return;
        }
        const data: { live: LiveState | null; source_title: string | null } =
          await res.json();
        setError(null);
        setLive(data.live);
        setTitle(data.source_title);
        setNow(Date.now());
      } catch {
        // Next poll is a second away, no point surfacing a dropped one.
      }
    };

    const id = setInterval(poll, POLL_MS);
    void poll();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId]);

  const nudge = useCallback(
    async (topic: string) => {
      setNudged(topic);
      try {
        await fetch('/api/athena/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, nudge: topic }),
        });
      } catch {
        setNudged(null);
        return;
      }
      // It's a request, not a guarantee: she finishes her sentence first. Let
      // the button go rather than leaving it stuck down.
      setTimeout(() => setNudged((t) => (t === topic ? null : t)), 4000);
    },
    [sessionId],
  );

  const topics: Topic[] = live?.topics ?? [];
  const weak = topics.filter((t) => t.status === 'wrong' || t.status === 'partial');
  const fresh = live ? now - live.updatedAt < STALE_MS : false;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-medium text-[var(--athena-text)]">
            Watching a viva
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--athena-text-dim)]">
            {title ?? 'Untitled passage'}
          </p>
        </div>
        <span
          className="athena-badge"
          style={{
            color: fresh ? 'var(--athena-success)' : 'var(--athena-text-dim)',
            borderColor: 'var(--athena-border)',
          }}
        >
          <span className="athena-badge-dot" aria-hidden />
          {live?.ended ? 'ended' : fresh ? 'live' : 'waiting'}
        </span>
      </header>

      {error ? (
        <p className="athena-card p-3 text-xs text-[var(--athena-text-dim)]">{error}</p>
      ) : (
        <>
          <UnderstandingMap topics={topics} outsideAsk={live?.outsideAsk ?? null} />

          <section className="athena-card p-3" aria-label="Tutor controls">
            <h2 className="athena-mono mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--athena-text-dim)]">
              Ask Athena to go back
            </h2>
            {weak.length === 0 ? (
              <p className="text-xs text-[var(--athena-text-dim)]">
                Nothing to revisit yet. Topics the student struggles with appear
                here as they are marked.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {weak.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => nudge(t.name)}
                    disabled={nudged === t.name}
                    className="athena-chip cursor-pointer disabled:cursor-default disabled:opacity-60"
                    data-status={t.status}
                  >
                    <span className="athena-chip-dot" aria-hidden />
                    {nudged === t.name ? `asked: ${t.name}` : t.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className="mt-auto pt-2 text-[11px] leading-snug text-[var(--athena-text-dim)]">
            You are seeing the assessment, not the conversation. No transcript
            and no audio leaves the student&rsquo;s machine. Athena is a study
            aid, not a grader.
          </p>
        </>
      )}
    </main>
  );
}
