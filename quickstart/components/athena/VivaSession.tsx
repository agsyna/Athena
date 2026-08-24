'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  ChatMessagePriority,
  ChatMessageType,
  TranscriptHelperMode,
  TurnStatus,
  type AgentTranscription,
  type TranscriptHelperItem,
  type UserTranscription,
} from 'agora-agent-client-toolkit';
import type { RTMClient } from 'agora-rtm';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { normalizeTranscript } from '@/lib/conversation';
import { applyControl, parseTurn } from '@/lib/athena/parse';
import { KICKOFF_MESSAGE, KICKOFF_PREFIX } from '@/lib/athena/prompt';
import type { Topic, TranscriptTurn } from '@/lib/athena/types';
import { UnderstandingMap } from './UnderstandingMap';

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

export interface VivaSessionProps {
  sessionId: string;
  sourceTitle?: string;
  agoraData: { token: string; uid: string; channel: string; agentId?: string };
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<{ rtcToken: string; rtmToken: string }>;
  /**
   * Hands the finished session up. The summary has to be rendered by something
   * that survives teardown, since this unmounts as soon as RTM is released.
   */
  onEnd: (result: VivaResult) => void;
}

export interface VivaResult {
  markdown: string | null;
  downloadUrl: string | null;
  topics: Topic[];
  error: string | null;
}

type OrbState = 'offline' | 'listening' | 'thinking' | 'speaking';

function orbStateFor(
  agentState: AgentState | null,
  isAgentConnected: boolean,
  connectionState: string,
): OrbState {
  if (!isAgentConnected || connectionState !== 'CONNECTED') return 'offline';
  switch (agentState) {
    case 'speaking':
      return 'speaking';
    case 'thinking':
      return 'thinking';
    case 'listening':
      return 'listening';
    default:
      return 'listening';
  }
}

const ORB_CAPTION: Record<OrbState, string> = {
  offline: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Athena is speaking, cut in any time',
};

