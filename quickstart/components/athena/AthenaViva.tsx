'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { RTMClient } from 'agora-rtm';
import { ErrorBoundary } from '../ErrorBoundary';

const VivaSession = dynamic(() => import('./VivaSession'), { ssr: false });

// Browser-only RTC provider. useRef (not useMemo) so StrictMode's simulated
// unmount/remount cannot create a second RTC client.
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react');
    return {
      default: function Provider({ children }: { children: React.ReactNode }) {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        }
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>;
      },
    };
  },
  { ssr: false },
);

interface SessionData {
  passage: string;
  source_title?: string;
  source_url?: string;
}

interface AgoraData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

type Phase = 'loading' | 'ready' | 'starting' | 'live' | 'ended' | 'error';

export default function AthenaViva({
  sessionId,
  autoStart = false,
}: {
  sessionId: string | null;
  /** Skip the pre-call card — the student already pressed Start in the panel. */
  autoStart?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);

  // Warm the heavy browser-only modules while the student reads the pre-call
  // card, so pressing Start does not stall on a dynamic import.
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);


  useEffect(() => {
    if (!sessionId) {
      setError('No passage was handed over. Highlight some text and click the Athena icon again.');
      setPhase('error');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/athena/session?id=${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? 'Could not load that passage.');
          setPhase('error');
          return;
        }
        setSession(data);
        setPhase('ready');
      } catch {
        if (cancelled) return;
        setError('Could not reach the Athena server. Is it still running on localhost:3000?');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleStart = useCallback(async () => {
    if (!sessionId) return;
    setPhase('starting');
    setError(null);

    try {
      const tokenResponse = await fetch('/api/generate-agora-token');
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error ?? 'Token request failed');

      // Agent start and RTM login both depend only on the token, and RTM must
      // be logged in before VivaSession mounts so the toolkit can subscribe
      // immediately. Agent start is non-fatal — the panel still renders.
      const [agent, rtm] = await Promise.all([
        fetch('/api/athena/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: tokenData.uid,
            channel_name: tokenData.channel,
            session_id: sessionId,
          }),
        })
          .then(async (res) => (res.ok ? res.json() : null))
          .catch(() => null),

        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          // RTM identity must match the token subject, which is tokenData.uid.
          const rtm: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            tokenData.uid,
          );
          await rtm.login({ token: tokenData.token });
          await rtm.subscribe(tokenData.channel);
          return rtm;
        })(),
      ]);

      if (!agent) {
        setError('Athena could not join the channel. Check the server log and try again.');
        setPhase('error');
        return;
      }

      setRtmClient(rtm);
      setAgoraData({ ...tokenData, agentId: agent.agent_id });
      setPhase('live');
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not start the viva: ${err.message}`
          : 'Could not start the viva.',
      );
      setPhase('error');
    }
  }, [sessionId]);

  /**
   * Launched from the extension: the student already pressed "Start viva" in
   * the panel, so asking them to press a second identical button is friction,
   * not consent. Start as soon as the passage is in hand.
   *
   * `startedOnce` guards against React StrictMode's double effect invocation,
   * which would otherwise start two agents in the same channel.
   */
  const startedOnce = useRef(false);
  useEffect(() => {
    if (!autoStart || phase !== 'ready' || startedOnce.current) return;
    startedOnce.current = true;
    handleStart();
  }, [autoStart, phase, handleStart]);

  const handleTokenWillExpire = useCallback(
    async (uid: string) => {
      const channel = agoraData?.channel;
      if (!channel) throw new Error('Missing channel for token renewal');
      const [rtc, rtm] = await Promise.all([
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${agoraData.uid}`),
      ]);
      const [rtcData, rtmData] = await Promise.all([rtc.json(), rtm.json()]);
      if (!rtc.ok || !rtm.ok) throw new Error('Failed to generate renewal tokens');
      return { rtcToken: rtcData.token, rtmToken: rtmData.token };
    },
    [agoraData],
  );

  /**
   * Closing the window is a legitimate way to end a viva, and the unload path
   * is too short for a normal fetch. sendBeacon hands the request to the
   * browser to deliver after the page is gone, which stops the agent instead of
   * leaving it to idle out on billed minutes.
   */
  useEffect(() => {
    const agentId = agoraData?.agentId;
    if (!agentId) return;

    const stop = () => {
      navigator.sendBeacon(
        '/api/stop-conversation',
        new Blob([JSON.stringify({ agent_id: agentId })], { type: 'application/json' }),
      );
    };

    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, [agoraData?.agentId]);

  const handleEnd = useCallback(async () => {
    if (agoraData?.agentId) {
      await fetch('/api/stop-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agoraData.agentId }),
      }).catch(() => {
        // The agent also idles out on its own; a failed stop is not worth
        // blocking the summary the student is waiting for.
      });
    }
    rtmClient?.logout().catch(() => {});
    setRtmClient(null);
  }, [agoraData, rtmClient]);

  return (
    <div className="athena-root flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      {phase === 'loading' && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="athena-mono text-[11px] uppercase tracking-[0.14em] text-[var(--athena-text-dim)]">
            Loading passage…
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="athena-badge is-error">
            <span className="athena-badge-dot" aria-hidden />
            something went wrong
          </span>
          <p role="alert" className="text-[13px] leading-snug text-[var(--athena-text)]">
            {error}
          </p>
          {session && (
            <button
              type="button"
              onClick={handleStart}
              className="athena-card px-4 py-2 text-[12px] hover:border-[var(--athena-blue)]"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {(phase === 'ready' || phase === 'starting') && session && !autoStart && (
        <div className="athena-scroll flex min-h-0 flex-1 flex-col gap-4 p-4">
          <header>
            <h1 className="athena-mono text-[13px] font-semibold tracking-[0.16em]">
              ATHENA
            </h1>
            <p className="mt-1 text-[11px] text-[var(--athena-text-dim)]">
              A spoken viva on what you highlighted.
            </p>
          </header>

          <section className="athena-card athena-scroll max-h-40 shrink-0 p-3">
            {session.source_title && (
              <p className="athena-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-[var(--athena-text-dim)]">
                {session.source_title}
              </p>
            )}
            <p className="text-[12px] leading-relaxed text-[var(--athena-text-dim)]">
              {session.passage}
            </p>
          </section>

          <ul className="flex flex-col gap-1.5 text-[11px] leading-snug text-[var(--athena-text-dim)]">
            <li>· Athena asks; you answer out loud.</li>
            <li>· Cut in whenever you want — she will stop and listen.</li>
            <li>· The chips track what you have and have not got.</li>
          </ul>

          <button
            type="button"
            onClick={handleStart}
            disabled={phase === 'starting'}
            className="mt-auto shrink-0 rounded-[10px] px-4 py-2.5 text-[13px] font-medium transition-opacity disabled:opacity-60"
            style={{ background: 'var(--athena-blue)', color: '#08090d' }}
          >
            {phase === 'starting' ? 'Waking Athena…' : 'Start viva'}
          </button>

          <p className="text-center text-[10px] leading-tight text-[var(--athena-text-dim)]">
            Your microphone is used only for this session. Athena is a study aid,
            not a graded assessment.
          </p>
        </div>
      )}

      {autoStart && (phase === 'ready' || phase === 'starting') && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="athena-orb" data-state="thinking" role="img" aria-label="Waking Athena">
            <span className="athena-orb-ring" aria-hidden />
            <span className="athena-orb-core" aria-hidden />
          </div>
          <p className="athena-mono text-[11px] uppercase tracking-[0.14em] text-[var(--athena-text-dim)]">
            Waking Athena…
          </p>
          <p className="max-w-[30ch] text-[11px] leading-snug text-[var(--athena-text-dim)]">
            Allow the microphone when Chrome asks.
          </p>
        </div>
      )}

      {phase === 'live' && agoraData && rtmClient && sessionId && (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <p className="athena-mono text-[11px] text-[var(--athena-text-dim)]">
                Joining…
              </p>
            </div>
          }
        >
          <ErrorBoundary>
            <AgoraProvider>
              <VivaSession
                sessionId={sessionId}
                sourceTitle={session?.source_title}
                agoraData={agoraData}
                rtmClient={rtmClient}
                onTokenWillExpire={handleTokenWillExpire}
                onEnd={handleEnd}
              />
            </AgoraProvider>
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
}
