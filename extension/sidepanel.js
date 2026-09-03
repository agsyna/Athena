// Side panel UI. Pasting a passage is the main way in; highlighting the page
// and clicking the icon just pre-fills the box, since a selection can be
// collapsed before the panel reads it and some pages refuse injection.
//
// The RTC side of things lives in viva.js.

import { createViva } from './viva.js';
import { SERVER } from './config.js';
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

const vivaEl = document.getElementById('viva');
const vivaClockEl = document.getElementById('viva-clock');
const vivaStateEl = document.getElementById('viva-state');
const vivaOrbEl = document.getElementById('viva-orb');
const vivaCaptionEl = document.getElementById('viva-caption');
const mapCountEl = document.getElementById('map-count');
const mapChipsEl = document.getElementById('map-chips');
const mapEmptyEl = document.getElementById('map-empty');
const mapOutsideEl = document.getElementById('map-outside');
const vivaTranscriptEl = document.getElementById('viva-transcript');
const vivaWarningEl = document.getElementById('viva-warning');
const vivaTypedEl = document.getElementById('viva-typed');
const vivaSendEl = document.getElementById('viva-send');
const vivaMicEl = document.getElementById('viva-mic');
const vivaWeakEl = document.getElementById('viva-weak');
const vivaWatchEl = document.getElementById('viva-watch');
const vivaEndEl = document.getElementById('viva-end');

const summaryEl = document.getElementById('summary');
const summaryDoneEl = document.getElementById('summary-done');
const summaryCountsEl = document.getElementById('summary-counts');
const summaryBodyEl = document.getElementById('summary-body');
const summaryDownloadEl = document.getElementById('summary-download');
const summaryAgainEl = document.getElementById('summary-again');

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

// Latest capture from the service worker, and where it came from.
let pendingSelection = '';
let pendingSource = { title: '', url: '' };
// The running viva, and its session id so the history record can be closed.
let viva = null;
let vivaSessionId = null;
// Previous status per topic, so the recovery animation only fires once.
let lastStatuses = new Map();
// Kept so Download still works after teardown.
let lastResult = null;

let historyRecords = [];
let revisionSort = 'weakest';
const revisionStatuses = new Set();
const revisionSelected = new Set();

// --- View switching ---

function showCompose() {
  composeEl.hidden = false;
  statusEl.hidden = true;
  vivaEl.hidden = true;
  summaryEl.hidden = true;
  revisionEl.hidden = true;
  passageEl.focus();
}

function showStatus(message, detail = '', { error = false, back = false } = {}) {
  statusMessageEl.textContent = message;
  statusDetailEl.textContent = detail;
  statusEl.classList.toggle('is-error', error);
  statusBackEl.hidden = !back;
  composeEl.hidden = true;
  vivaEl.hidden = true;
  summaryEl.hidden = true;
  revisionEl.hidden = true;
  statusEl.hidden = false;
}

function showViva() {
  composeEl.hidden = true;
  statusEl.hidden = true;
  revisionEl.hidden = true;
  summaryEl.hidden = true;
  vivaEl.hidden = false;
}

function showSummary() {
  composeEl.hidden = true;
  statusEl.hidden = true;
  revisionEl.hidden = true;
  vivaEl.hidden = true;
  summaryEl.hidden = false;
}

function showRevision() {
  composeEl.hidden = true;
  statusEl.hidden = true;
  vivaEl.hidden = true;
  summaryEl.hidden = true;
  revisionEl.hidden = false;
}

// --- Compose state ---

function refreshCompose() {
  const length = passageEl.value.trim().length;
  countEl.textContent = `${length} character${length === 1 ? '' : 's'}`;
  countEl.classList.toggle('is-short', length > 0 && length < MIN_CHARS);
  submitEl.disabled = length < MIN_CHARS;

  // Only show the shortcut if it would actually change the box.
  useSelectionEl.hidden =
    pendingSelection.length < MIN_CHARS ||
    pendingSelection === passageEl.value.trim();
}

function setPassage(text) {
  passageEl.value = text;
  composeErrorEl.hidden = true;
  refreshCompose();
}

// --- Talking to the service worker ---

function ask(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      // Reading lastError silences the "unchecked runtime.lastError" warning
      // when the worker was asleep and the message never landed.
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });
}

// replace is true when the user explicitly asked for the highlight. On the
// passive path it's false, so it won't clobber whatever's already typed.
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

// --- Starting a viva ---

