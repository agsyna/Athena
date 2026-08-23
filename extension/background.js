/**
 * Athena service worker.
 *
 * Its whole job is to capture what the student highlighted at the moment they
 * ask for a viva, and hand it to the side panel.
 *
 * The capture has to happen here rather than in the panel because `activeTab`
 * is granted in response to the user's click on the toolbar icon or context
 * menu, and the panel itself has no access to the page. The selection is parked
 * in session storage — it lives for the browser session only and never touches
 * disk.
 */

const SELECTION_KEY = 'athena:selection';
const CONTEXT_MENU_ID = 'athena-start-viva';

/** Runs in the page. Must be self-contained — it is serialised across contexts. */
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
    // Injection is refused on chrome:// pages, the Web Store, and the built-in
    // PDF viewer. The panel handles a null capture with a readable message.
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
      // Distinguishes "nothing was highlighted" from "this page cannot be read".
      injectable: capture !== null,
    },
  });
}

async function openViva(tab) {
  const capture = await captureFromTab(tab);
  await stash(capture, tab);
  // Must be called in the same turn as the user gesture.
  await chrome.sidePanel.open({ tabId: tab.id });
}

chrome.action.onClicked.addListener((tab) => {
  openViva(tab).catch((error) => console.error('[athena]', error));
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
  // The context menu hands us the selection directly, which also covers frames
  // where a scripting injection would return the parent document's selection.
  stash(
    {
      text: info.selectionText ?? '',
      title: tab.title ?? '',
      url: info.pageUrl ?? tab.url ?? '',
    },
    tab,
  )
    .then(() => chrome.sidePanel.open({ tabId: tab.id }))
    .catch((error) => console.error('[athena]', error));
});

/** The panel asks for the stashed selection as soon as it mounts. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'athena:get-selection') return false;
  chrome.storage.session.get(SELECTION_KEY).then((data) => {
    sendResponse(data[SELECTION_KEY] ?? null);
  });
  return true; // keep the channel open for the async response
});
