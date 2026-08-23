/**
 * Athena revision history.
 *
 * A viva is a single session; revision is what happens across all of them. This
 * module owns the record of every viva the student has started and turns it
 * into one list of topics ranked by how badly they need another look.
 *
 * The history lives in `chrome.storage.local`, not on the server. The server's
 * session store is deliberately in-memory — it holds a passage for the minutes a
 * viva takes and forgets it — so anything meant to survive a restart, a laptop
 * lid, or a week between study sessions has to live in the extension. That also
 * keeps the record on the student's machine, which is where an account of what
 * someone is bad at belongs.
 */

(function () {
  const HISTORY_KEY = 'athena:history';

  /** Past this, the oldest vivas are dropped rather than grown forever. */
  const MAX_RECORDS = 40;
  /**
   * How much of the passage each record keeps.
   *
   * Enough to re-examine from, and no more. The prompt truncates at 6000
   * characters anyway, so storing the full 20000 a session accepts would buy
   * nothing and multiply the storage by forty.
   */
  const MAX_PASSAGE = 4000;
  /** A viva still unfinished after this long was abandoned, not left running. */
  const ABANDON_MS = 12 * 60 * 60 * 1000;

  /** Worst first. Drives the default ordering and the "needs work" counts. */
  const WEAKNESS = {
    wrong: 0,
    partial: 1,
    unattempted: 2,
    active: 2,
    correct: 3,
  };

  const STATUS_LABEL = {
    wrong: 'needs work',
    partial: 'partly there',
    unattempted: 'not covered',
    active: 'not covered',
    correct: 'understood',
  };

  // ── Storage ───────────────────────────────────────────────────────────────────

  async function load() {
    const data = await chrome.storage.local.get(HISTORY_KEY);
    const records = data[HISTORY_KEY];
    return Array.isArray(records) ? records : [];
  }

  async function save(records) {
    await chrome.storage.local.set({
      [HISTORY_KEY]: records.slice(0, MAX_RECORDS),
    });
  }

  /**
   * Opens a record the moment a viva starts, rather than when it ends.
   *
   * A viva that crashes, or whose window is closed halfway, is still evidence of
   * what the student was working on — and its topics are recovered by the next
   * reconcile. Waiting for a clean ending would lose exactly the sessions that
   * went badly, which are the ones revision is for.
   */
  async function openRecord(record) {
    const records = await load();
    const next = [
      {
        sessionId: record.sessionId,
        startedAt: Date.now(),
        endedAt: null,
        title: record.title || '',
        url: record.url || '',
        passage: (record.passage || '').slice(0, MAX_PASSAGE),
        topics: [],
      },
      ...records.filter((r) => r.sessionId !== record.sessionId),
    ];
    await save(next);
  }

  /**
   * Brings open records up to date from the server's live state.
   *
   * Called when the panel mounts, on a timer while a viva runs, and when the viva
   * window closes. The server may be down or may have forgotten the session — in
   * both cases the record keeps whatever it last saw, which is the point of
   * mirroring it here at all.
   */
  async function reconcile(server) {
    const records = await load();
    const unfinished = records.filter((r) => !r.endedAt);
    if (unfinished.length === 0) return records;

    let changed = false;

    await Promise.all(
      unfinished.map(async (record) => {
        if (Date.now() - record.startedAt > ABANDON_MS) {
          record.endedAt = record.startedAt;
          changed = true;
          return;
        }

        let live = null;
        try {
          const response = await fetch(
            `${server}/api/athena/live?id=${encodeURIComponent(record.sessionId)}`,
            { cache: 'no-store' },
          );
          if (!response.ok) return;
          live = (await response.json()).live;
        } catch {
          // Server asleep. The record stands as it is.
          return;
        }

        if (!live) return;

        if (Array.isArray(live.topics) && live.topics.length > 0) {
          record.topics = live.topics;
          changed = true;
        }
        if (live.ended && !record.endedAt) {
          record.endedAt = live.updatedAt || Date.now();
          changed = true;
        }
      }),
    );

    if (changed) await save(records);
    return records;
  }

  /** Marks a session finished locally, for when the window closed on its own. */
  async function closeRecord(sessionId) {
    const records = await load();
    const record = records.find((r) => r.sessionId === sessionId);
    if (!record || record.endedAt) return;
    record.endedAt = Date.now();
    await save(records);
  }

  async function clear() {
    await chrome.storage.local.remove(HISTORY_KEY);
  }

  // ── Aggregation ───────────────────────────────────────────────────────────────

  /**
   * Folds every session's topics into one list, one entry per topic.
   *
   * The status shown is the **most recent** one, not the worst ever seen: the
   * question revision answers is "where am I now", and a topic recovered last
   * week should not keep showing red because of the session before it. What the
   * older sessions contribute is `everStruggled`, which is how a recovery stays
   * visible without distorting the ranking.
   */
  function aggregate(records) {
    const byKey = new Map();

    // Oldest first, so the last write per topic is genuinely the most recent.
    const ordered = [...records].sort((a, b) => a.startedAt - b.startedAt);

    for (const record of ordered) {
      for (const topic of record.topics || []) {
        if (!topic?.name) continue;
        const key = topic.name.trim().toLowerCase();
        if (!key) continue;

        const existing = byKey.get(key);
        const entry = existing ?? {
          key,
          name: topic.name.trim(),
          status: topic.status,
          sessions: 0,
          attempts: 0,
          redeemed: false,
          everStruggled: false,
          lastAt: record.startedAt,
          sources: [],
        };

        entry.name = topic.name.trim();
        entry.status = topic.status;
        entry.sessions += 1;
        entry.attempts += Number(topic.attempts) || 0;
        entry.redeemed = entry.redeemed || Boolean(topic.redeemed);
        entry.everStruggled =
          entry.everStruggled || topic.status === 'wrong' || topic.status === 'partial';
        entry.lastAt = record.startedAt;
        entry.sources.push({
          sessionId: record.sessionId,
          title: record.title,
          startedAt: record.startedAt,
        });

        if (!existing) byKey.set(key, entry);
      }
    }

    return [...byKey.values()];
  }

  const SORTS = {
    weakest: (a, b) =>
      (WEAKNESS[a.status] ?? 2) - (WEAKNESS[b.status] ?? 2) || b.lastAt - a.lastAt,
    recent: (a, b) => b.lastAt - a.lastAt,
    examined: (a, b) => b.attempts - a.attempts || b.sessions - a.sessions,
    alpha: (a, b) => a.name.localeCompare(b.name),
  };

  /** Applies the student's chosen sort and status filter to the aggregate. */
  function shape(entries, { sort = 'weakest', statuses = null } = {}) {
    const filtered = statuses?.size
      ? entries.filter((e) => statuses.has(e.status))
      : entries;
    return [...filtered].sort(SORTS[sort] ?? SORTS.weakest);
  }

  /**
   * The passages behind a set of topics, deduplicated and joined.
   *
   * Selecting topics from three different sessions has to produce one passage,
   * because a viva examines one body of material. Sources are separated by a rule
   * so the model can tell that it is looking at three excerpts rather than one
   * argument that keeps changing subject.
   */
  function passageFor(records, keys) {
    const wanted = new Set(keys);
    const seen = new Set();
    const parts = [];

    for (const record of [...records].sort((a, b) => b.startedAt - a.startedAt)) {
      const hit = (record.topics || []).some((t) =>
        wanted.has((t.name || '').trim().toLowerCase()),
      );
      if (!hit || !record.passage) continue;

      const fingerprint = record.passage.slice(0, 120);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      parts.push(
        record.title ? `From "${record.title}":\n${record.passage}` : record.passage,
      );
    }

    return parts.join('\n\n---\n\n');
  }

  /** The revision list as a file the student can keep or hand to a tutor. */
  function toMarkdown(entries, records) {
    const date = new Date().toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const weak = entries.filter((e) => e.status === 'wrong' || e.status === 'partial');
    const lines = [
      '# Athena — revision list',
      '',
      `${date} · ${entries.length} topic${entries.length === 1 ? '' : 's'} across ${records.length} viva${records.length === 1 ? '' : 's'}`,
      '',
      'Athena is a study aid, not a grader. These are the judgements she made while you talked.',
      '',
    ];

    if (weak.length) {
      lines.push('## Revise these first', '');
      for (const e of weak) {
        lines.push(
          `- **${e.name}** — ${STATUS_LABEL[e.status]} (examined ${e.attempts} time${e.attempts === 1 ? '' : 's'} across ${e.sessions} session${e.sessions === 1 ? '' : 's'})`,
        );
      }
      lines.push('');
    }

    lines.push('## Everything you have been examined on', '');
    for (const e of [...entries].sort(SORTS.weakest)) {
      const badge = e.redeemed ? ' · recovered on a second attempt' : '';
      lines.push(`- **${e.name}** — ${STATUS_LABEL[e.status]}${badge}`);
    }

    return lines.join('\n');
  }

  window.AthenaRevision = {
    HISTORY_KEY,
    STATUS_LABEL,
    WEAKNESS,
    load,
    open: openRecord,
    close: closeRecord,
    reconcile,
    clear,
    aggregate,
    shape,
    passageFor,
    toMarkdown,
  };
})();
