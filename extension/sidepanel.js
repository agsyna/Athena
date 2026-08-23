/**
 * Athena side panel.
 *
 * Pasting a passage is the primary input. Highlighting a page and clicking the
 * Athena icon is an accelerator that pre-fills the box — never the only way in.
 *
 * That split exists because a page selection is fragile: it can be collapsed by
 * the time the panel asks for it, the panel cannot re-read the page on its own,
 * and Chrome refuses injection entirely on internal pages and the built-in PDF
 * viewer. A textarea always works.
 *
 * Everything voice-related lives in the Athena app, which this panel embeds, so
 * this file never has to duplicate the Agora client wiring.
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

const frameEl = document.getElementById('viva');

/** Most recent capture offered by the service worker, if any. */
let pendingSelection = '';
/** Page title and URL for that capture, used to label the summary file. */
let pendingSource = { title: '', url: '' };

// ── View switching ────────────────────────────────────────────────────────────

function showCompose() {
  composeEl.hidden = false;
  statusEl.hidden = true;
  frameEl.hidden = true;
  passageEl.focus();
}

function showStatus(message, detail = '', { error = false, back = false } = {}) {
  statusMessageEl.textContent = message;
  statusDetailEl.textContent = detail;
  statusEl.classList.toggle('is-error', error);
  statusBackEl.hidden = !back;
  composeEl.hidden = true;
  statusEl.hidden = false;
  frameEl.hidden = true;
}

function showViva(sessionId) {
  frameEl.src = `${SERVER}/viva?s=${encodeURIComponent(sessionId)}`;
  composeEl.hidden = true;
  statusEl.hidden = true;
  frameEl.hidden = false;
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

function ask(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (response) => {
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

    showViva(data.session_id);
  } catch {
    showStatus(
      'Athena server is not reachable.',
      `Run "pnpm dev" in the quickstart folder, then try again. Expected at ${SERVER}.`,
      { error: true, back: true },
    );
  }
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

useSelectionEl.addEventListener('click', async () => {
  // Re-read the page rather than trusting the stash: the earlier capture may
  // predate whatever the student has highlighted since.
  const fresh = await ask('athena:recapture');
  if (adoptSelection(fresh, { replace: true })) return;

  composeErrorEl.textContent =
    'Nothing long enough is highlighted on the page right now. Paste the passage instead.';
  composeErrorEl.hidden = false;
});

/**
 * A fresh icon click while the panel is already open re-stashes the selection.
 * Without this listener the panel would keep showing whatever it read when it
 * first mounted — the bug that made "Try again" useless.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes['athena:selection']) return;
  const next = changes['athena:selection'].newValue;
  // Only the compose view should ever be reshaped underneath the student.
  if (frameEl.hidden) {
    adoptSelection(next, { replace: false });
    if (statusEl.hidden === false && !statusEl.classList.contains('is-error')) return;
    showCompose();
  }
});

(async function init() {
  showCompose();
  refreshCompose();
  adoptSelection(await ask('athena:get-selection'), { replace: false });
})();
