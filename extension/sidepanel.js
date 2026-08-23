/**
 * Athena side panel.
 *
 * Pasting a passage is the primary input. Highlighting a page and clicking the
 * Athena icon is an accelerator that pre-fills the box — never the only way in,
 * because a page selection can be collapsed before the panel reads it and
 * Chrome refuses injection outright on internal pages and the PDF viewer.
 *
 * The viva itself runs in its own window, not embedded here. A cross-origin
 * frame inside a chrome-extension:// page is a separate microphone permission
 * context: Chrome does not inherit a grant already given to localhost, and the
 * prompt it raises cannot reliably be answered from the panel. Everything
 * voice-related lives in the Athena app, so this file never duplicates the
 * Agora client wiring.
 */

const SERVER = 'http://localhost:3000';
const MIN_CHARS = 80;

const composeEl = document.getElementById('compose');
const passageEl = document.getElementById('passage');
const countEl = document.getElementById('count');
const useSelectionEl = document.getElementById('use-selection');
const composeErrorEl = document.getElementById('compose-error');
const submitEl = document.getElementById('submit');

const statusEl = document.getElementById('status');
const statusMessageEl = document.getElementById('status-message');
const statusDetailEl = document.getElementById('status-detail');
const statusBackEl = document.getElementById('status-back');

const runningEl = document.getElementById('running');
const focusWindowEl = document.getElementById('focus-window');
const runningNewEl = document.getElementById('running-new');

const revisionEl = document.getElementById('revision');
const openRevisionEl = document.getElementById('open-revision');
const revisionBadgeEl = document.getElementById('revision-badge');
const revisionBackEl = document.getElementById('revision-back');
const revisionSubEl = document.getElementById('revision-sub');
const revisionSortEl = document.getElementById('revision-sort');
const revisionFiltersEl = document.getElementById('revision-filters');
const revisionListEl = document.getElementById('revision-list');
const revisionEmptyEl = document.getElementById('revision-empty');
const revisionReviseEl = document.getElementById('revision-revise');
const revisionExportEl = document.getElementById('revision-export');
const revisionClearEl = document.getElementById('revision-clear');
const revisionErrorEl = document.getElementById('revision-error');

/** Most recent capture offered by the service worker, if any. */
let pendingSelection = '';
/** Page title and URL for that capture, used to label the summary file. */
let pendingSource = { title: '', url: '' };
/** The window currently running a viva, if one is open. */
let vivaWindowId = null;
/** The session that window is running, so its history record can be closed. */
let vivaSessionId = null;

/** Revision view state: the records, and how the student wants them shown. */
let historyRecords = [];
let revisionSort = 'weakest';
const revisionStatuses = new Set();
const revisionSelected = new Set();

// ── View switching ────────────────────────────────────────────────────────────

function showCompose() {
  composeEl.hidden = false;
  statusEl.hidden = true;
  runningEl.hidden = true;
  revisionEl.hidden = true;
  passageEl.focus();
}

function showStatus(message, detail = '', { error = false, back = false } = {}) {
  statusMessageEl.textContent = message;
  statusDetailEl.textContent = detail;
  statusEl.classList.toggle('is-error', error);
  statusBackEl.hidden = !back;
  composeEl.hidden = true;
  runningEl.hidden = true;
  revisionEl.hidden = true;
  statusEl.hidden = false;
}

function showRunning() {
  composeEl.hidden = true;
  statusEl.hidden = true;
  revisionEl.hidden = true;
  runningEl.hidden = false;
}

function showRevision() {
  composeEl.hidden = true;
  statusEl.hidden = true;
  runningEl.hidden = true;
  revisionEl.hidden = false;
}

// ── Compose state ─────────────────────────────────────────────────────────────

function refreshCompose() {
  const length = passageEl.value.trim().length;
  countEl.textContent = `${length} character${length === 1 ? '' : 's'}`;
  countEl.classList.toggle('is-short', length > 0 && length < MIN_CHARS);
  submitEl.disabled = length < MIN_CHARS;

  // Only offer the shortcut when it would actually change what is in the box.
  useSelectionEl.hidden =
    pendingSelection.length < MIN_CHARS ||
    pendingSelection === passageEl.value.trim();
}

function setPassage(text) {
  passageEl.value = text;
  composeErrorEl.hidden = true;
  refreshCompose();
}

