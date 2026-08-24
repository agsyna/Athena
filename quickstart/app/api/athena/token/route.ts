import { NextRequest } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { preflight, withCors } from '@/lib/athena/cors';

// /api/generate-agora-token with two changes: CORS so the side panel can call
// it, and the App ID in the response, since a client building its own RTC and
// RTM clients needs it (and it's public anyway).
//
// The App Certificate never leaves this process. That's the reason the server
// still exists at all now that the viva runs inside the extension.

const EXPIRY_SECONDS = 3600;

function generateChannelName(): string {
  return `athena-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return withCors(
      request,
      { error: 'Agora credentials are not set on the server.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = Number.parseInt(searchParams.get('uid') ?? '', 10);
  const uid =
    Number.isNaN(parsed) || parsed <= 0
      ? Math.floor(Math.random() * 9_999_000) + 1000
      : parsed;
  const channel = searchParams.get('channel') || generateChannelName();
  const expires = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;

  try {
    // buildTokenWithRtm, not the RTC-only builder: the same token has to log
    // into RTM, which is where transcripts and agent state come through.
    const token = RtcTokenBuilder.buildTokenWithRtm(
      appId,
      appCertificate,
      channel,
      uid.toString(),
      RtcRole.PUBLISHER,
      expires,
      expires,
    );

    return withCors(request, {
      app_id: appId,
      token,
      uid: uid.toString(),
      channel,
    });
  } catch (error) {
    return withCors(
      request,
      {
        error: 'Failed to generate Agora token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
