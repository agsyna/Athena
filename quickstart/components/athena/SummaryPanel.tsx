'use client';

import { useState } from 'react';
import { groupTopics } from '@/lib/athena/summary';
import type { Topic } from '@/lib/athena/types';

/**
 * End-of-viva outcome map.
 *
 * The markdown file is the session's *record*; this is what the student should
 * actually read. It resolves the same chips they watched all session into
 * outcome groups, so the ending is the map settling rather than a new
 * representation appearing.
 *
 * Colour here is a status encoding, not a categorical one, so every state ships
 * with a label and a mark and is never carried by colour alone. Text stays on
 * text tokens throughout; the small coloured dot beside a label is what carries
 * identity.
 *
 * The download is a plain anchor to an endpoint that responds with
 * `Content-Disposition: attachment` rather than a script-generated blob URL,
 * because blob downloads are unreliable inside the extension's surfaces.
 */

type Outcome = 'strong' | 'recovered' | 'shaky' | 'weak' | 'untouched';

const OUTCOME: Record<
  Outcome,
  { label: string; color: string; glyph: string; note: string }
> = {
  strong: {
    label: 'Solid',
    color: 'var(--athena-success)',
    glyph: '✓',
    note: 'right first time',
  },
  recovered: {
    label: 'Recovered',
    color: 'var(--athena-blue)',
    glyph: '↻',
    note: 'right on the second pass — not yet solid',
  },
  shaky: {
    label: 'Shaky',
    color: 'var(--athena-amber)',
    glyph: '~',
    note: 'partly there',
  },
  // Amber, matching the live map: two warm hues side by side read as noise at
  // chip size, so "weak" and "shaky" share a colour and are told apart by their
  // label and their position in the revision order.
  weak: {
    label: 'Needs work',
    color: 'var(--athena-amber)',
    glyph: '!',
    note: 'not answered correctly',
  },
  untouched: {
    label: 'Not covered',
    color: 'var(--athena-text-dim)',
    glyph: '·',
    note: 'the session ended first',
  },
};

/**
 * How full each bubble reads.
 *
 * This is a completion fraction, not an area comparison — the circles are all
 * the same size on purpose. There is no honest magnitude to map onto radius
 * here (a topic is not "bigger" than another), and sizing them would invent
 * one. "Wrong" keeps a sliver rather than reading empty, because attempting a
 * topic and missing it is not the same as never being asked.
 */
const FILL: Record<Outcome, number> = {
  strong: 1,
  recovered: 1,
  shaky: 0.5,
  weak: 0.16,
  untouched: 0,
};

