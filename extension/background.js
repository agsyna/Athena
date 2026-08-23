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

/**
 * Opens the viva in its own window, parked against the right edge of the
 * browser window the student is reading in.
 *
 * A window rather than a frame inside the panel: a cross-origin frame in a
 * chrome-extension:// page is a separate microphone permission context, so
 * Chrome neither inherits an existing grant for localhost nor reliably lets the
 * prompt be answered from the panel. A top-level window has neither problem.
 */
const VIVA_WINDOW = { width: 460, height: 860 };

async function openVivaWindow(url) {
  let placement = {};
  try {
    const current = await chrome.windows.getCurrent();
    if (current?.left != null && current?.width != null) {
      placement = {
        left: Math.max(0, current.left + current.width - VIVA_WINDOW.width - 24),
        top: Math.max(0, (current.top ?? 0) + 24),
      };
    }
  } catch {
    // Fall back to wherever Chrome wants to put it.
  }

  try {
    const win = await chrome.windows.create({
      url,
      type: 'popup',
      focused: true,
      ...VIVA_WINDOW,
      ...placement,
    });
    return { windowId: win.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Tell the panel when the viva window goes away, so it can offer a new passage
 * instead of pointing at a window that no longer exists.
 */
chrome.windows.onRemoved.addListener((windowId) => {
  chrome.runtime
    .sendMessage({ type: 'athena:window-closed', windowId })
    .catch(() => {
      // No panel listening; nothing to tell.
    });
});

/**
 * Panel messages.
 *
 * `get-selection` returns whatever was stashed at click time — what the panel
 * reads when it first mounts.
 *
 * `recapture` re-reads the live page instead. The panel uses it when the
 * student explicitly asks for the highlighted text, because the stash can be
 * older than what is currently selected. `activeTab` stays granted for the tab
 * once the student has clicked the icon, so this normally succeeds without a
 * fresh gesture; when it does not, the panel falls back to the textarea.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'athena:get-selection') {
    chrome.storage.session.get(SELECTION_KEY).then((data) => {
      sendResponse(data[SELECTION_KEY] ?? null);
    });
    return true; // keep the channel open for the async response
  }

  if (message?.type === 'athena:open-window') {
    openVivaWindow(message.url).then(sendResponse);
    return true;
  }

  if (message?.type === 'athena:focus-window') {
    chrome.windows
      .update(message.windowId, { focused: true, drawAttention: true })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
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
