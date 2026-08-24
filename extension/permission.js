// Asks for the microphone once, on the extension's own origin. Opens a track
// and immediately stops it: the point is only to make Chrome show the prompt
// and remember the answer, since the side panel can't reliably raise one.

const grantEl = document.getElementById('grant');
const resultEl = document.getElementById('result');
const helpEl = document.getElementById('help');

async function request() {
  grantEl.disabled = true;
  resultEl.textContent = 'Waiting for Chrome…';
  helpEl.hidden = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Drop it straight away, otherwise the recording indicator stays lit.
    for (const track of stream.getTracks()) track.stop();

    await chrome.storage.local.set({ 'athena:mic-granted': true });
    resultEl.textContent =
      'Granted. You can close this tab and start a viva from the side panel.';
    grantEl.hidden = true;
  } catch (error) {
    grantEl.disabled = false;
    resultEl.textContent =
      error?.name === 'NotAllowedError'
        ? 'Chrome did not grant the microphone.'
        : `Could not open a microphone: ${error?.message ?? error}`;
    helpEl.hidden = false;
  }
}

grantEl.addEventListener('click', request);

// If it's already granted the prompt never appears, so just finish up.
(async () => {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    if (status.state === 'granted') await request();
  } catch {
    // Not every Chrome exposes microphone to the Permissions API. Falling
    // through to the button costs one click.
  }
})();
