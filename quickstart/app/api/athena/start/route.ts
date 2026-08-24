import { NextRequest } from 'next/server';
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
import { preflight, withCors } from '@/lib/athena/cors';

// Starts the viva agent. This is the quickstart's /api/invite-agent with three
// changes:
//   1. instructions come from the student's passage
//   2. a different greeting
//   3. TTS runs with skipPatterns: [5], so the engine strips { } before speech
//      synthesis while the transcript still gets the full text. That's the
//      control channel. See lib/athena/prompt.ts and lib/athena/parse.ts.
//
// Everything else (token flow, RTM flags, lifecycle) is the sample's.

const agentUid = String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
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
      return withCors(
      request,
        { error: 'channel_name, requester_id and session_id are required' },
        { status: 400 },
      );
    }

    const session = getSession(session_id);
    if (!session) {
      return withCors(
      request,
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
      // Interruption stays as responsive as the sample's default, since cutting
      // in is a normal thing to do in a viva.
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
              // Longer than the sample's 480ms: people pause mid-answer.
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
          // She needs to remember what she already judged, to circle back.
          maxHistory: 40,
          params: {
            max_tokens: 1024,
            // Lower than the sample's 0.7. The control payload has to come out
            // in the same shape every turn.
            temperature: 0.4,
            top_p: 0.9,
          },
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
          // 5 = skip curly braces. This is what hides the control channel.
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

    return withCors(request, {
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    });
  } catch (error) {
    console.error('Error starting Athena viva:', error);
    return withCors(
      request,
      {
        error:
          error instanceof Error ? error.message : 'Failed to start the viva',
      },
      { status: 500 },
    );
  }
}
