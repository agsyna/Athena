// Revision history: every viva the user has started, rolled up into one list of
// topics ranked by how much they still need work.
//
// Kept in chrome.storage.local rather than on the server. The server store is
// in-memory and forgets a session as soon as it's done, so anything that has to
// survive a restart lives here. It also keeps the record on the user's machine.

(function () {
  const HISTORY_KEY = 'athena:history';

  const MAX_RECORDS = 40;
  // Enough to re-examine from. The prompt truncates at 6000 chars anyway, so
  // keeping the full 20000 a session accepts would just waste storage.
  const MAX_PASSAGE = 4000;
  // Unfinished after this long means abandoned, not still running.
  const ABANDON_MS = 12 * 60 * 60 * 1000;

  // Worst first. Drives the default sort and the "needs work" count.
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

  // --- Storage ---

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

  // Records open at the start of a viva, not the end. A session that crashes or
  // gets closed halfway is still worth keeping, and reconcile() fills in its
  // topics later. Waiting for a clean ending would lose the worst sessions.
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

  // Refreshes open records from the server's live state. Called on mount, on a
  // timer during a viva, and when one ends. If the server is down or has
  // forgotten the session the record just keeps whatever it last saw.
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
          // Server's down, leave the record alone.
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

  // Marks a session finished locally, for when the panel closed on its own.
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

  // --- Aggregation ---

  // Collapses every session's topics into one entry per topic. The status shown
  // is the most recent one, not the worst ever: a topic recovered last week
  // shouldn't still show red. Older sessions only contribute everStruggled.
  function aggregate(records) {
    const byKey = new Map();

    // Oldest first, so the last write per topic really is the latest.
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

        // Status follows the latest sitting, but the display name doesn't: a
        // revision session echoing back different casing shouldn't rename it.
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

  // Applies the chosen sort and status filter.
  function shape(entries, { sort = 'weakest', statuses = null } = {}) {
    const filtered = statuses?.size
      ? entries.filter((e) => statuses.has(e.status))
      : entries;
    return [...filtered].sort(SORTS[sort] ?? SORTS.weakest);
  }

  // Rebuilds one passage from the sessions a set of topics came from. A viva
  // examines a single body of material, so excerpts get joined with a rule
  // between them rather than run together into one confusing block.
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

  // The revision list as a file you can keep or hand to a tutor.
  function toMarkdown(entries, records) {
    const date = new Date().toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const weak = entries.filter((e) => e.status === 'wrong' || e.status === 'partial');
    const lines = [
      '# Athena revision list',
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
          `- **${e.name}**: ${STATUS_LABEL[e.status]} (examined ${e.attempts} time${e.attempts === 1 ? '' : 's'} across ${e.sessions} session${e.sessions === 1 ? '' : 's'})`,
        );
      }
      lines.push('');
    }

    lines.push('## Everything you have been examined on', '');
    for (const e of [...entries].sort(SORTS.weakest)) {
      const badge = e.redeemed ? ' (recovered on a second attempt)' : '';
      lines.push(`- **${e.name}**: ${STATUS_LABEL[e.status]}${badge}`);
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