// ── Talking to the service worker ─────────────────────────────────────────────

function ask(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      // Reading lastError suppresses the "unchecked runtime.lastError" warning
      // when the service worker was asleep and the message never landed.
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });
}

/**
 * Pulls in a capture. `replace` is true when the student explicitly asked for
 * the highlighted text, and false on the passive path, where anything already
 * typed must not be clobbered.
 */
function adoptSelection(capture, { replace }) {
  pendingSelection = (capture?.text ?? '').trim();
  pendingSource = { title: capture?.title ?? '', url: capture?.url ?? '' };

  if (pendingSelection.length >= MIN_CHARS) {
    if (replace || passageEl.value.trim().length === 0) {
      setPassage(pendingSelection);
      return true;
    }
  }

  refreshCompose();
  return false;
}

// ── Starting a viva ───────────────────────────────────────────────────────────

async function startViva() {
  const passage = passageEl.value.trim();

  if (passage.length < MIN_CHARS) {
    composeErrorEl.textContent = `Athena needs at least ${MIN_CHARS} characters — roughly a paragraph.`;
    composeErrorEl.hidden = false;
    return;
  }

  showStatus('Preparing your viva…', `${passage.length} characters.`);

  let sessionId;
  try {
    const response = await fetch(`${SERVER}/api/athena/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Attribute the passage to its page only when it actually came from
      // there — a pasted passage carries no source, and mislabelling it would
      // put the wrong title on the summary file.
      body: JSON.stringify({
        passage,
        sourceTitle: passage === pendingSelection ? pendingSource.title : undefined,
        sourceUrl: passage === pendingSelection ? pendingSource.url : undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showStatus('Athena could not take that passage.', data.error ?? '', {
        error: true,
        back: true,
      });
      return;
    }

    sessionId = data.session_id;
  } catch {
    showStatus(
      'Athena server is not reachable.',
      `Run "pnpm dev" in the quickstart folder, then try again. Expected at ${SERVER}.`,
      { error: true, back: true },
    );
    return;
  }

  // a=1 starts the viva on arrival: the student pressed "Start viva" here, and
  // making them press an identical button in the new window is friction.
  const url = `${SERVER}/viva?s=${encodeURIComponent(sessionId)}&a=1`;
  const opened = await ask({ type: 'athena:open-window', url });

  if (!opened?.windowId) {
    showStatus('Could not open the viva window.', opened?.error ?? '', {
      error: true,
      back: true,
    });
    return;
  }

  vivaWindowId = opened.windowId;
  vivaSessionId = sessionId;

  await AthenaRevision.open({
    sessionId,
    title: passage === pendingSelection ? pendingSource.title : '',
    url: passage === pendingSelection ? pendingSource.url : '',
    passage,
  });

  showRunning();
  startTracking();
}

// ── Revision ──────────────────────────────────────────────────────────────────

/**
 * Mirrors the running viva's map into the history record while it runs.
 *
 * Waiting for the viva to end would lose every session the student abandons
 * halfway — and a viva abandoned halfway is itself a signal about which topic
 * they walked away from.
 */
let trackTimer = null;

function startTracking() {
  stopTracking();
  trackTimer = setInterval(() => {
    AthenaRevision.reconcile(SERVER).catch(() => {});
  }, 5000);
}

function stopTracking() {
  if (trackTimer !== null) clearInterval(trackTimer);
  trackTimer = null;
}

/**
 * Loads history from disk, brings it up to date, and repaints.
 *
 * Never throws: this runs during init, and a revision list that cannot be read
 * must not take the compose box down with it.
 */
async function refreshRevision({ reconcile = true } = {}) {
  try {
    const records = reconcile
      ? await AthenaRevision.reconcile(SERVER)
      : await AthenaRevision.load();
    historyRecords = Array.isArray(records) ? records : [];
  } catch {
    historyRecords = [];
  }

  renderBadge();
  if (!revisionEl.hidden) renderRevision();
}

/** The count on the header button: how many topics still want another look. */
function renderBadge() {
  const weak = AthenaRevision.aggregate(historyRecords).filter(
    (e) => e.status === 'wrong' || e.status === 'partial',
  ).length;
  revisionBadgeEl.textContent = String(weak);
  revisionBadgeEl.hidden = weak === 0;
}

function describeSource(entry) {
  const last = entry.sources[entry.sources.length - 1];
  const title = last?.title?.trim();
  const when = new Date(entry.lastAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const times = `${entry.attempts} question${entry.attempts === 1 ? '' : 's'}`;
  const across =
    entry.sessions > 1 ? ` · ${entry.sessions} sessions` : '';
  return `${times}${across} · ${title ? `${title} · ` : ''}${when}`;
}

function renderRevision() {
  const all = AthenaRevision.aggregate(historyRecords);
  const entries = AthenaRevision.shape(all, {
    sort: revisionSort,
    statuses: revisionStatuses,
  });

  const weak = all.filter((e) => e.status === 'wrong' || e.status === 'partial');
  revisionSubEl.textContent = all.length
    ? `${all.length} topic${all.length === 1 ? '' : 's'} across ${historyRecords.length} viva${historyRecords.length === 1 ? '' : 's'} · ${weak.length} still to revise`
    : '';

  revisionEmptyEl.hidden = all.length > 0;
  revisionListEl.hidden = all.length === 0;
  revisionListEl.replaceChildren();

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'topic';
    item.dataset.status = entry.status;
    item.classList.toggle('is-selected', revisionSelected.has(entry.key));

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = revisionSelected.has(entry.key);
    box.setAttribute('aria-label', `Revise ${entry.name}`);

    const body = document.createElement('div');
    body.className = 'topic-body';

    const name = document.createElement('div');
    name.className = 'topic-name';
    const dot = document.createElement('span');
    dot.className = 'topic-dot';
    name.append(dot, document.createTextNode(entry.name));
    if (entry.redeemed) {
      const mark = document.createElement('span');
      mark.className = 'topic-redeemed';
      mark.title = 'Recovered on a second attempt';
      mark.textContent = '✓';
      name.append(mark);
    }

    const meta = document.createElement('p');
    meta.className = 'topic-meta';
    meta.textContent = `${AthenaRevision.STATUS_LABEL[entry.status] ?? entry.status} · ${describeSource(entry)}`;

    body.append(name, meta);
    item.append(box, body);

    // The whole row is the target — a 14px checkbox in a 380px panel is a
    // frustrating thing to aim at.
    item.addEventListener('click', (event) => {
      if (event.target !== box) box.checked = !box.checked;
      if (box.checked) revisionSelected.add(entry.key);
      else revisionSelected.delete(entry.key);
      item.classList.toggle('is-selected', box.checked);
      renderReviseButton();
    });

    revisionListEl.append(item);
  }

  renderReviseButton();
}

function renderReviseButton() {
  const count = revisionSelected.size;
  revisionReviseEl.disabled = count === 0;
  revisionReviseEl.textContent = count
    ? `Revise ${count} topic${count === 1 ? '' : 's'}`
    : 'Revise selected';
}

/**
 * Starts a fresh viva on the selected topics.
 *
 * The passage is rebuilt from the sessions those topics came from, so Athena is
 * examining the same material rather than a summary of it — and `focusTopics`
 * tells her this is a second sitting, not a first.
 */
async function reviseSelected() {
  const keys = [...revisionSelected];
  if (keys.length === 0) return;

  const entries = AthenaRevision.aggregate(historyRecords).filter((e) =>
    revisionSelected.has(e.key),
  );
  const passage = AthenaRevision.passageFor(historyRecords, keys);

  if (passage.trim().length < MIN_CHARS) {
    revisionErrorEl.textContent =
      'The material behind those topics is no longer stored. Paste the passage again to be re-examined on it.';
    revisionErrorEl.hidden = false;
    return;
  }

  revisionErrorEl.hidden = true;
  showStatus('Preparing your revision…', entries.map((e) => e.name).join(', '));

  let sessionId;
  try {
    const response = await fetch(`${SERVER}/api/athena/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passage,
        sourceTitle: 'Revision',
        focusTopics: entries.map((e) => e.name),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showStatus('Athena could not take that.', data.error ?? '', {
        error: true,
        back: true,
      });
      return;
    }
    sessionId = data.session_id;
  } catch {
    showStatus(
      'Athena server is not reachable.',
      `Run "pnpm dev" in the quickstart folder, then try again. Expected at ${SERVER}.`,
      { error: true, back: true },
    );
    return;
  }

  const url = `${SERVER}/viva?s=${encodeURIComponent(sessionId)}&a=1`;
  const opened = await ask({ type: 'athena:open-window', url });
  if (!opened?.windowId) {
    showStatus('Could not open the viva window.', opened?.error ?? '', {
      error: true,
      back: true,
    });
    return;
  }

  vivaWindowId = opened.windowId;
  vivaSessionId = sessionId;
  await AthenaRevision.open({ sessionId, title: 'Revision', url: '', passage });
  revisionSelected.clear();
  showRunning();
  startTracking();
}

