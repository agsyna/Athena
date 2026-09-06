'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { groupTopics } from '@/lib/athena/summary';
import type { Topic } from '@/lib/athena/types';

// End-of-viva screen. The markdown file is the record; this is the part meant
// to be read. It resolves the same chips from the live map into outcome groups.
//
// Colour is a status encoding, so every state also has a label and a glyph and
// is never carried by colour alone.
//
// The download is a plain anchor to a Content-Disposition: attachment endpoint,
// not a blob URL, since blob downloads are unreliable in the extension.

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
    color: 'var(--athena-accent)',
    glyph: '↻',
    note: 'right on the second pass, not yet solid',
  },
  shaky: {
    label: 'Shaky',
    color: 'var(--athena-amber)',
    glyph: '~',
    note: 'partly there',
  },
  // Amber, same as the live map. Two warm hues at chip size just look like
  // noise, so weak and shaky share a colour and differ by label and order.
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

// Fill is a completion fraction, not an area comparison. Size only flexes
// enough to fit longer labels. "Wrong" keeps a sliver rather than reading
// empty, since being asked and missing isn't the same as never being asked.
const FILL: Record<Outcome, number> = {
  strong: 1,
  recovered: 1,
  shaky: 0.5,
  weak: 0.16,
  untouched: 0,
};

const BUBBLE_CANVAS = { width: 360, height: 250 };

interface BubbleItem {
  id: number;
  topic: Topic;
  outcome: Outcome;
}

interface BubblePlacement extends BubbleItem {
  x: number;
  y: number;
  size: number;
}

function bubbleSize(topic: Topic): number {
  const extra = Math.min(18, Math.max(0, topic.name.length - 8) * 1.5);
  return 48 + extra;
}

function layoutBubbles(items: BubbleItem[]): BubblePlacement[] {
  const { width, height } = BUBBLE_CANVAS;
  const centerX = width / 2;
  const centerY = height / 2;
  const sorted = [...items].sort((a, b) => bubbleSize(b.topic) - bubbleSize(a.topic));
  const placed: BubblePlacement[] = [];
  const density = items.length > 42 ? 0.76 : items.length > 26 ? 0.86 : 1;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const size = bubbleSize(item.topic) * density;
    let best = {
      x: centerX - size / 2,
      y: centerY - size / 2,
    };

    if (index > 0) {
      let found = false;

      for (let radius = 10; radius < 185 && !found; radius += 5) {
        const steps = Math.max(12, Math.ceil(radius / 5));

        for (let step = 0; step < steps; step += 1) {
          const angle = (index * 5 + step) * goldenAngle;
          const x = centerX + Math.cos(angle) * radius - size / 2;
          const y = centerY + Math.sin(angle) * radius * 0.72 - size / 2;
          const cx = x + size / 2;
          const cy = y + size / 2;
          const inside =
            x >= 0 &&
            y >= 0 &&
            x + size <= width &&
            y + size <= height &&
            ((cx - centerX) / 175) ** 2 + ((cy - centerY) / 118) ** 2 <= 1;
          const clear = placed.every((other) => {
            const dx = cx - (other.x + other.size / 2);
            const dy = cy - (other.y + other.size / 2);
            return Math.hypot(dx, dy) > (size + other.size) / 2 - 4;
          });

          if (inside && clear) {
            best = { x, y };
            found = true;
            break;
          }
        }
      }

      if (!found) {
        const angle = index * goldenAngle;
        const radius = Math.min(166, 18 + index * 4.2);
        best = {
          x: Math.min(width - size, Math.max(0, centerX + Math.cos(angle) * radius - size / 2)),
          y: Math.min(
            height - size,
            Math.max(0, centerY + Math.sin(angle) * radius * 0.72 - size / 2),
          ),
        };
      }
    }

    placed.push({ ...item, ...best, size });
  }

  const byId = new Map(placed.map((bubble) => [bubble.id, bubble]));
  return items.map((item) => byId.get(item.id) ?? { ...item, x: 0, y: 0, size: 48 });
}

