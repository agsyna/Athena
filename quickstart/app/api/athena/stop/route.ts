import { NextRequest } from 'next/server';
import { AgoraClient, Area } from 'agora-agents';
import { preflight, withCors } from '@/lib/athena/cors';

// Same as /api/stop-conversation but with CORS, so the extension can call it.
// The panel calls this on a normal end and again on unload, so it has to be
// safe to call twice: an agent that's already gone counts as success.

// Stopping is idempotent, same as in /api/stop-conversation.
function alreadyGone(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };
  if (err.statusCode === 404) return true;
  const detail = (err.body?.detail ?? err.message ?? '').toLowerCase();
  return (
    err.body?.reason?.toLowerCase() === 'invalidrequest' &&
    detail.includes('already in the process of shutting down')
  );
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest) {
  let body: { agent_id?: string };
  try {
    body = await request.json();
  } catch {
    return withCors(request, { error: 'Invalid JSON body' }, { status: 400 });
  }

  const agentId = body.agent_id;
  if (!agentId) {
    return withCors(request, { error: 'agent_id is required' }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    return withCors(
      request,
      { error: 'Agora credentials are not set on the server.' },
      { status: 500 },
    );
  }

  try {
    const client = new AgoraClient({ area: Area.US, appId, appCertificate });
    await client.stopAgent(agentId);
    return withCors(request, { ok: true });
  } catch (error) {
    // Already stopped or never started. Either way there's nothing to do, and
    // the student is looking at a finished viva.
    if (alreadyGone(error)) {
      return withCors(request, { ok: true, alreadyStopped: true });
    }
    return withCors(
      request,
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