async function startViva() {
  const passage = passageEl.value.trim();

  if (passage.length < MIN_CHARS) {
    composeErrorEl.textContent = `Athena needs at least ${MIN_CHARS} characters, about a paragraph.`;
    composeErrorEl.hidden = false;
    return;
  }

  showStatus('Preparing your viva…', `${passage.length} characters.`);

  let sessionId;
  try {
    const response = await fetch(`${SERVER}/api/athena/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only attribute the passage to a page if it actually came from one,
      // otherwise the summary file ends up with the wrong title on it.
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

  await AthenaRevision.open({
    sessionId,
    title: passage === pendingSelection ? pendingSource.title : '',
    url: passage === pendingSelection ? pendingSource.url : '',
    passage,
  });

  await launch(sessionId);
}

// Check the mic up front. Chrome grants it per origin and the extension's
// origin isn't localhost's, so a fresh install needs one explicit grant.
// Finding that out halfway through a join just looks broken.
async function launch(sessionId) {
  if (!(await hasMicrophone())) {
    showStatus(
      'Athena needs your microphone.',
      'A tab has opened to ask for it. Grant it there, then press Start viva again.',
      { error: true, back: true },
    );
    await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    return;
  }

  vivaSessionId = sessionId;
  lastStatuses = new Map();
  lastResult = null;
  resetVivaView();
  showStatus('Waking Athena…', 'Joining the channel.');

  viva = createViva({ server: SERVER, sessionId, onEvent: onVivaEvent });

  try {
    await viva.start();
  } catch (error) {
    await viva.abort().catch(() => {});
    viva = null;
    showStatus('Could not start the viva.', error?.message ?? '', {
      error: true,
      back: true,
    });
    return;
  }

  startTracking();
}

// Queried rather than tested by opening a track: that would raise a prompt
// inside the panel, which is exactly where Chrome may refuse to show one.
async function hasMicrophone() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    if (status.state === 'granted') return true;
    if (status.state === 'denied') return false;
  } catch {
    // Not every Chrome exposes it, so fall back to the stored flag.
  }
  const stored = await chrome.storage.local.get('athena:mic-granted');
  return Boolean(stored['athena:mic-granted']);
}

// --- Revision ---

// Mirror the map into the history record while the viva runs. Waiting for the
// end would lose every session the user walks away from halfway.
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

// Loads history, refreshes it, repaints. Never throws: this runs during init
// and a broken revision list shouldn't take the compose box down with it.
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

// Badge count: topics that still need another look.
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

    // Whole row is clickable; a 14px checkbox is a pain to hit in a 380px panel.
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

// Starts a fresh viva on the selected topics. The passage is rebuilt from the
// sessions they came from so Athena examines the same material again, and
// focusTopics tells the prompt this is a second sitting.
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

  await AthenaRevision.open({ sessionId, title: 'Revision', url: '', passage });
  revisionSelected.clear();
  await launch(sessionId);
}

// Download the revision list as markdown.
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

// --- Wiring ---

passageEl.addEventListener('input', () => {
  composeErrorEl.hidden = true;
  refreshCompose();
});

// Ctrl/Cmd+Enter to start.
passageEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !submitEl.disabled) {
    event.preventDefault();
    startViva();
  }
});

submitEl.addEventListener('click', startViva);
statusBackEl.addEventListener('click', showCompose);
// --- Rendering the running viva ---

const ORB_FOR = {
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

const STATE_LABEL = {
  listening: 'Listening. Answer out loud.',
  thinking: 'Thinking…',
  speaking: 'Athena is speaking. Cut in whenever you like.',
};

function resetVivaView() {
  vivaClockEl.textContent = '00:00';
  vivaStateEl.textContent = 'Connecting…';
  vivaOrbEl.dataset.state = 'offline';
  vivaCaptionEl.textContent = '';
  vivaTranscriptEl.replaceChildren();
  vivaWarningEl.hidden = true;
  vivaTypedEl.value = '';
  vivaMicEl.textContent = 'Mute';
  vivaWeakEl.disabled = true;
  renderMap([], null);
}

// Rebuilt from scratch every time. Cheap for six chips and avoids a pile of
// diffing bugs. lastStatuses is the one bit of history worth keeping, for the
// recovery animation.
function renderMap(topics, outsideAsk) {
  const settled = topics.filter(
    (t) => t.status !== 'unattempted' && t.status !== 'active',
  ).length;

  mapCountEl.textContent = topics.length ? `${settled}/${topics.length}` : '';
  mapEmptyEl.hidden = topics.length > 0;
  mapChipsEl.replaceChildren();

  for (const topic of topics) {
    const previous = lastStatuses.get(topic.name);
    const recovered =
      (previous === 'wrong' || previous === 'partial') && topic.status === 'correct';

    const chip = document.createElement('span');
    chip.className = recovered ? 'chip is-redeeming' : 'chip';
    chip.dataset.status = topic.status;
    chip.title = topic.name;

    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    chip.append(dot, document.createTextNode(topic.name));

    if (topic.redeemed) {
      const mark = document.createElement('span');
      mark.title = 'Recovered on a second attempt';
      mark.textContent = '✓';
      chip.append(mark);
    }

    mapChipsEl.append(chip);
    lastStatuses.set(topic.name, topic.status);
  }

  if (outsideAsk) {
    mapOutsideEl.textContent = `◇ ${outsideAsk} is outside this passage. Athena said so rather than guessing, so it is not judged.`;
    mapOutsideEl.hidden = false;
  }

  vivaWeakEl.disabled = !topics.some(
    (t) => t.status === 'wrong' || t.status === 'partial',
  );
}

function renderTranscript(turns) {
  vivaTranscriptEl.replaceChildren();

  for (const turn of turns) {
    const item = document.createElement('li');
    item.className = turn.live ? 'turn is-live' : 'turn';

    const who = document.createElement('div');
    who.className = 'turn-who';
    who.textContent = turn.role === 'athena' ? 'Athena' : 'You';

    const text = document.createElement('div');
    text.className = 'turn-text';
    text.textContent = turn.text;

    item.append(who, text);
    vivaTranscriptEl.append(item);
  }

  // Stick to the bottom.
  vivaTranscriptEl.scrollTop = vivaTranscriptEl.scrollHeight;

  const latest = [...turns].reverse().find((t) => t.role === 'athena');
  vivaCaptionEl.textContent = latest?.text ?? '';
}

function onVivaEvent(event) {
  switch (event.type) {
    case 'phase':
      if (event.phase === 'live') {
        vivaStateEl.textContent = 'Connected.';
        showViva();
      } else if (event.detail) {
        showStatus('Waking Athena…', event.detail);
      }
      break;

    case 'state':
      vivaOrbEl.dataset.state = ORB_FOR[event.state] ?? 'offline';
      vivaStateEl.textContent = STATE_LABEL[event.state] ?? 'Connected.';
      break;

    case 'agent':
      if (!event.connected) vivaOrbEl.dataset.state = 'offline';
      break;

    case 'topics':
      renderMap(event.topics, event.outsideAsk);
      break;

    case 'transcript':
      renderTranscript(event.turns);
      break;

    case 'elapsed': {
      const total = Math.floor(event.ms / 1000);
      vivaClockEl.textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      break;
    }

    case 'warning':
      vivaWarningEl.textContent = event.message;
      vivaWarningEl.hidden = false;
      break;

    case 'ended':
      renderSummary(event.result);
      break;
  }
}

// The end screen. Rendered from the same recorded topic state as the markdown
// download, not from a closing model call, so the two can't disagree.
const SUMMARY_OUTCOME = {
  strong: { label: 'Solid', status: 'correct', fill: 1 },
  recovered: { label: 'Recovered', status: 'correct', fill: 1 },
  shaky: { label: 'Shaky', status: 'partial', fill: 0.5 },
  weak: { label: 'Needs work', status: 'wrong', fill: 0.16 },
  untouched: { label: 'Not covered', status: 'unattempted', fill: 0 },
};

const SUMMARY_CANVAS = { width: 360, height: 250 };

function groupSummaryTopics(topics) {
  const strong = topics.filter((t) => t.status === 'correct' && !t.redeemed);
  const recovered = topics.filter((t) => t.redeemed);
  const shaky = topics.filter((t) => t.status === 'partial');
  const weak = topics.filter((t) => t.status === 'wrong');
  const untouched = topics.filter(
    (t) => t.status === 'unattempted' || t.status === 'active',
  );

  return {
    strong,
    recovered,
    shaky,
    weak,
    untouched,
    revisionOrder: [...weak, ...shaky, ...recovered, ...untouched],
  };
}

function summaryBubbleSize(topic) {
  const extra = Math.min(18, Math.max(0, topic.name.length - 8) * 1.5);
  return 48 + extra;
}

function layoutSummaryBubbles(items) {
  const { width, height } = SUMMARY_CANVAS;
  const centerX = width / 2;
  const centerY = height / 2;
  const sorted = [...items].sort(
    (a, b) => summaryBubbleSize(b.topic) - summaryBubbleSize(a.topic),
  );
  const placed = [];
  const density = items.length > 42 ? 0.76 : items.length > 26 ? 0.86 : 1;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const size = summaryBubbleSize(item.topic) * density;
    let best = { x: centerX - size / 2, y: centerY - size / 2 };

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

    placed.push({ ...item, x: best.x, y: best.y, size });
  }

  const byId = new Map(placed.map((bubble) => [bubble.id, bubble]));
  return items.map((item) => byId.get(item.id) ?? { ...item, x: 0, y: 0, size: 48 });
}

function renderSummaryBubbleCloud(items) {
  const cloud = document.createElement('section');
  cloud.className = 'summary-cloud';
  cloud.setAttribute('aria-label', 'Topic outcome bubble map');

  const answered = items.filter((item) => item.outcome !== 'untouched').length;
  const centre = document.createElement('div');
  centre.className = 'summary-cloud-centre';
  centre.innerHTML = `<span>Topics</span><strong>${answered}<em>/ ${items.length}</em></strong>`;
  cloud.append(centre);

  for (const bubble of layoutSummaryBubbles(items)) {
    const outcome = SUMMARY_OUTCOME[bubble.outcome];
    const node = document.createElement('span');
    node.className = 'summary-bubble';
    node.dataset.outcome = bubble.outcome;
    node.title = `${bubble.topic.name}: ${outcome.label}`;
    node.style.left = `${(bubble.x / SUMMARY_CANVAS.width) * 100}%`;
    node.style.top = `${(bubble.y / SUMMARY_CANVAS.height) * 100}%`;
    node.style.width = `${(bubble.size / SUMMARY_CANVAS.width) * 100}%`;
    node.style.setProperty('--fill', `${outcome.fill * 100}%`);
    node.style.zIndex = bubble.outcome === 'weak' || bubble.outcome === 'shaky' ? '12' : '8';

    const label = document.createElement('span');
    label.className = 'summary-bubble-label';
    label.textContent = bubble.topic.name;
    node.append(label);

    if (bubble.topic.redeemed) {
      const mark = document.createElement('span');
      mark.className = 'summary-bubble-mark';
      mark.textContent = '↻';
      node.append(mark);
    }

    cloud.append(node);
  }

  return cloud;
}

function renderSummaryFocusList(groups) {
  const section = document.createElement('section');
  section.className = 'summary-focus';

  const title = document.createElement('div');
  title.className = 'label';
  title.textContent = groups.revisionOrder.length ? 'Focus next' : 'All clear';
  section.append(title);

  if (!groups.revisionOrder.length) {
    const done = document.createElement('p');
    done.className = 'summary-note';
    done.textContent = 'Everything landed first time. Try a harder passage next.';
    section.append(done);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'summary-focus-list';
  groups.revisionOrder.slice(0, 6).forEach((topic) => {
    const item = document.createElement('li');
    item.textContent = topic.name;
    list.append(item);
  });
  section.append(list);

  if (groups.revisionOrder.length > 6) {
    const more = document.createElement('p');
    more.className = 'summary-note';
    more.textContent = `+ ${groups.revisionOrder.length - 6} more in the downloaded file.`;
    section.append(more);
  }

  return section;
}

function renderSummary(result) {
  lastResult = result;

  const topics = result?.topics ?? [];
  const groups = groupSummaryTopics(topics);
  const understood = topics.filter((t) => t.status === 'correct').length;
  const recovered = topics.filter((t) => t.redeemed).length;
  const open = topics.filter(
    (t) => t.status === 'wrong' || t.status === 'partial',
  ).length;
  const bubbleItems = [
    ...groups.weak.map((topic) => ({ topic, outcome: 'weak' })),
    ...groups.shaky.map((topic) => ({ topic, outcome: 'shaky' })),
    ...groups.recovered.map((topic) => ({ topic, outcome: 'recovered' })),
    ...groups.strong.map((topic) => ({ topic, outcome: 'strong' })),
    ...groups.untouched.map((topic) => ({ topic, outcome: 'untouched' })),
  ].map((item, id) => ({ ...item, id }));

  summaryCountsEl.textContent = `${understood} understood · ${recovered} recovered · ${open} to revise`;
  summaryBodyEl.replaceChildren();

  if (!topics.length) {
    const empty = document.createElement('p');
    empty.className = 'summary-note';
    empty.textContent = result?.error ?? 'No topic map was produced.';
    summaryBodyEl.append(empty);
  } else {
    summaryBodyEl.append(
      renderSummaryBubbleCloud(bubbleItems),
      renderSummaryFocusList(groups),
    );
  }

  summaryDownloadEl.disabled = !result?.markdown;
  showSummary();
}

async function endViva() {
  if (!viva) return showCompose();
  vivaEndEl.disabled = true;
  vivaEndEl.textContent = 'Wrapping up…';
  try {
    await viva.end();
  } finally {
    viva = null;
    stopTracking();
    vivaEndEl.disabled = false;
    vivaEndEl.textContent = 'End viva & get summary';
    if (vivaSessionId) await AthenaRevision.close(vivaSessionId);
    await refreshRevision({ reconcile: false });
  }
}

vivaEndEl.addEventListener('click', endViva);

vivaMicEl.addEventListener('click', async () => {
  if (!viva) return;
  const enabled = await viva.toggleMic();
  vivaMicEl.textContent = enabled ? 'Mute' : 'Unmute';
});

vivaWeakEl.addEventListener('click', () => viva?.focusWeak());

vivaSendEl.addEventListener('click', () => {
  const text = vivaTypedEl.value.trim();
  if (!text || !viva) return;
  viva.say(text);
  vivaTypedEl.value = '';
});

vivaTypedEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') vivaSendEl.click();
});

vivaWatchEl.addEventListener('click', async () => {
  if (!vivaSessionId) return;
  try {
    await navigator.clipboard.writeText(`${SERVER}/watch/${vivaSessionId}`);
    vivaWatchEl.textContent = 'Link copied';
    setTimeout(() => (vivaWatchEl.textContent = 'Watch link'), 2000);
  } catch {
    vivaWatchEl.textContent = `${SERVER}/watch/${vivaSessionId}`;
  }
});

summaryDownloadEl.addEventListener('click', () => {
  if (!lastResult?.markdown) return;
  const blob = new Blob([lastResult.markdown], { type: 'text/markdown' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `athena-viva-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(href);
});

summaryDoneEl.addEventListener('click', showCompose);
summaryAgainEl.addEventListener('click', () => {
  setPassage('');
  showCompose();
});

useSelectionEl.addEventListener('click', async () => {
  // Re-read the page: the stash may predate what's highlighted now.
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
  // "Not covered" should also catch the topic Athena is on right now, since
  // nothing has been judged there either.
  if (status === 'unattempted') {
    if (pressed) revisionStatuses.delete('active');
    else revisionStatuses.add('active');
  }
  renderRevision();
});

revisionReviseEl.addEventListener('click', reviseSelected);
revisionExportEl.addEventListener('click', exportRevision);

// Two presses instead of a confirm() dialog, which isn't dependable in a side
// panel. This wipes every recorded viva and there's no undo.
let clearArmed = null;

revisionClearEl.addEventListener('click', async () => {
  if (clearArmed === null) {
    revisionClearEl.textContent = 'Really clear everything?';
    clearArmed = setTimeout(() => {
      revisionClearEl.textContent = 'Clear history';
      clearArmed = null;
    }, 4000);
    return;
  }

  clearTimeout(clearArmed);
  clearArmed = null;
  revisionClearEl.textContent = 'Clear history';

  await AthenaRevision.clear();
  revisionSelected.clear();
  await refreshRevision({ reconcile: false });
});

// Panel is going away. A viva holds a mic and a billed agent, neither of which
// is useful without a screen. pagehide, not beforeunload: the panel isn't a
// document Chrome prompts about, and pagehide is the last event that fires.
window.addEventListener('pagehide', () => {
  if (!viva) return;
  const agentId = viva.agentId;
  viva.abort().catch(() => {});
  if (agentId) {
    // A normal fetch won't survive the page going away.
    navigator.sendBeacon?.(
      `${SERVER}/api/athena/stop`,
      new Blob([JSON.stringify({ agent_id: agentId })], {
        type: 'application/json',
      }),
    );
  }
});

// Clicking the icon again while the panel is open re-stashes the selection;
// without this the panel would keep showing what it read on mount. A running
// viva is left alone.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes['athena:selection']) return;
  if (!vivaEl.hidden || !summaryEl.hidden) return;
  adoptSelection(changes['athena:selection'].newValue, { replace: false });
  showCompose();
});

(async function init() {
  showCompose();
  refreshCompose();
  adoptSelection(await ask({ type: 'athena:get-selection' }), { replace: false });
  // After the compose view is usable: the badge shouldn't delay the textarea.
  await refreshRevision();
})();
