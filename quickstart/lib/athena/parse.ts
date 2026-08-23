import type { Topic, TopicStatus } from './types';

/**
 * The silent control payload Athena appends to each spoken turn.
 * See lib/athena/prompt.ts for the contract the model is held to.
 */
export interface AthenaControl {
  topics?: string[];
  focus?: string;
  mark?: { topic: string; result: 'correct' | 'partial' | 'wrong' };
  done?: boolean;
}

export interface ParsedTurn {
  /** The turn with control JSON removed — safe to render as a caption. */
  spoken: string;
  control: AthenaControl | null;
}

/**
 * Finds the last balanced `{...}` run in `text`.
 *
 * A naive `lastIndexOf('{')` breaks on nested objects (`mark` is nested), and a
 * regex cannot balance braces at all. This walks the string tracking JSON string
 * state so a brace inside a topic name can never terminate the scan early.
 */
function findControlSpan(text: string): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let best: { start: number; end: number } | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        // Keep the last complete span: the prompt asks for the object at the
        // very end of the turn, so later wins if the model emits more than one.
        if (depth === 0 && start !== -1) best = { start, end: i + 1 };
      }
    }
  }

  return best;
}

function isControl(value: unknown): value is AthenaControl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as AthenaControl;
  return (
    v.topics !== undefined ||
    v.focus !== undefined ||
    v.mark !== undefined ||
    v.done !== undefined
  );
}

/**
 * Splits an agent turn into what was actually spoken and what was signalled.
 *
 * Tolerant by design: a malformed or partial object is dropped and the turn is
 * still rendered. A dropped control just means a chip updates one turn later,
 * which is far better than a crash mid-viva.
 */
export function parseTurn(text: string): ParsedTurn {
  if (!text || !text.includes('{')) return { spoken: text ?? '', control: null };

  const span = findControlSpan(text);
  if (!span) return { spoken: text, control: null };

  const candidate = text.slice(span.start, span.end);
  let control: AthenaControl | null = null;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (isControl(parsed)) control = parsed;
  } catch {
    // Not our payload (or arrived mid-stream, before the closing brace).
    return { spoken: text, control: null };
  }

  if (!control) return { spoken: text, control: null };

  const spoken = (text.slice(0, span.start) + text.slice(span.end))
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { spoken, control };
}

/** A chip changing colour — drives the flip animation and the recovery beat. */
export interface TopicTransition {
  topic: string;
  from: TopicStatus;
  to: TopicStatus;
  /** True when a previously wrong or partial topic just went correct. */
  redemption: boolean;
}

export interface ApplyResult {
  topics: Topic[];
  transitions: TopicTransition[];
}

export function createTopics(names: string[]): Topic[] {
  const seen = new Set<string>();
  return names
    .map((n) => n.trim())
    .filter((n) => {
      if (!n || seen.has(n.toLowerCase())) return false;
      seen.add(n.toLowerCase());
      return true;
    })
    .slice(0, 6)
    .map((name) => ({
      name,
      status: 'unattempted' as TopicStatus,
      attempts: 0,
      redeemed: false,
    }));
}

/** Topic names come back from the model; match forgivingly on case/spacing. */
function matchIndex(topics: Topic[], name: string): number {
  const target = name.trim().toLowerCase();
  const exact = topics.findIndex((t) => t.name.toLowerCase() === target);
  if (exact !== -1) return exact;
  return topics.findIndex(
    (t) =>
      t.name.toLowerCase().includes(target) ||
      target.includes(t.name.toLowerCase()),
  );
}

/**
 * Folds one control payload into the topic list.
 *
 * A `mark` always wins over `focus` for the same topic, so a chip that was just
 * judged does not get pulled back to the neutral "active" blue in the same tick.
 */
export function applyControl(
  topics: Topic[],
  control: AthenaControl,
): ApplyResult {
  let next = topics;
  const transitions: TopicTransition[] = [];

  if (control.topics?.length && next.length === 0) {
    next = createTopics(control.topics);
  }

  if (control.focus) {
    const i = matchIndex(next, control.focus);
    if (i !== -1) {
      next = next.map((t, idx) => {
        if (idx === i) {
          return t.status === 'unattempted' ? { ...t, status: 'active' } : t;
        }
        // Only one chip is ever "active"; release the previous one.
        return t.status === 'active' ? { ...t, status: 'unattempted' } : t;
      });
    }
  }

  if (control.mark) {
    const i = matchIndex(next, control.mark.topic);
    const result = control.mark.result;
    if (i !== -1 && (result === 'correct' || result === 'partial' || result === 'wrong')) {
      const prev = next[i];
      const wasStruggling = prev.status === 'wrong' || prev.status === 'partial';
      const redemption = wasStruggling && result === 'correct';

      if (prev.status !== result) {
        transitions.push({
          topic: prev.name,
          from: prev.status,
          to: result,
          redemption,
        });
      }

      next = next.map((t, idx) =>
        idx === i
          ? {
              ...t,
              status: result,
              attempts: t.attempts + 1,
              redeemed: t.redeemed || redemption,
            }
          : t,
      );
    }
  }

  return { topics: next, transitions };
}
