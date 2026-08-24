// The viva itself, running inside the side panel.
//
// This used to be a Next.js page in its own window. The problem was the
// microphone: a cross-origin iframe in a chrome-extension:// page is its own
// permission context, so a grant given to localhost doesn't carry over, and the
// prompt can't reliably be answered from the panel. Running it natively here
// drops the iframe, and the panel asks for the extension's own mic once.
//
// The App Certificate can't move: minting tokens and starting an agent are
// signed calls, and an extension is just files on disk. So a small localhost
// API is still there for tokens, agent start/stop and the summary.
//
// Port of components/athena/VivaSession.tsx, doing by hand what the
// agora-rtc-react hooks do there.

import { parseTurn, applyControl, createTopics } from './parse.js';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  ChatMessagePriority,
  ChatMessageType,
  TranscriptHelperMode,
  TurnStatus,
} from './vendor/agora-toolkit.mjs';

// Matches DEFAULT_AGENT_UID in quickstart/lib/agora.ts.
const AGENT_UID = '123456';

// Injected system turns carry this prefix so they stay out of the transcript.
const KICKOFF_PREFIX = '[athena:system]';
const KICKOFF_MESSAGE = `${KICKOFF_PREFIX} The student has joined and can hear you. Take your first turn.`;

// Nothing over RTM for this long means something broke, not that it's quiet.
const SILENCE_MS = 18000;
// How often the map is mirrored for the watch view.
const HEARTBEAT_MS = 1500;

