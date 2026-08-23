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
import { SummaryPanel } from './SummaryPanel';

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

export interface VivaSessionProps {
  sessionId: string;
  sourceTitle?: string;
  agoraData: { token: string; uid: string; channel: string; agentId?: string };
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<{ rtcToken: string; rtmToken: string }>;
  onEnd: () => void;
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
  speaking: 'Athena is speaking — cut in any time',
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
  const [summary, setSummary] = useState<{ markdown: string; downloadUrl: string } | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);

  const aiRef = useRef<AgoraVoiceAI | null>(null);
  // State, not just the ref: effects that wait on the toolkit need a render to
  // react to it becoming available.
  const [aiReady, setAiReady] = useState(false);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Control payloads already folded into topic state. Keyed by turn plus payload
  // so the same judgement arriving twice — once mid-turn, once on the restored
  // final text — can never double-count an attempt.
  const appliedControls = useRef<Set<string>>(new Set());

  // ── RTC join, mirroring the quickstart's StrictMode-safe pattern ──────────
  // React StrictMode fires cleanup synchronously before any setTimeout callback,
  // so only the real mount's timer survives and useJoin joins exactly once.
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

  // Do NOT gate on micEnabled — that ties track lifetime to mute state.
  // Mute goes through track.setEnabled() only.
  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(isReady);
  usePublish([localMicrophoneTrack]);

  /**
   * Microphone recovery.
   *
   * When the viva is auto-started from the extension panel there is no user
   * gesture inside this document, and Chrome can refuse the microphone without
   * ever showing a prompt. This button supplies the gesture directly, then
   * reloads so the track is created with the permission already granted.
   */
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
      // Non-fatal: only affects word-level transcript timing, which Athena does not use.
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client?.uid !== null && client?.uid !== undefined) {
      setJoinedUID(client.uid);
    }
  }, [joinSuccess, client]);

  // ── Session clock ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Toolkit init ─────────────────────────────────────────────────────────
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
            // Instance already torn down.
          }
          return;
        }

        aiRef.current = ai;
        setAiReady(true);

        // TRANSCRIPT_UPDATED delivers the FULL history each time — replace, never append.
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

  // ── Agent presence ───────────────────────────────────────────────────────
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

  // ── Kick off the viva ────────────────────────────────────────────────────
  /**
   * The engine speaks a fixed greeting on join, but a fixed string cannot carry
   * the topic list. Injecting one system turn makes Athena take her first real
   * turn — topics plus opening question — without waiting for the student to
   * speak first.
   *
   * Both conditions must be render-visible. Waiting on `aiRef.current` alone
   * silently never fired: the agent usually joins before the async toolkit init
   * resolves, and a ref changing does not re-run an effect.
   *
   * APPEND rather than a timer: the engine queues the message behind whatever
   * the agent is currently saying, so the opening question cannot collide with
   * the greeting and there is no delay to guess at.
   */
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
          // RTM can still be settling immediately after join. Retry once before
          // telling the student to take the first move themselves.
          if (attempt < 1) {
            attempt += 1;
            setTimeout(send, 1500);
          } else {
            setPipelineError(
              'Athena did not pick up the passage automatically — say "I am ready" to start her off.',
            );
          }
        });
    };

    send();
  }, [aiReady, isAgentConnected, agentUID]);

  // ── Read the silent control channel ──────────────────────────────────────
  const transcript = useMemo(
    () => normalizeTranscript(rawTranscript, String(client.uid)),
    [rawTranscript, client.uid],
  );

  useEffect(() => {
    const agentTurns = transcript.filter((item) => String(item.uid) === agentUID);
    if (agentTurns.length === 0) return;

    let pending = topics;
    let changed = false;

    for (const turn of agentTurns) {
      const text = typeof turn.text === 'string' ? turn.text : '';
      const { control } = parseTurn(text);
      if (!control) continue;

      const key = `${turn.turn_id}:${JSON.stringify(control)}`;
      if (appliedControls.current.has(key)) continue;
      appliedControls.current.add(key);

      const { topics: next } = applyControl(pending, control);
      if (next !== pending) {
        pending = next;
        changed = true;
      }
    }

    if (changed) setTopics(pending);
    // `topics` is intentionally omitted: it is folded in via `pending`, and
    // including it would re-run this effect on its own output.
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

  // ── Controls ─────────────────────────────────────────────────────────────
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

  /**
   * Typed answers.
   *
   * Speech is the point of a viva, but it is not always available: a noisy
   * room, a mis-heard technical term, or a student who would rather write.
   * Typed input travels the same RTM path as speech, so Athena answers it the
   * same way and it lands in the transcript and the summary identically.
   */
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
          // Typing while Athena talks is the same intent as talking over her.
          priority: ChatMessagePriority.INTERRUPTED,
          responseInterruptable: true,
        })
        .catch(() => setPipelineError('Could not send that to Athena.'));
    },
    [typed, agentUID],
  );

  /** Barge-in from the UI, for when talking over Athena is impractical. */
  const handleInterrupt = useCallback(() => {
    aiRef.current?.interrupt(agentUID).catch(() => {
      // Interruption is best-effort; speaking over Athena still works.
    });
  }, [agentUID]);

  /**
   * Steers Athena back to what the student has not got yet. This is the
   * human-control lever: the student, not the model, decides to spend the
   * remaining time on weak topics.
   */
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

  const handleTokenWillExpire = useCallback(async () => {
    if (!joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(joinedUID.toString());
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
    } catch {
      setPipelineError('Session token could not be renewed — the viva may end shortly.');
    }
  }, [client, joinedUID, onTokenWillExpire, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEnd = useCallback(async () => {
    setEnding(true);
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
        setSummary({ markdown: data.markdown, downloadUrl: data.download_url });
      } else {
        setPipelineError('Could not build the summary, but your session is over.');
      }
    } catch {
      setPipelineError('Could not build the summary, but your session is over.');
    }
    onEnd();
  }, [sessionId, topics, visibleTurns, onEnd]);

  const orb = orbStateFor(agentState, isAgentConnected, connectionState);
  const clock = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(
    Math.floor(elapsed / 1000) % 60,
  ).padStart(2, '0')}`;

  if (summary) {
    return (
      <SummaryPanel
        markdown={summary.markdown}
        downloadUrl={summary.downloadUrl}
        topics={topics}
      />
    );
  }

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

      <UnderstandingMap topics={topics} />

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
              : 'Athena cannot hear you — the microphone was not granted.'}
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