function Bubble({ topic, outcome }: { topic: Topic; outcome: Outcome }) {
  const { color, label, note } = OUTCOME[outcome];
  const fill = FILL[outcome];

  return (
    <li
      title={`${topic.name} — ${label}, ${note}`}
      className="relative flex h-[86px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-full border text-center"
      style={{
        borderColor: fill === 0 ? 'var(--athena-border)' : color,
        background: 'var(--athena-surface)',
      }}
    >
      {/* Fills from the bottom, flat-topped, like a filling vessel. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${fill * 100}%`, background: color, opacity: 0.22 }}
      />
      <span className="relative z-10 px-1.5 text-[10px] leading-tight text-[var(--athena-text)]">
        {topic.name}
      </span>
      {topic.redeemed && (
        <span
          aria-hidden
          className="absolute right-2 top-2 z-10 text-[10px]"
          style={{ color }}
        >
          {OUTCOME.recovered.glyph}
        </span>
      )}
    </li>
  );
}

function Dot({ outcome }: { outcome: Outcome }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: OUTCOME[outcome].color }}
    />
  );
}

export function SummaryPanel({
  markdown,
  downloadUrl,
  topics,
}: {
  markdown: string;
  downloadUrl: string;
  topics: Topic[];
}) {
  const [copied, setCopied] = useState(false);
  const [showRecord, setShowRecord] = useState(false);

  const groups = groupTopics(topics);
  const total = topics.length || 1;

  // Worst-first, matching the revision order the student is asked to follow.
  const segments: { outcome: Outcome; items: Topic[] }[] = [
    { outcome: 'weak', items: groups.weak },
    { outcome: 'shaky', items: groups.shaky },
    { outcome: 'recovered', items: groups.recovered },
    { outcome: 'strong', items: groups.strong },
    { outcome: 'untouched', items: groups.untouched },
  ];

  /**
   * The meter merges the two amber states into one fill. As separate segments
   * they would sit adjacent in the same hue and read as a single block anyway,
   * with the 2px gap looking like a rendering artefact rather than a boundary.
   * The groups below still tell them apart.
   */
  const meter: { key: string; label: string; color: string; count: number }[] = [
    {
      key: 'revisit',
      label: 'needs another pass',
      color: OUTCOME.weak.color,
      count: groups.weak.length + groups.shaky.length,
    },
    {
      key: 'recovered',
      label: OUTCOME.recovered.label,
      color: OUTCOME.recovered.color,
      count: groups.recovered.length,
    },
    {
      key: 'strong',
      label: OUTCOME.strong.label,
      color: OUTCOME.strong.color,
      count: groups.strong.length,
    },
    {
      key: 'untouched',
      label: OUTCOME.untouched.label,
      color: OUTCOME.untouched.color,
      count: groups.untouched.length,
    },
  ].filter((segment) => segment.count > 0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="shrink-0">
        <h1 className="athena-mono text-[13px] font-semibold tracking-[0.16em]">
          VIVA COMPLETE
        </h1>
        <p className="mt-1 text-[11px] text-[var(--athena-text-dim)]">
          {groups.revisionOrder.length === 0
            ? 'Everything landed first time. Try a harder passage.'
            : `${groups.revisionOrder.length} of ${topics.length} topics still want another pass.`}
        </p>
      </header>

      {/* Proportion meter: the whole session in one line. 2px surface gaps
          separate segments so adjacent fills never blend into one another. */}
      <div
        className="flex shrink-0 gap-[2px] overflow-hidden rounded-[4px]"
        role="img"
        aria-label={meter
          .map((segment) => `${segment.count} ${segment.label}`)
          .join(', ')}
      >
        {meter.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.count} ${segment.label}`}
            className="h-2 first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{
              width: `${(segment.count / total) * 100}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>

      <div className="athena-scroll flex min-h-0 flex-1 flex-col gap-3">
        {/* What to do next — the actionable half, and the reason this screen
            exists rather than a file. */}
        {groups.revisionOrder.length > 0 && (
          <section className="athena-card shrink-0 p-3">
            <h2 className="athena-mono text-[10px] uppercase tracking-[0.12em] text-[var(--athena-text-dim)]">
              Focus next, in this order
            </h2>
            <ol className="mt-2 flex flex-col gap-1.5">
              {groups.revisionOrder.map((topic, index) => {
                const outcome: Outcome = groups.weak.includes(topic)
                  ? 'weak'
                  : groups.shaky.includes(topic)
                    ? 'shaky'
                    : groups.recovered.includes(topic)
                      ? 'recovered'
                      : 'untouched';
                return (
                  <li key={topic.name} className="flex items-baseline gap-2 text-[12px]">
                    <span className="athena-mono w-[14px] shrink-0 text-[10px] text-[var(--athena-text-dim)]">
                      {index + 1}
                    </span>
                    <Dot outcome={outcome} />
                    <span className="min-w-0 flex-1 text-[var(--athena-text)]">
                      {topic.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--athena-text-dim)]">
                      {OUTCOME[outcome].label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* The rest of the map, grouped. Same chips, now resolved. */}
        {segments
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.outcome} className="shrink-0">
              <h2 className="flex items-center gap-1.5 text-[10px] text-[var(--athena-text-dim)]">
                <Dot outcome={s.outcome} />
                <span className="athena-mono uppercase tracking-[0.12em]">
                  {OUTCOME[s.outcome].label}
                </span>
                <span className="truncate">— {OUTCOME[s.outcome].note}</span>
              </h2>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {s.items.map((topic) => (
                  <li
                    key={topic.name}
                    className="athena-chip"
                    data-status={
                      s.outcome === 'strong' || s.outcome === 'recovered'
                        ? 'correct'
                        : s.outcome === 'untouched'
                          ? 'unattempted'
                          : s.outcome === 'shaky'
                            ? 'partial'
                            : 'wrong'
                    }
                  >
                    {topic.name}
                    {topic.redeemed && <span aria-hidden> {OUTCOME.recovered.glyph}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {/* The same topics once more, as a single glance. Redundant with the
            groups above by design — the groups are for reading, this is the
            shape of the session you remember afterwards. */}
        <section className="shrink-0">
          <h2 className="athena-mono text-[10px] uppercase tracking-[0.12em] text-[var(--athena-text-dim)]">
            Your map
          </h2>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {segments.flatMap((segment) =>
              segment.items.map((topic) => (
                <Bubble key={topic.name} topic={topic} outcome={segment.outcome} />
              )),
            )}
          </ul>
          <p className="mt-2 text-center text-[10px] leading-tight text-[var(--athena-text-dim)]">
            Fuller means better understood. All one size — no topic counts for
            more than another.
          </p>
        </section>

        {/* The full written record stays available, but it is no longer the
            first thing the student is asked to read. */}
        <section className="shrink-0">
          <button
            type="button"
            onClick={() => setShowRecord((open) => !open)}
            aria-expanded={showRecord}
            className="athena-mono w-full text-left text-[10px] uppercase tracking-[0.12em] text-[var(--athena-text-dim)] transition-colors hover:text-[var(--athena-text)]"
          >
            {showRecord ? '▾' : '▸'} Full written record
          </button>
          {showRecord && (
            <pre className="athena-card athena-mono mt-2 whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-[var(--athena-text)]">
              {markdown}
            </pre>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-col gap-2">
        <a
          href={downloadUrl}
          download
          className="athena-card px-3 py-2 text-center text-[12px] transition-colors hover:border-[var(--athena-blue)]"
        >
          Download summary (.md)
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="athena-card px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-blue)]"
        >
          {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
        <p className="text-center text-[10px] leading-tight text-[var(--athena-text-dim)]">
          Study aid, not a graded assessment.
        </p>
      </footer>
    </div>
  );
}