/** Hands the list over as a file — the artefact a tutor can actually read. */
function exportRevision() {
  const entries = AthenaRevision.aggregate(historyRecords);
  if (entries.length === 0) return;

  const blob = new Blob([AthenaRevision.toMarkdown(entries, historyRecords)], {
    type: 'text/markdown',
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `athena-revision-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(href);
}

// ── Wiring ────────────────────────────────────────────────────────────────────

passageEl.addEventListener('input', () => {
  composeErrorEl.hidden = true;
  refreshCompose();
});

// Ctrl/Cmd+Enter starts without reaching for the mouse.
passageEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !submitEl.disabled) {
    event.preventDefault();
    startViva();
  }
});

submitEl.addEventListener('click', startViva);
statusBackEl.addEventListener('click', showCompose);
runningNewEl.addEventListener('click', showCompose);

focusWindowEl.addEventListener('click', async () => {
  if (vivaWindowId == null) return showCompose();
  const result = await ask({ type: 'athena:focus-window', windowId: vivaWindowId });
  if (!result?.ok) {
    vivaWindowId = null;
    showCompose();
  }
});

useSelectionEl.addEventListener('click', async () => {
  // Re-read the page rather than trusting the stash: the earlier capture may
  // predate whatever the student has highlighted since.
  const fresh = await ask({ type: 'athena:recapture' });
  if (adoptSelection(fresh, { replace: true })) return;

  composeErrorEl.textContent =
    'Nothing long enough is highlighted on the page right now. Paste the passage instead.';
  composeErrorEl.hidden = false;
});

openRevisionEl.addEventListener('click', async () => {
  showRevision();
  await refreshRevision();
});

revisionBackEl.addEventListener('click', showCompose);

revisionSortEl.addEventListener('change', () => {
  revisionSort = revisionSortEl.value;
  renderRevision();
});

revisionFiltersEl.addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;
  const status = button.dataset.status;
  const pressed = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', String(!pressed));
  if (pressed) revisionStatuses.delete(status);
  else revisionStatuses.add(status);
  // "Not covered" also covers the topic Athena is on right now, which is the
  // same thing from the student's point of view: nothing judged yet.
  if (status === 'unattempted') {
    if (pressed) revisionStatuses.delete('active');
    else revisionStatuses.add('active');
  }
  renderRevision();
});

revisionReviseEl.addEventListener('click', reviseSelected);
revisionExportEl.addEventListener('click', exportRevision);

revisionClearEl.addEventListener('click', async () => {
  if (!confirm('Delete every viva Athena has recorded? This cannot be undone.')) {
    return;
  }
  await AthenaRevision.clear();
  revisionSelected.clear();
  await refreshRevision({ reconcile: false });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'athena:window-closed') return;
  if (message.windowId !== vivaWindowId) return;
  vivaWindowId = null;
  stopTracking();

  // One last read before the record is closed: the viva may have ended and
  // posted its final map moments before the window went away.
  const finished = vivaSessionId;
  vivaSessionId = null;
  (async () => {
    await AthenaRevision.reconcile(SERVER).catch(() => {});
    if (finished) await AthenaRevision.close(finished);
    await refreshRevision({ reconcile: false });
  })();

  showCompose();
});

/**
 * A fresh icon click while the panel is already open re-stashes the selection.
 * Without this the panel would keep showing whatever it read when it mounted.
 * A running viva is left alone — the student did not ask to abandon it.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes['athena:selection']) return;
  if (!runningEl.hidden) return;
  adoptSelection(changes['athena:selection'].newValue, { replace: false });
  showCompose();
});

(async function init() {
  showCompose();
  refreshCompose();
  adoptSelection(await ask({ type: 'athena:get-selection' }), { replace: false });
  // History is loaded after the compose view is usable: the badge is a nudge,
  // and nothing about it should delay the box the student came here to type in.
  await refreshRevision();
})();