function Bubble({ topic, outcome, style }: BubblePlacement & { style: CSSProperties }) {
  const { color, label, note } = OUTCOME[outcome];
  const fill = FILL[outcome];

  return (
    <span
      title={`${topic.name}: ${label}, ${note}`}
      className="absolute flex items-center justify-center overflow-hidden rounded-full border text-center"
      style={{
        ...style,
        borderColor: fill === 0 ? 'var(--athena-border)' : color,
        background: 'var(--athena-surface-raised)',
      }}
    >
      {/* Fills from the bottom. */}
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
    </span>
  );
}

function BubbleCloud({ items }: { items: BubbleItem[] }) {
  const layout = layoutBubbles(items);
  const answered = items.filter((item) => item.outcome !== 'untouched').length;

  return (
    <div
      className="relative aspect-[360/250] min-h-[220px] overflow-hidden rounded-[8px] border border-[var(--athena-border)] bg-[var(--athena-bg)]"
      role="img"
      aria-label={`${answered} of ${items.length} topics examined as a bubble map`}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-[var(--athena-border)] bg-[rgba(20,21,29,0.92)] px-3 py-2 text-center">
        <p className="athena-mono text-[11px] font-semibold text-[var(--athena-text)]">
          Topics
        </p>
        <p className="athena-mono text-[18px] font-semibold text-[var(--athena-text)]">
          {answered} <span className="text-[var(--athena-text-dim)]">/ {items.length}</span>
        </p>
      </div>
      {layout.map((bubble) => (
        <Bubble
          key={`${bubble.id}-${bubble.topic.name}`}
          {...bubble}
          style={{
            left: `${(bubble.x / BUBBLE_CANVAS.width) * 100}%`,
            top: `${(bubble.y / BUBBLE_CANVAS.height) * 100}%`,
            width: `${(bubble.size / BUBBLE_CANVAS.width) * 100}%`,
            aspectRatio: '1 / 1',
            zIndex: bubble.outcome === 'weak' || bubble.outcome === 'shaky' ? 12 : 8,
          }}
        />
      ))}
    </div>
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

  // Worst first, matching the revision order below.
  const segments: { outcome: Outcome; items: Topic[] }[] = [
    { outcome: 'weak', items: groups.weak },
    { outcome: 'shaky', items: groups.shaky },
    { outcome: 'recovered', items: groups.recovered },
    { outcome: 'strong', items: groups.strong },
    { outcome: 'untouched', items: groups.untouched },
  ];
  const bubbleItems = segments
    .flatMap((segment) =>
      segment.items.map((topic) => ({ topic, outcome: segment.outcome })),
    )
    .map((item, id) => ({ ...item, id }));

  // The meter merges the two amber states into one fill: side by side in the
  // same hue they read as one block anyway, and the 2px gap just looks like a
  // rendering glitch. The groups below still separate them.
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

      {/* The whole session in one line. 2px gaps keep segments apart. */}
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
        {/* What to do next. */}
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

        {/* The rest of the map, grouped. */}
        {segments
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.outcome} className="shrink-0">
              <h2 className="flex items-center gap-1.5 text-[10px] text-[var(--athena-text-dim)]">
                <Dot outcome={s.outcome} />
                <span className="athena-mono uppercase tracking-[0.12em]">
                  {OUTCOME[s.outcome].label}
                </span>
                <span className="truncate">{OUTCOME[s.outcome].note}</span>
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

        {/* The same topics again, as one picture. Redundant with the groups
            above on purpose: those are for reading, this is for remembering. */}
        <section className="shrink-0">
          <h2 className="athena-mono text-[10px] uppercase tracking-[0.12em] text-[var(--athena-text-dim)]">
            Your map
          </h2>
          <div className="mt-2">
            <BubbleCloud items={bubbleItems} />
          </div>
          <p className="mt-2 text-center text-[10px] leading-tight text-[var(--athena-text-dim)]">
            Fuller means better understood. Bubble size only helps longer labels fit.
          </p>
        </section>

        {/* Full record, collapsed by default. */}
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
          className="athena-card px-3 py-2 text-center text-[12px] transition-colors hover:border-[var(--athena-accent)]"
        >
          Download summary (.md)
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="athena-card px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-accent)]"
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