export default function VivaSession({
  sessionId,
  sourceTitle,
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEnd,
}: VivaSessionProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const agentUID = String(DEFAULT_AGENT_UID);

  const [micEnabled, setMicEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('CONNECTING');
  const [joinedUID, setJoinedUID] = useState<UID>(0);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  // Last thing asked about that the passage doesn't cover. Athena declines it
  // out loud, but speech is gone the moment it's said, so keep it on screen.
  const [outsideAsk, setOutsideAsk] = useState<string | null>(null);
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);

  const aiRef = useRef<AgoraVoiceAI | null>(null);
  // State as well as the ref, so effects waiting on the toolkit get a render.
  const [aiReady, setAiReady] = useState(false);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Payloads already applied. Keyed by turn plus payload, so the same judgement
  // arriving twice (mid-turn and again on the final text) can't double-count.
  const appliedControls = useRef<Set<string>>(new Set());

  // RTC join, same StrictMode-safe pattern as the quickstart. StrictMode fires
  // cleanup synchronously before any setTimeout callback, so only the real
  // mount's timer survives and useJoin runs once.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  // Don't gate this on micEnabled, that ties track lifetime to mute state.
  // Mute goes through track.setEnabled().
  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(isReady);
  usePublish([localMicrophoneTrack]);

  // Auto-starting from the panel means there's no user gesture in this
  // document, and Chrome can refuse the mic without ever prompting. This button
  // supplies the gesture, then reloads so the track is made with the grant.
  const [micRetryFailed, setMicRetryFailed] = useState(false);
  const requestMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      window.location.reload();
    } catch {
      setMicRetryFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.('ENABLE_AUDIO_PTS', true);
    } catch {
      // Only affects word-level transcript timing, which Athena doesn't use.
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client?.uid !== null && client?.uid !== undefined) {
      setJoinedUID(client.uid);
    }
  }, [joinSuccess, client]);

  // --- Session clock ---
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, []);

  // --- Toolkit init ---
  useEffect(() => {
    if (!isReady || !joinSuccess) return;
    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {
            // Already torn down.
          }
          return;
        }

        aiRef.current = ai;
        setAiReady(true);

        // TRANSCRIPT_UPDATED sends the full history each time, so replace.
        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => setRawTranscript([...t]));
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => setAgentState(event.state));
        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (_, error) =>
          setPipelineError(`${error.type}: ${error.message}`),
        );
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (_, error) =>
          setPipelineError(error.message),
        );

        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          setPipelineError(
            error instanceof Error ? error.message : 'Could not connect to Athena.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      aiRef.current = null;
      setAiReady(false);
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {
        // Already destroyed.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  // --- Agent presence ---
  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });
  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });
  useEffect(() => {
    setIsAgentConnected(remoteUsers.some((u) => u.uid.toString() === agentUID));
  }, [remoteUsers, agentUID]);
  useClientEvent(client, 'connection-state-change', (state) => setConnectionState(state));

  // Audio comes over RTC, transcripts and control payloads over RTM. If RTM
  // dies the viva still sounds alive while the transcript stays empty and no
  // chip moves, so both signals below exist to make that visible.
  const [rtmDown, setRtmDown] = useState<string | null>(null);
  useEffect(() => {
    const onLinkState = (event: {
      currentState: string;
      reasonCode?: string;
    }) => {
      if (event.currentState === 'CONNECTED') {
        setRtmDown(null);
      } else if (
        event.currentState === 'FAILED' ||
        event.currentState === 'SUSPENDED' ||
        event.currentState === 'DISCONNECTED'
      ) {
        setRtmDown(event.reasonCode ?? event.currentState);
      }
    };

    // The typings go through an event map, but this is all this component needs.
    const client = rtmClient as unknown as {
      addEventListener: (name: string, fn: typeof onLinkState) => void;
      removeEventListener: (name: string, fn: typeof onLinkState) => void;
    };
    client.addEventListener('linkState', onLinkState);
    return () => client.removeEventListener('linkState', onLinkState);
  }, [rtmClient]);

  // Two failures look the same from the outside (an empty screen): the agent
  // never joined, or it joined and RTM is dead. Armed on aiReady alone. An
  // earlier version also required isAgentConnected, which meant the worse of
  // the two never armed the timer at all.
  const [rtmSilent, setRtmSilent] = useState(false);
  useEffect(() => {
    if (!aiReady) return;
    if (rawTranscript.length > 0 || agentState) {
      setRtmSilent(false);
      return;
    }
    const id = setTimeout(() => setRtmSilent(true), 18000);
    return () => clearTimeout(id);
  }, [aiReady, rawTranscript.length, agentState]);

  // --- Kick off the viva ---
  // The engine speaks a fixed greeting on join, but that can't carry the topic
  // list, so inject one system turn to get Athena talking.
  //
  // Both conditions have to be render-visible. Waiting on aiRef.current alone
  // silently never fired: the agent usually joins before the toolkit init
  // resolves, and a ref changing doesn't re-run an effect.
  //
  // APPEND rather than a timer, so the engine queues this behind the greeting
  // and there's no delay to guess at.
  const kickedOff = useRef(false);
  useEffect(() => {
    if (kickedOff.current || !aiReady || !isAgentConnected || !aiRef.current) return;
    kickedOff.current = true;

    let attempt = 0;
    const send = () => {
      aiRef.current
        ?.sendText(agentUID, {
          messageType: ChatMessageType.TEXT,
          text: KICKOFF_MESSAGE,
          priority: ChatMessagePriority.APPEND,
          responseInterruptable: true,
        })
        .catch(() => {
          // RTM can still be settling right after join, so retry once.
          if (attempt < 1) {
            attempt += 1;
            setTimeout(send, 1500);
          } else {
            setPipelineError(
              'Athena did not pick up the passage automatically. Say "I am ready" to start her off.',
            );
          }
        });
    };

    send();
  }, [aiReady, isAgentConnected, agentUID]);

  // --- Read the control channel ---
  const transcript = useMemo(
    () => normalizeTranscript(rawTranscript, String(client.uid)),
    [rawTranscript, client.uid],
  );

  useEffect(() => {
    const agentTurns = transcript.filter((item) => String(item.uid) === agentUID);
    if (agentTurns.length === 0) return;

    let pending = topics;
    let changed = false;
    let outside: string | null = null;

    for (const turn of agentTurns) {
      const text = typeof turn.text === 'string' ? turn.text : '';
      const { control } = parseTurn(text);
      if (!control) continue;

      const key = `${turn.turn_id}:${JSON.stringify(control)}`;
      if (appliedControls.current.has(key)) continue;
      appliedControls.current.add(key);

      if (typeof control.outside === 'string' && control.outside.trim()) {
        outside = control.outside.trim().slice(0, 40);
      }

      const { topics: next } = applyControl(pending, control);
      if (next !== pending) {
        pending = next;
        changed = true;
      }
    }

    if (changed) setTopics(pending);
    if (outside) setOutsideAsk(outside);
    // topics is left out on purpose: it comes in via `pending`, and including
    // it would re-run this effect on its own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, agentUID]);

  /** Transcript with control payloads stripped and the kickoff turn hidden. */
  const visibleTurns = useMemo((): (TranscriptTurn & { key: string; live: boolean })[] => {
    return transcript
      .map((item) => {
        const raw = typeof item.text === 'string' ? item.text : '';
        const isAgent = String(item.uid) === agentUID;
        const text = isAgent ? parseTurn(raw).spoken : raw;
        return {
          key: `${item.turn_id}-${item.uid}`,
          role: (isAgent ? 'athena' : 'student') as TranscriptTurn['role'],
          text,
          live: item.status === TurnStatus.IN_PROGRESS,
        };
      })
      .filter((t) => t.text.trim().length > 0 && !t.text.startsWith(KICKOFF_PREFIX));
  }, [transcript, agentUID]);

  const latestAthena = useMemo(
    () => [...visibleTurns].reverse().find((t) => t.role === 'athena'),
    [visibleTurns],
  );

  // --- Controls ---
  const handleMicToggle = useCallback(async () => {
    const next = !micEnabled;
    if (!localMicrophoneTrack) {
      setMicEnabled(next);
      return;
    }
    try {
      await localMicrophoneTrack.setEnabled(next);
      setMicEnabled(next);
    } catch {
      setPipelineError('Could not toggle the microphone.');
    }
  }, [micEnabled, localMicrophoneTrack]);

  // Speech is the point, but it isn't always usable: a noisy room, a misheard
  // acronym, or someone who'd rather type. Typed input goes down the same RTM
  // path, so it lands in the transcript and summary identically.
  const [typed, setTyped] = useState('');
  const handleTypedSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = typed.trim();
      if (!text || !aiRef.current) return;
      setTyped('');
      aiRef.current
        .sendText(agentUID, {
          messageType: ChatMessageType.TEXT,
          text,
          // Typing while she talks means the same thing as talking over her.
          priority: ChatMessagePriority.INTERRUPTED,
          responseInterruptable: true,
        })
        .catch(() => setPipelineError('Could not send that to Athena.'));
    },
    [typed, agentUID],
  );

  /** Barge-in button, for when talking over her isn't practical. */
  const handleInterrupt = useCallback(() => {
    aiRef.current?.interrupt(agentUID).catch(() => {
      // Best-effort. Speaking over her still works.
    });
  }, [agentUID]);

  /** Lets the student, not the model, spend the rest of the time on weak topics. */
  const weakTopics = useMemo(
    () => topics.filter((t) => t.status === 'wrong' || t.status === 'partial'),
    [topics],
  );

  const handleFocusWeak = useCallback(() => {
    if (weakTopics.length === 0) return;
    const names = weakTopics.map((t) => t.name).join(', ');
    aiRef.current
      ?.sendText(agentUID, {
        messageType: ChatMessageType.TEXT,
        text: `${KICKOFF_PREFIX} The student has asked you to go back over the topics they have not got yet: ${names}. Return to the first of those now and ask a different question about it than you asked before.`,
        priority: ChatMessagePriority.INTERRUPTED,
        responseInterruptable: true,
      })
      .catch(() => setPipelineError('Could not send that to Athena.'));
  }, [weakTopics, agentUID]);

  // Mirrors the map to the watch view and picks up anything a watcher asked
  // for, in one heartbeat. On a timer rather than on change, so a watcher who
  // opens the page mid-session sees the map without waiting for a judgement.
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const outsideRef = useRef(outsideAsk);
  outsideRef.current = outsideAsk;
  /** Latches on end, so an in-flight heartbeat can't reopen a closed viva. */
  const endedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const beat = async () => {
      if (endedRef.current) return;
      try {
        const res = await fetch('/api/athena/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            topics: topicsRef.current,
            outsideAsk: outsideRef.current ?? undefined,
            ended: false,
          }),
        });
        if (stopped || !res.ok) return;
        const data: { nudge?: { topic: string } | null } = await res.json();
        const topic = data.nudge?.topic;
        if (!topic) return;

        // Same injection path as the student's own "weak topics" button.
        aiRef.current
          ?.sendText(agentUID, {
            messageType: ChatMessageType.TEXT,
            text: `${KICKOFF_PREFIX} The student's tutor has asked you to return to "${topic}". Go back to it now and ask a different question about it than you asked before.`,
            priority: ChatMessagePriority.INTERRUPTED,
            responseInterruptable: true,
          })
          .catch(() => {
            // Not worth an error card mid-viva, they can press again.
          });
      } catch {
        // The watch channel is a nice-to-have, never break the viva over it.
      }
    };

    const id = setInterval(beat, 1500);
    void beat();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, agentUID]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(joinedUID.toString());
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
    } catch {
      setPipelineError('Session token could not be renewed, the viva may end shortly.');
    }
  }, [client, joinedUID, onTokenWillExpire, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEnd = useCallback(async () => {
    setEnding(true);
    endedRef.current = true;

    let markdown: string | null = null;
    let downloadUrl: string | null = null;
    let error: string | null = null;

    try {
      const response = await fetch('/api/athena/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          topics,
          transcript: visibleTurns
            .filter((t) => !t.live)
            .map(({ role, text }) => ({ role, text })),
          durationMs: Date.now() - startedAt.current,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        markdown = data.markdown;
        downloadUrl = data.download_url;
      } else {
        error = 'Your viva is over, but the summary could not be built.';
      }
    } catch {
      error = 'Your viva is over, but the summary could not be built.';
    }

    // Final publish so the watch page settles on "ended" and the revision
    // history records this as finished. Best-effort, the summary is already in.
    void fetch('/api/athena/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, topics, ended: true }),
    }).catch(() => {});

    onEnd({ markdown, downloadUrl, topics, error });
  }, [sessionId, topics, visibleTurns, onEnd]);

  const orb = orbStateFor(agentState, isAgentConnected, connectionState);
  const clock = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(
    Math.floor(elapsed / 1000) % 60,
  ).padStart(2, '0')}`;


  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="athena-mono text-[13px] font-semibold tracking-[0.16em]">
            ATHENA
          </span>
          <span
            className={`athena-badge ${
              pipelineError ? 'is-error' : isAgentConnected ? 'is-live' : 'is-idle'
            }`}
          >
            <span className="athena-badge-dot" aria-hidden />
            {pipelineError ? 'error' : isAgentConnected ? 'live' : 'connecting'}
          </span>
        </div>
        <span className="athena-mono text-[12px] text-[var(--athena-text-dim)]">
          {clock}
        </span>
      </header>

      {sourceTitle && (
        <p className="shrink-0 truncate text-[11px] text-[var(--athena-text-dim)]">
          Examining: {sourceTitle}
        </p>
      )}

      {/* Voice state */}
      <section
        className="athena-card flex shrink-0 flex-col items-center gap-2 px-3 py-4"
        aria-label="Athena voice status"
      >
        <div className="athena-orb" data-state={orb} role="img" aria-label={ORB_CAPTION[orb]}>
          <span className="athena-orb-ring" aria-hidden />
          <span className="athena-orb-core" aria-hidden />
        </div>
        <p className="athena-mono text-[10px] uppercase tracking-[0.14em] text-[var(--athena-text-dim)]">
          {ORB_CAPTION[orb]}
        </p>
        {latestAthena && (
          <p className="mt-1 text-center text-[13px] leading-snug text-[var(--athena-text)]">
            {latestAthena.text}
          </p>
        )}
        {remoteUsers.map((user) => (
          <div key={String(user.uid)} className="hidden">
            <RemoteUser user={user} />
          </div>
        ))}
      </section>

      <UnderstandingMap topics={topics} outsideAsk={outsideAsk} />

      <WatchLink sessionId={sessionId} />

      {/* Transcript */}
      <section
        className="athena-card athena-scroll min-h-0 flex-1 p-3"
        aria-label="Transcript"
        aria-live="polite"
      >
        {visibleTurns.length === 0 ? (
          <p className="text-xs text-[var(--athena-text-dim)]">
            Your conversation will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visibleTurns.map((turn) => (
              <li key={turn.key} className="text-[13px] leading-snug">
                <span
                  className="athena-mono mr-1.5 text-[10px] uppercase tracking-wider"
                  style={{
                    color:
                      turn.role === 'athena'
                        ? 'var(--athena-blue)'
                        : 'var(--athena-text-dim)',
                  }}
                >
                  {turn.role === 'athena' ? 'ATHENA' : 'YOU'}
                </span>
                <span className={turn.live ? 'opacity-60' : ''}>{turn.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(rtmDown || rtmSilent) && (
        <div
          role="alert"
          className="shrink-0 rounded-md border px-2.5 py-2 text-[11px]"
          style={{
            borderColor: 'var(--athena-amber)',
            background: 'var(--athena-amber-dim)',
            color: 'var(--athena-amber)',
          }}
        >
          <p className="mb-2 leading-snug">
            {isAgentConnected
              ? `Athena's voice is coming through, but her transcript is not. Agora's messaging connection did not establish${rtmDown ? ` (${rtmDown})` : ''}, so the map and captions cannot update.`
              : 'Athena never joined the channel. The session started but the agent did not arrive.'}{' '}
            Restarting usually clears it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border px-2.5 py-1.5 text-[11px]"
            style={{ borderColor: 'var(--athena-amber)' }}
          >
            Restart the viva
          </button>
        </div>
      )}

      {micError && (
        <div
          role="alert"
          className="shrink-0 rounded-md border px-2.5 py-2 text-[11px]"
          style={{
            borderColor: 'var(--athena-amber)',
            background: 'var(--athena-amber-dim)',
            color: 'var(--athena-amber)',
          }}
        >
          <p className="mb-2 leading-snug">
            {micRetryFailed
              ? 'Chrome is still blocking the microphone. Click the microphone icon in the address bar, choose Allow, then reload this window.'
              : 'Athena cannot hear you, the microphone was not granted.'}
          </p>
          {!micRetryFailed && (
            <button
              type="button"
              onClick={requestMicrophone}
              className="rounded-md border px-2.5 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--athena-amber)' }}
            >
              Allow microphone
            </button>
          )}
        </div>
      )}

      {pipelineError && (
        <p
          role="alert"
          className="shrink-0 rounded-md border px-2.5 py-2 text-[11px]"
          style={{
            borderColor: 'var(--athena-danger)',
            background: 'var(--athena-danger-dim)',
            color: 'var(--athena-danger)',
          }}
        >
          {pipelineError}
        </p>
      )}

      {/* Controls */}
      <footer className="flex shrink-0 flex-col gap-2">
        <form onSubmit={handleTypedSubmit} className="flex gap-2">
          <label className="sr-only" htmlFor="athena-typed">
            Type an answer instead of speaking
          </label>
          <input
            id="athena-typed"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={!aiReady}
            placeholder="Or type your answer…"
            autoComplete="off"
            className="athena-card min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[12px] text-[var(--athena-text)] placeholder:text-[var(--athena-text-dim)] focus:border-[var(--athena-blue)] focus:outline-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!aiReady || typed.trim().length === 0}
            className="athena-card px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-blue)] disabled:opacity-40"
          >
            Send
          </button>
        </form>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleMicToggle}
            aria-pressed={!micEnabled}
            className="athena-card flex-1 px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-blue)]"
            style={{ color: micEnabled ? 'var(--athena-text)' : 'var(--athena-amber)' }}
          >
            {micEnabled ? 'Mute' : 'Unmute'}
          </button>
          <button
            type="button"
            onClick={handleInterrupt}
            disabled={orb !== 'speaking'}
            className="athena-card flex-1 px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-blue)] disabled:opacity-40"
          >
            Cut in
          </button>
        </div>

        <button
          type="button"
          onClick={handleFocusWeak}
          disabled={weakTopics.length === 0}
          className="athena-card px-3 py-2 text-[12px] transition-colors hover:border-[var(--athena-amber)] disabled:opacity-40"
        >
          {weakTopics.length > 0
            ? `Go back over ${weakTopics.length} weak topic${weakTopics.length > 1 ? 's' : ''}`
            : 'No weak topics yet'}
        </button>

        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="rounded-[10px] border px-3 py-2 text-[12px] transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--athena-danger)', color: 'var(--athena-danger)' }}
        >
          {ending ? 'Wrapping up…' : 'End viva & get summary'}
        </button>

        <p className="text-center text-[10px] leading-tight text-[var(--athena-text-dim)]">
          Study aid, not a graded assessment. Athena can misjudge an answer.
        </p>
      </footer>
    </div>
  );
}

/** Copies a read-only watch link. One line, it isn't the point of the screen. */
function WatchLink({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const url = `${window.location.origin}/watch/${sessionId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard can be refused, but the link is on screen anyway.
      });
  }, [sessionId]);

  return (
    <button
      type="button"
      onClick={copy}
      className="athena-mono w-full text-left text-[10px] text-[var(--athena-text-dim)] hover:text-[var(--athena-text)]"
      title="Copy a read-only link a tutor can watch this on"
    >
      {copied ? 'watch link copied' : `watch link · /watch/${sessionId}`}
    </button>
  );
}