// Some ASR output runs punctuation into the next word. From lib/conversation.ts.
function normalizeSpacing(text) {
  return text
    .replace(/([.!?])([A-Za-z])/g, '$1 $2')
    .replace(/,([A-Za-z])/g, ', $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// onEvent is the only way out of here. The panel renders from those events and
// never touches this state, which keeps the RTC lifecycle in one place.
export function createViva({ server, sessionId, onEvent }) {
  const emit = (type, payload) => {
    try {
      onEvent({ type, ...payload });
    } catch {
      // Don't let a broken renderer kill the RTC session.
    }
  };

  let rtc = null;
  let rtm = null;
  let ai = null;
  let micTrack = null;
  let agentId = null;
  let channel = null;
  let localUid = null;

  let topics = [];
  let outsideAsk = null;
  let transcript = [];
  let agentState = null;
  let agentConnected = false;
  let ended = false;
  let micEnabled = true;

  const appliedControls = new Set();
  const startedAt = Date.now();
  let silenceTimer = null;
  let heartbeat = null;
  let clock = null;

  // --- Transcript ---

  // TRANSCRIPT_UPDATED sends the full history every time, so replace, don't
  // append. The toolkit uses uid "0" for the local speaker, so remap it.
  function onTranscript(items) {
    transcript = items.map((item) => ({
      ...item,
      uid: item.uid === '0' ? String(localUid) : item.uid,
      text: typeof item.text === 'string' ? normalizeSpacing(item.text) : item.text,
    }));

    armSilenceWatchdog();
    applyControls();
    emit('transcript', { turns: visibleTurns() });
  }

  // What the user should see: control payloads stripped, kickoff turn hidden.
  function visibleTurns() {
    return transcript
      .map((item) => {
        const raw = typeof item.text === 'string' ? item.text : '';
        const isAgent = String(item.uid) === AGENT_UID;
        return {
          key: `${item.turn_id}-${item.uid}`,
          role: isAgent ? 'athena' : 'student',
          text: isAgent ? parseTurn(raw).spoken : raw,
          live: item.status === TurnStatus.IN_PROGRESS,
        };
      })
      .filter((t) => t.text.trim().length > 0 && !t.text.startsWith(KICKOFF_PREFIX));
  }

  // Applies every control payload not yet seen. Keyed on turn id plus
  // payload, because a streaming turn arrives many times and must only count
  // once, while a new judgement in a later turn still has to land.
  function applyControls() {
    let pending = topics;
    let changed = false;
    let outside = null;

    for (const item of transcript) {
      if (String(item.uid) !== AGENT_UID) continue;
      const { control } = parseTurn(typeof item.text === 'string' ? item.text : '');
      if (!control) continue;

      const key = `${item.turn_id}:${JSON.stringify(control)}`;
      if (appliedControls.has(key)) continue;
      appliedControls.add(key);

      if (typeof control.outside === 'string' && control.outside.trim()) {
        outside = control.outside.trim().slice(0, 40);
      }

      const { topics: next } = applyControl(pending, control);
      if (next !== pending) {
        pending = next;
        changed = true;
      }
    }

    if (changed) topics = pending;
    if (outside) outsideAsk = outside;
    if (changed || outside) emit('topics', { topics, outsideAsk });
  }

  // Two different failures look the same from the outside (an empty screen):
  // the agent never joined, or it joined and RTM is dead. Armed on connection
  // alone so the worse of the two still gets reported.
  function armSilenceWatchdog() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (transcript.length > 0 || agentState) return;
    silenceTimer = setTimeout(() => {
      emit('warning', {
        message: agentConnected
          ? 'Athena is connected but nothing is coming through. Check the server log.'
          : 'Athena has not joined the channel. Check the server log and try again.',
      });
    }, SILENCE_MS);
  }

  // --- Bootstrap ---

  async function start() {
    emit('phase', { phase: 'starting', detail: 'Getting a channel…' });

    const tokenRes = await fetch(`${server}/api/athena/token`);
    const token = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(token.error ?? 'Could not get an Agora token.');

    channel = token.channel;
    localUid = Number(token.uid);

    emit('phase', { phase: 'starting', detail: 'Waking Athena…' });

    // Both only need the token, so run them together. RTM has to be logged in
    // before the toolkit initialises or there's nothing to subscribe to.
    const [agent, rtmClient] = await Promise.all([
      fetch(`${server}/api/athena/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: token.uid,
          channel_name: channel,
          session_id: sessionId,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),

      (async () => {
        // RTM identity has to match the token subject.
        const client = new AgoraRTM.RTM(token.app_id, token.uid);
        await client.login({ token: token.token });
        await client.subscribe(channel);
        return client;
      })(),
    ]);

    rtm = rtmClient;

    if (!agent) {
      throw new Error('Athena could not join the channel. Check the server log.');
    }
    agentId = agent.agent_id;

    emit('phase', { phase: 'starting', detail: 'Joining…' });

    try {
      AgoraRTC.setParameter?.('ENABLE_AUDIO_PTS', true);
    } catch {
      // Only affects word-level transcript timing, which Athena doesn't use.
    }
    AgoraRTC.setLogLevel?.(4);

    rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    rtc.on('user-published', async (user, mediaType) => {
      if (mediaType !== 'audio') return;
      await rtc.subscribe(user, 'audio');
      user.audioTrack?.play();
    });
    rtc.on('user-joined', (user) => {
      if (String(user.uid) === AGENT_UID) {
        agentConnected = true;
        emit('agent', { connected: true });
      }
    });
    rtc.on('user-left', (user) => {
      if (String(user.uid) === AGENT_UID) {
        agentConnected = false;
        emit('agent', { connected: false });
      }
    });
    rtc.on('connection-state-change', (state) => emit('connection', { state }));

    await rtc.join(token.app_id, channel, token.token, localUid);

    micTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await rtc.publish([micTrack]);

    ai = await AgoraVoiceAI.init({
      rtcEngine: rtc,
      rtmConfig: { rtmEngine: rtm },
      renderMode: TranscriptHelperMode.TEXT,
      enableLog: false,
    });

    ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => onTranscript([...t]));
    ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => {
      agentState = event.state;
      armSilenceWatchdog();
      emit('state', { state: event.state });
    });
    ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (_, error) =>
      emit('warning', { message: `${error.type}: ${error.message}` }),
    );
    ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (_, error) =>
      emit('warning', { message: error.message }),
    );

    ai.subscribeMessage(channel);

    emit('phase', { phase: 'live', detail: '' });
    armSilenceWatchdog();

    clock = setInterval(
      () => emit('elapsed', { ms: Date.now() - startedAt }),
      1000,
    );
    heartbeat = setInterval(publish, HEARTBEAT_MS);
    void publish();

    // The engine speaks a fixed greeting on join, but that can't carry a topic
    // list. One injected turn gets Athena talking without waiting for the user.
    inject(KICKOFF_MESSAGE, ChatMessagePriority.APPEND);
  }

  // --- Talking to the agent ---

  function inject(text, priority = ChatMessagePriority.INTERRUPTED) {
    return ai
      ?.sendText(AGENT_UID, {
        messageType: ChatMessageType.TEXT,
        text,
        priority,
        responseInterruptable: true,
      })
      .catch(() => emit('warning', { message: 'Could not send that to Athena.' }));
  }

  // A typed answer goes down the same path as a spoken one.
  function say(text) {
    const clean = text.trim();
    if (!clean) return;
    inject(clean, ChatMessagePriority.INTERRUPTED);
  }

  // Spend the rest of the session on the topics that aren't landing.
  function focusWeak() {
    const weak = topics.filter((t) => t.status === 'wrong' || t.status === 'partial');
    if (weak.length === 0) return;
    inject(
      `${KICKOFF_PREFIX} The student has asked you to go back over the topics they have not got yet: ${weak
        .map((t) => t.name)
        .join(', ')}. Return to the first of those now and ask a different question about it than you asked before.`,
    );
  }

  async function toggleMic() {
    micEnabled = !micEnabled;
    try {
      await micTrack?.setEnabled(micEnabled);
    } catch {
      emit('warning', { message: 'Could not toggle the microphone.' });
    }
    emit('mic', { enabled: micEnabled });
    return micEnabled;
  }

  // --- Live mirror ---

  // Publishes the map for the watch view and picks up any waiting nudge.
  async function publish(final = false) {
    if (!sessionId) return;
    try {
      const res = await fetch(`${server}/api/athena/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          topics,
          outsideAsk: outsideAsk ?? undefined,
          ended: final,
        }),
      });
      if (!res.ok || final) return;
      const data = await res.json();
      const topic = data.nudge?.topic;
      if (!topic) return;
      inject(
        `${KICKOFF_PREFIX} The student's tutor has asked you to return to "${topic}". Go back to it now and ask a different question about it than you asked before.`,
      );
    } catch {
      // The watch channel is a nice-to-have, never break the viva over it.
    }
  }

  // --- Teardown ---

  // Fetches the summary before tearing the channel down, so a teardown failure
  // can't lose it.
  async function end() {
    if (ended) return null;
    ended = true;
    stopTimers();

    let markdown = null;
    let downloadUrl = null;
    let error = null;

    try {
      const res = await fetch(`${server}/api/athena/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          topics,
          transcript: visibleTurns()
            .filter((t) => !t.live)
            .map(({ role, text }) => ({ role, text })),
          durationMs: Date.now() - startedAt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        markdown = data.markdown;
        downloadUrl = data.download_url;
      } else {
        error = 'Your viva is over, but the summary could not be built.';
      }
    } catch {
      error = 'Your viva is over, but the summary could not be built.';
    }

    await publish(true);
    await teardown();

    const result = { markdown, downloadUrl, topics, error };
    emit('ended', { result });
    return result;
  }

  function stopTimers() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (heartbeat) clearInterval(heartbeat);
    if (clock) clearInterval(clock);
    silenceTimer = heartbeat = clock = null;
  }

  // Stop the agent first and on its own: a stranded agent bills minutes, while
  // a leaked local track only leaves the mic indicator lit until the panel goes.
  async function teardown() {
    stopTimers();

    if (agentId) {
      await fetch(`${server}/api/athena/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      }).catch(() => {});
      agentId = null;
    }

    try {
      ai?.unsubscribe();
      ai?.destroy();
    } catch {
      // Already gone.
    }
    ai = null;

    try {
      micTrack?.stop();
      micTrack?.close();
    } catch {
      // Already closed.
    }
    micTrack = null;

    try {
      await rtc?.leave();
    } catch {
      // Already left.
    }
    rtc = null;

    try {
      await rtm?.logout();
    } catch {
      // Already logged out.
    }
    rtm = null;
  }

  // Bail out without a summary: the panel closing, or a start that failed.
  async function abort() {
    ended = true;
    await teardown();
  }

  return {
    start,
    end,
    abort,
    say,
    focusWeak,
    toggleMic,
    get topics() {
      return topics;
    },
    get agentId() {
      return agentId;
    },
  };
}
