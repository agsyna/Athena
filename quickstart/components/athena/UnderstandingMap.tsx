'use client';

import { useEffect, useRef, useState } from 'react';
import type { Topic, TopicStatus } from '@/lib/athena/types';

const STATUS_LABEL: Record<TopicStatus, string> = {
  unattempted: 'not covered yet',
  active: 'being discussed',
  partial: 'partly there',
  wrong: 'needs work',
  correct: 'understood',
};

/** Halo colour for the flip animation, matching the status being moved *to*. */
const FLIP_GLOW: Record<TopicStatus, string> = {
  unattempted: 'transparent',
  active: 'rgba(77, 141, 255, 0.35)',
  partial: 'rgba(245, 166, 35, 0.35)',
  wrong: 'rgba(245, 166, 35, 0.45)',
  correct: 'rgba(47, 208, 122, 0.4)',
};

function Chip({ topic }: { topic: Topic }) {
  const previous = useRef<TopicStatus>(topic.status);
  const [animation, setAnimation] = useState<'' | 'is-flipping' | 'is-redeeming'>('');

  useEffect(() => {
    if (previous.current === topic.status) return;

    const wasStruggling =
      previous.current === 'wrong' || previous.current === 'partial';
    const isRedemption = wasStruggling && topic.status === 'correct';
    previous.current = topic.status;

    // Restart the animation even if the same class is reapplied back-to-back.
    setAnimation('');
    const raf = requestAnimationFrame(() =>
      setAnimation(isRedemption ? 'is-redeeming' : 'is-flipping'),
    );
    const done = setTimeout(() => setAnimation(''), isRedemption ? 950 : 300);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [topic.status]);

  return (
    <span
      className={`athena-chip ${animation}`}
      data-status={topic.status}
      style={{ ['--athena-flip-glow' as string]: FLIP_GLOW[topic.status] }}
      title={`${topic.name} — ${STATUS_LABEL[topic.status]}`}
    >
      <span className="athena-chip-dot" aria-hidden />
      {topic.name}
      {topic.redeemed && (
        <span aria-hidden title="Recovered on a second attempt">
          ✓
        </span>
      )}
      <span className="sr-only">— {STATUS_LABEL[topic.status]}</span>
    </span>
  );
}

export function UnderstandingMap({
  topics,
  outsideAsk = null,
}: {
  topics: Topic[];
  /** Last thing asked about that the passage does not cover, if any. */
  outsideAsk?: string | null;
}) {
  const settled = topics.filter(
    (t) => t.status !== 'unattempted' && t.status !== 'active',
  ).length;

  return (
    <section
      className="athena-card p-3"
      aria-label="Understanding map"
      // Chip colours change without a page interaction, so announce updates.
      aria-live="polite"
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="athena-mono text-[10px] uppercase tracking-[0.14em] text-[var(--athena-text-dim)]">
          Understanding
        </h2>
        {topics.length > 0 && (
          <span className="athena-mono text-[10px] text-[var(--athena-text-dim)]">
            {settled}/{topics.length}
          </span>
        )}
      </div>

      {topics.length === 0 ? (
        <p className="text-xs text-[var(--athena-text-dim)]">
          Filled in once the examination starts.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {topics.map((topic) => (
            <Chip key={topic.name} topic={topic} />
          ))}
        </div>
      )}

      {outsideAsk && (
        <p className="athena-outside mt-2.5 text-[11px] leading-snug text-[var(--athena-text-dim)]">
          <span aria-hidden>◇</span> <strong>{outsideAsk}</strong> is outside
          this passage — Athena said so rather than guessing. Not judged.
        </p>
      )}
    </section>
  );
}
