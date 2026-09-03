# 06 Interfaces

> Contracts at repo boundaries: API routes, env vars, runtime events, and shared TypeScript payloads.

## HTTP Route Contracts

### `GET /api/generate-agora-token`

Query params:

- `uid` optional; invalid/zero resolves to random RTM-safe UID.
- `channel` optional; defaults to generated `ai-conversation-<ts>-<rand>`.

Success response:

```json
{ "token": "...", "uid": "1234", "channel": "ai-conversation-..." }
```

Failure response: `{ "error": string, "details"?: string }` with `500`.

### `POST /api/invite-agent`

Body (`ClientStartRequest`):

```json
{ "requester_id": "1234", "channel_name": "ai-conversation-..." }
```

Success (`AgentResponse`):

```json
{ "agent_id": "...", "create_ts": 1710000000, "state": "RUNNING" }
```

Validation failures return `400`; server failures return `500`.

### `POST /api/stop-conversation`

Body (`StopConversationRequest`): `{ "agent_id": "..." }`.

Responses:

- `{ "success": true }`
- `{ "success": true, "state": "already-stopping" }` for idempotent stop state
- `{ "error": string }` on failure

### `POST /api/chat/completions`

Optional SSE proxy path (not default runtime path). Requires `NEXT_LLM_API_KEY` and `NEXT_LLM_URL` when used.

## Athena Route Contracts

All Athena routes answer `OPTIONS` for CORS preflight and are subject to
`lib/athena/cors.ts`.

### `POST /api/athena/session`

Body: `{ passage, sourceTitle?, sourceUrl?, focusTopics? }`. The passage must be
between 80 and 20000 characters. Returns a short session id, so a long passage
never has to travel in a URL. `focusTopics` marks the session as revision, which
shortens the agent's orientation turn and fixes her topic list.

### `GET /api/athena/session?id=`

Returns the stored session, or `404` once it has expired.

### `GET /api/athena/token`

Returns `{ token, uid, channel }` with RTM capability, via
`RtcTokenBuilder.buildTokenWithRtm`.

### `POST /api/athena/start`

Body: `{ requester_id, channel_name, session_id }`. Compiles the stored passage
into an examiner prompt and starts the agent with `skipPatterns: [5]` on TTS.
Returns `{ agent_id, create_ts, state }`. Returns `404` with a student-readable
message when the session has expired.

### `POST /api/athena/stop`

Body: `{ agent_id }`. Idempotent for already-stopping sessions.

### `POST /api/athena/live`

Two callers. A running viva POSTs its understanding map on a heartbeat and gets
any pending watcher nudge back in the same response, so there is one loop rather
than two. The watch page reads the mirrored state. Deliberately plain HTTP: a
watcher is not a participant, and putting them in the channel would mean handing
RTC credentials to anyone holding the link.

### `POST /api/athena/summary`

Body: `{ sessionId, topics, transcript, durationMs }`. Returns rendered markdown.

## Control Payload Contract

Emitted by the model inside curly braces, one object per turn, appended last:

```json
{ "topics": ["First Topic", "Second Topic"] }
{ "mark": { "topic": "First Topic", "result": "correct" }, "focus": "Second Topic" }
{ "outside": "Sharding", "focus": "Second Topic" }
{ "mark": { "topic": "Second Topic", "result": "correct" }, "done": true }
```

`result` is exactly one of `correct`, `partial`, `wrong`. `topics` appears twice
and only twice: the orientation turn, and the first examination question.
`outside` names something the passage does not cover, and is the one field whose
value is not a topic name. Full contract in `lib/athena/prompt.ts`, reader in
`lib/athena/parse.ts`.

## Event/Data Interfaces

- RTM transcript/state/metrics/errors consumed through `AgoraVoiceAI` event emitter.
- Raw RTM `message` event parsed as fallback for `message.error` and `message.sal_status` payloads.
- `AGENT_METRICS` payloads displayed by `QuickstartPipelineMetrics`.

## Environment Contract

Required:

- `NEXT_PUBLIC_AGORA_APP_ID`
- `NEXT_AGORA_APP_CERTIFICATE`
- `ATHENA_ALLOWED_ORIGINS` (required on deploy, optional locally)

This is the complete base `.env.local` contract. The optional BYOK route and provider snippets use additional variables only when a developer explicitly enables them.

## Test Coverage for Interfaces

- `scripts/verify-api-contracts.ts` asserts token generation, input validation, env failures, and SSE framing cases.

## Shared Client-Side Interfaces

From `types/conversation.ts` (high-use):

- `AgoraTokenData`: token bootstrap payload consumed by `LandingPage`.
- `AgoraRenewalTokens`: renewal callback result (`rtcToken`, `rtmToken`).
- `ConversationComponentProps`: runtime dependencies for in-call component.

## Interface Invariants

- Token payload must always include `token`, `uid`, `channel`.
- Invite route requires both `requester_id` and `channel_name`.
- Stop route requires `agent_id`; missing should never be tolerated silently.
- Token route should always return UID as string for downstream compatibility.

## Event Interface Notes

- Metrics stream entries are append-only in component state, capped to recent window.
- Connection issue records carry `source`, `agentUserId`, code/message, timestamp.
- SAL and signaling fallback payloads are parsed defensively because message schema can vary.

## Backward Compatibility Guidance

- If route response shape changes, update both client consumers and contract tests in same change.
- If adding fields, keep existing fields stable to avoid quickstart consumer breakage.
- Reflect interface changes in README and L1 docs to keep sample copyable.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — How route contracts are used in sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event-level contract mapping.
