// Service worker. Grabs whatever is highlighted when the user clicks the icon
// and stashes it for the side panel. It has to happen here: activeTab is only
// granted on the click, and the panel can't reach into the page itself.

const SELECTION_KEY = 'athena:selection';
const CONTEXT_MENU_ID = 'athena-start-viva';

// Injected into the page, so it can't close over anything out here.
function readSelection() {
  const selection = window.getSelection();
  return {
    text: selection ? selection.toString() : '',
    title: document.title,
    url: location.href,
  };
}

async function captureFromTab(tab) {
  if (!tab?.id) return null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readSelection,
    });
    return result?.result ?? null;
  } catch {
    // chrome:// pages, the Web Store and the PDF viewer refuse injection.
    return null;
  }
}

async function stash(capture, tab) {
  await chrome.storage.session.set({
    [SELECTION_KEY]: {
      text: capture?.text?.trim() ?? '',
      title: capture?.title ?? tab?.title ?? '',
      url: capture?.url ?? tab?.url ?? '',
      capturedAt: Date.now(),
      // Lets the panel tell "nothing highlighted" from "can't read this page".
      injectable: capture !== null,
    },
  });
}

// sidePanel.open() must run in the same tick as the click, and a single await
// spends the gesture. So: open first, capture after. Keeping the in-flight
// capture here lets get-selection wait for it instead of returning stale text.
let pendingStash = null;

function trackStash(work) {
  pendingStash = work.catch((error) => console.error('[athena]', error));
  return pendingStash;
}

// Call this before any await (see pendingStash).
function openPanel(tab) {
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((error) => console.error('[athena]', error));
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  openPanel(tab);
  trackStash(captureFromTab(tab).then((capture) => stash(capture, tab)));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Start an Athena viva on this',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  // The menu event carries the selection already, and gets it right in iframes.
  openPanel(tab);
  trackStash(
    stash(
      {
        text: info.selectionText ?? '',
        title: tab.title ?? '',
        url: info.pageUrl ?? tab.url ?? '',
      },
      tab,
    ),
  );
});

// get-selection: whatever was stashed on the click, read when the panel mounts.
// recapture: re-read the page now. The panel uses this when the user asks for
// the highlight explicitly, since the stash can be older than the selection.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'athena:get-selection') {
    (async () => {
      // The panel usually mounts before the capture finishes.
      await pendingStash;
      const data = await chrome.storage.session.get(SELECTION_KEY);
      sendResponse(data[SELECTION_KEY] ?? null);
    })();
    return true; // keep the channel open for the async response
  }

  if (message?.type === 'athena:recapture') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const capture = await captureFromTab(tab);
      if (capture) await stash(capture, tab);
      sendResponse(capture);
    })();
    return true;
  }

  return false;
});
