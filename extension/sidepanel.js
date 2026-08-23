/**
 * Athena side panel.
 *
 * Thin by design: it collects the highlighted passage, exchanges it for a
 * session id with the Athena server, and hands the rest over to the viva app in
 * an iframe. Everything voice-related — RTC, RTM, the transcript toolkit, the
 * understanding map — lives in that app, so this panel never has to duplicate
 * the Agora client wiring or fight the extension CSP over SDK bundles.
 */

const SERVER = 'http://localhost:3000';
const MIN_CHARS = 80;

const stateEl = document.getElementById('state');
const messageEl = document.getElementById('state-message');
const detailEl = document.getElementById('state-detail');
const retryEl = document.getElementById('retry');
const frameEl = document.getElementById('viva');

function show(message, detail = '', { error = false, retry = false } = {}) {
  messageEl.textContent = message;
  detailEl.textContent = detail;
  stateEl.classList.toggle('is-error', error);
  retryEl.hidden = !retry;
  stateEl.hidden = false;
  frameEl.hidden = true;
}

function launch(sessionId) {
  frameEl.src = `${SERVER}/viva?s=${encodeURIComponent(sessionId)}`;
  stateEl.hidden = true;
  frameEl.hidden = false;
}

function getSelection() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'athena:get-selection' }, (response) => {
      // Reading lastError suppresses the "unchecked runtime.lastError" noise
      // when the service worker was asleep and the send failed.
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });
}

async function start() {
  show('Reading your selection…');

  const selection = await getSelection();

  if (!selection) {
    show(
      'Nothing to examine yet.',
      'Highlight a passage on the page, then click the Athena icon again.',
      { retry: true },
    );
    return;
  }

  if (!selection.injectable) {
    show(
      "Athena can't read this page.",
      'Chrome blocks extensions on internal pages, the Web Store, and the built-in PDF viewer. Try a normal web page, or select the text and use the right-click menu.',
      { error: true, retry: true },
    );
    return;
  }

  const passage = (selection.text ?? '').trim();

  if (passage.length < MIN_CHARS) {
    show(
      passage.length === 0 ? 'Nothing highlighted.' : 'That selection is a bit short.',
      `Highlight at least ${MIN_CHARS} characters — roughly a paragraph — then click the Athena icon again.`,
      { retry: true },
    );
    return;
  }

  show('Preparing your viva…', `${passage.length} characters selected.`);

  try {
    const response = await fetch(`${SERVER}/api/athena/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passage,
        sourceTitle: selection.title,
        sourceUrl: selection.url,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      show('Athena could not take that passage.', data.error ?? '', {
        error: true,
        retry: true,
      });
      return;
    }

    launch(data.session_id);
  } catch {
    show(
      'Athena server is not reachable.',
      `Start it with "pnpm dev" in the quickstart folder, then try again. Expected at ${SERVER}.`,
      { error: true, retry: true },
    );
  }
}

retryEl.addEventListener('click', () => {
  start().catch(() => show('Something went wrong.', '', { error: true, retry: true }));
});

start().catch(() => show('Something went wrong.', '', { error: true, retry: true }));
