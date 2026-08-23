'use client';

import { useState } from 'react';
import type { Topic } from '@/lib/athena/types';

/**
 * End-of-viva revision summary.
 *
 * The download is a plain anchor to an endpoint that responds with
 * `Content-Disposition: attachment` rather than a script-generated blob URL,
 * because blob downloads are unreliable inside the extension's side panel.
 * Copy-to-clipboard is offered alongside as a belt-and-braces fallback.
 */
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

  const correct = topics.filter((t) => t.status === 'correct').length;
  const recovered = topics.filter((t) => t.redeemed).length;
  const weak = topics.filter((t) => t.status === 'wrong' || t.status === 'partial').length;

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
          Your revision summary is ready.
        </p>
      </header>

      <section className="grid shrink-0 grid-cols-3 gap-2" aria-label="Session results">
        {[
          { label: 'solid', value: correct, color: 'var(--athena-success)' },
          { label: 'recovered', value: recovered, color: 'var(--athena-blue)' },
          { label: 'to revise', value: weak, color: 'var(--athena-amber)' },
        ].map((stat) => (
          <div key={stat.label} className="athena-card px-2 py-2.5 text-center">
            <div className="athena-mono text-[20px] leading-none" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="athena-mono mt-1 text-[9px] uppercase tracking-[0.1em] text-[var(--athena-text-dim)]">
              {stat.label}
            </div>
          </div>
        ))}
      </section>

      <div className="athena-card athena-scroll min-h-0 flex-1 p-3">
        <pre className="athena-mono whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--athena-text)]">
          {markdown}
        </pre>
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
