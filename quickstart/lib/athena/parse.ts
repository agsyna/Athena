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
 * Finds the control payload at the end of an agent turn.
 *
 * Works backwards from the last `}` and asks JSON.parse to adjudicate each
 * candidate `{`. Deliberately does not try to track string state across the
 * whole turn: everything before the payload is spoken prose, and a single
 * unbalanced quote in it — which a model will happily produce — flips the
 * parity and hides the payload completely. JSON.parse is the only thing that
 * actually knows where valid JSON begins.
 */
function findControlSpan(text: string): { start: number; end: number; value: unknown } | null {
  const close = text.lastIndexOf('}');
  if (close === -1) return null;

  // Rightmost first: the payload is the last thing in the turn, so the nearest
  // opening brace that parses is the one we want.
  const opens: number[] = [];
  for (let i = close - 1; i >= 0; i--) {
    if (text[i] === '{') opens.push(i);
    // A turn carries one small object; scanning the whole history of a long
    // reply for brace pairs is wasted work.
    if (opens.length >= 12) break;
  }

  for (const open of opens) {
    try {
      const value: unknown = JSON.parse(text.slice(open, close + 1));
      if (value && typeof value === 'object') {
        return { start: open, end: close + 1, value };
      }
    } catch {
      // Not valid JSON from here; try an earlier brace.
    }
  }

  return null;
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

  if (!isControl(span.value)) return { spoken: text, control: null };
  const control: AthenaControl = span.value;

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
