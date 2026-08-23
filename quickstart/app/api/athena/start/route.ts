import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agents';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { getSession, updateSession } from '@/lib/athena/store';
import { ATHENA_GREETING, buildAthenaPrompt } from '@/lib/athena/prompt';

/**
 * Starts the Athena viva agent.
 *
 * This is the quickstart's `/api/invite-agent` with three deliberate changes,
 * all of them documented join/config fields:
 *   1. `instructions` is built from the student's highlighted passage.
 *   2. `greeting` is Athena's, not Ada's.
 *   3. TTS runs with `skipPatterns: [5]`, so the engine strips `{ }` content
 *      before speech synthesis. That is what lets Athena report her judgement
 *      of each answer to the app without the student ever hearing it — the
 *      real-time transcript still restores the full text once a sentence
 *      finishes. See lib/athena/prompt.ts and lib/athena/parse.ts.
 *
 * The pipeline, token flow, VAD config, RTM flags, and lifecycle are the
 * sample's, unchanged.
 */

const agentUid = String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const body: {
      requester_id?: string;
      channel_name?: string;
      session_id?: string;
    } = await request.json();

    const { requester_id, channel_name, session_id } = body;

    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id || !session_id) {
      return NextResponse.json(
        { error: 'channel_name, requester_id and session_id are required' },
        { status: 400 },
      );
    }

    const session = getSession(session_id);
    if (!session) {
      return NextResponse.json(
        { error: 'That viva session has expired. Highlight your passage again.' },
        { status: 404 },
      );
    }

    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    const agent = new Agent({
      client,
      instructions: buildAthenaPrompt(
        session.passage,
        session.sourceTitle,
        session.focusTopics,
      ),
      greeting: ATHENA_GREETING,
      failureMessage: 'Give me one moment.',
      maxHistory: 50,
      // VAD tuned for a viva: the student is expected to cut in and challenge,
      // so interruption stays as responsive as the sample's default.
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160,
              prefix_padding_ms: 300,
            },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: {
              // A little longer than the sample's 480ms: students pause to
              // think mid-answer, and cutting them off reads as rude.
              silence_duration_ms: 700,
            },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_tools: false },
      parameters: {
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        new DeepgramSTT({
          model: 'nova-3',
          language: 'en',
        }),
      )
      .withLlm(
        new OpenAI({
          model: 'gpt-4o-mini',
          greetingMessage: ATHENA_GREETING,
          failureMessage: 'Give me one moment.',
          // A viva depends on Athena remembering which topics she already
          // judged, so she can circle back. This is the session memory.
          maxHistory: 40,
          params: {
            max_tokens: 1024,
            // Lower than the sample's 0.7: the control payload has to come out
            // in a fixed shape every turn, and examiner questions should be
            // pointed rather than florid.
            temperature: 0.4,
            top_p: 0.9,
          },
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
          // 5 = skip content in curly braces. This is the silent control channel.
          skipPatterns: [5],
        }),
      );

    const agentSession = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 60,
      expiresIn: ExpiresIn.hours(1),
      debug: false,
    });

    const agentId = await agentSession.start();
    updateSession(session_id, { agentId, channel: channel_name });

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    });
  } catch (error) {
    console.error('Error starting Athena viva:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to start the viva',
      },
      { status: 500 },
    );
  }
}
