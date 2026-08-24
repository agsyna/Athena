// Port of quickstart/lib/athena/parse.ts. Keep the two in sync: they read the
// same payload and the contract lives in lib/athena/prompt.ts. The extension
// has no build step, so it can't just import the TypeScript.

const STATUSES = ['correct', 'partial', 'wrong'];

// Walk back from the last `}` and let JSON.parse decide which `{` starts the
// payload. Tracking quote state instead doesn't work: the prose in front of it
// often contains an unbalanced quote, which flips the parity and hides the JSON.
function findControlSpan(text) {
  const close = text.lastIndexOf('}');
  if (close === -1) return null;

  const opens = [];
  for (let i = close - 1; i >= 0; i--) {
    if (text[i] === '{') opens.push(i);
    // One small object per turn, so don't scan the whole reply.
    if (opens.length >= 12) break;
  }

  for (const open of opens) {
    try {
      const value = JSON.parse(text.slice(open, close + 1));
      if (value && typeof value === 'object') {
        return { start: open, end: close + 1, value };
      }
    } catch {
      // Not JSON from here, try an earlier brace.
    }
  }

  return null;
}

function isControl(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    value.topics !== undefined ||
    value.focus !== undefined ||
    value.mark !== undefined ||
    value.done !== undefined ||
    value.outside !== undefined
  );
}

// Splits a turn into the spoken part and the control payload. A malformed
// object is dropped rather than thrown on: the chip just updates a turn late.
export function parseTurn(text) {
  if (!text || !text.includes('{')) return { spoken: text ?? '', control: null };

  const span = findControlSpan(text);
  if (!span || !isControl(span.value)) return { spoken: text, control: null };

  const spoken = (text.slice(0, span.start) + text.slice(span.end))
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { spoken, control: span.value };
}

export function createTopics(names) {
  const seen = new Set();
  return names
    .map((n) => String(n).trim())
    .filter((n) => {
      if (!n || seen.has(n.toLowerCase())) return false;
      seen.add(n.toLowerCase());
      return true;
    })
    .slice(0, 6)
    .map((name) => ({ name, status: 'unattempted', attempts: 0, redeemed: false }));
}

// The model doesn't always echo topic names exactly, so match loosely.
function matchIndex(topics, name) {
  const target = String(name).trim().toLowerCase();
  const exact = topics.findIndex((t) => t.name.toLowerCase() === target);
  if (exact !== -1) return exact;
  return topics.findIndex(
    (t) =>
      t.name.toLowerCase().includes(target) || target.includes(t.name.toLowerCase()),
  );
}

// Applies one control payload to the topic list. `mark` runs after `focus` so a
// topic that was just judged doesn't get pulled back to blue in the same tick.
export function applyControl(topics, control) {
  let next = topics;
  const transitions = [];

  if (control.topics?.length && next.length === 0) {
    next = createTopics(control.topics);
  }

  if (control.focus) {
    const i = matchIndex(next, control.focus);
    if (i !== -1) {
      next = next.map((t, idx) => {
        if (idx === i) return t.status === 'unattempted' ? { ...t, status: 'active' } : t;
        // Only one chip is active at a time.
        return t.status === 'active' ? { ...t, status: 'unattempted' } : t;
      });
    }
  }

  if (control.mark) {
    const i = matchIndex(next, control.mark.topic);
    const result = control.mark.result;
    if (i !== -1 && STATUSES.includes(result)) {
      const prev = next[i];
      const wasStruggling = prev.status === 'wrong' || prev.status === 'partial';
      const redemption = wasStruggling && result === 'correct';

      if (prev.status !== result) {
        transitions.push({ topic: prev.name, from: prev.status, to: result, redemption });
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
