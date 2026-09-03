# 02 Architecture

> Runtime architecture for browser RTC/RTM, Next.js route handlers, and Agora managed agent session.

## High-Level Shape

- Next.js App Router frontend and API routes in one deployable app.
- Browser joins Agora RTC channel and uses RTM for transcript/state/metrics/errors.
- Server-side routes mint token and call Agora Agent Server SDK.
- Agent executes STT -> LLM -> TTS pipeline in Agora cloud.

## Component Graph

```text
Browser UI (LandingPage + ConversationComponent)
  -> GET /api/generate-agora-token
  -> POST /api/invite-agent
  -> RTC join/publish mic
  -> RTM subscribe + AgoraVoiceAI events
  -> POST /api/stop-conversation

Next.js API routes
  -> agora-token (RtcTokenBuilder.buildTokenWithRtm)
  -> agora-agents (start/stop managed agent)

Agora Cloud
  -> Agent session (Deepgram STT + OpenAI LLM + MiniMax TTS by default)
  -> RTM payloads (transcript, state, metrics, error)
```

## Start Sequence

1. UI fetches RTC+RTM token and channel.
2. UI invites agent and initializes RTM in parallel.
3. UI mounts conversation view.
4. `useJoin` connects RTC once `isReady` guard passes.
5. `AgoraVoiceAI.init()` subscribes transcript/state/metrics streams.

## End Sequence

1. UI calls `/api/stop-conversation` with `agent_id` if present.
2. UI logs out RTM client.
3. RTC hook ownership handles leave/unpublish cleanup.
4. Component state resets to pre-call shell.

## Core State Domains

- Session bootstrap: `LandingPage` (`agoraData`, `rtmClient`, loading/error flags).
- RTC transport and mic: `ConversationComponent` + `agora-rtc-react` hooks.
- Transcript + agent state: `AgoraVoiceAI` events mapped through `lib/conversation.ts`.
- Metrics and connection issues: `AGENT_METRICS`, `MESSAGE_ERROR`, `SAL_STATUS`, RTM fallback parsing.

## External Dependencies

- `agora-rtc-react` / `agora-rtc-sdk-ng` for media transport.
- `agora-rtm` for data channel.
- `agora-agent-client-toolkit` and `agora-agent-uikit` for conversation logic/UI.
- `agora-agents` for managed agent lifecycle.

## The Athena Layer

Everything above describes the inherited base quickstart, which is still present
and still works. Athena adds a second client and one non-obvious mechanism.

### Second client

`extension/` is a Chrome MV3 extension with no build step. It vendors the Agora
web SDKs in `extension/vendor/` and talks to `app/api/athena/*` over CORS. It
does not import from `components/` and never will, so the browser UI here and
the panel UI there are separate implementations of the same session.

The extension exists because capture needs `activeTab`, granted only on a user
gesture. The viva runs on the extension's own origin rather than in an iframe,
because a cross-origin frame inside a `chrome-extension://` page is its own
microphone permission context and will not inherit a grant given to
`localhost:3000`.

### Control channel

```text
LLM turn text
  -> Agora engine strips { ... } before TTS   (skipPatterns: [5])
  -> student hears prose only
  -> RTM transcript delivers the full text, braces intact
  -> parse.ts extracts the JSON and applies it to the understanding map
```

`lib/athena/prompt.ts` holds the contract the model is held to. `lib/athena/parse.ts`
reads payloads back out and is duplicated as `extension/parse.js`, because the
extension cannot import TypeScript. Change one, change both.

The parser walks backwards from the last `}` and lets `JSON.parse` decide which
`{` opened the payload. Quote-state tracking does not survive real prose: one
apostrophe flips the parity and hides the object entirely.

### Session store

`lib/athena/store.ts` is an in-memory `Map` on `globalThis` with a six hour TTL.
A passage runs to thousands of characters, past what is safe in a query string,
so the extension POSTs it and carries an eight-character id instead. Sessions do
not survive a restart, and that is deliberate.

## Deployment Modes

- Local development via `pnpm run dev`.
- Vercel deployment as single Next.js app with server env vars.

## Data and Control Boundaries

- Browser never sees the app certificate; only receives signed short-lived tokens.
- Agent lifecycle control (`start`, `stop`) is server-routed.
- Transcript/state/metrics are data-plane RTM events from agent to browser.
- UI control-plane actions (start/end, renew) originate in `LandingPage`.

## Internal Interfaces Between Components

`LandingPage` -> `ConversationComponent` props:

- `agoraData` (`token`, `uid`, `channel`, optional `agentId`)
- `rtmClient` (already logged-in and subscribed)
- `onTokenWillExpire(uid)` callback for dual-token renewal
- `onEndConversation()` callback for teardown and route stop call

`ConversationComponent` -> child UI components:

- normalized transcript items and current in-progress turn
- agent visualizer state derived from transport + semantic state
- connection issue list and derived severity
- recent metric window for stage latency chips

## Why the App Router Structure Matters

- API handlers under `app/api` co-deploy with UI and share env management.
- Client components isolate browser-only SDK usage via dynamic import and `ssr: false`.
- This avoids SSR-side access to WebRTC-dependent modules.

## Change Impact Hints

- Changes to token or invite routes affect both startup and renewal paths.
- Changes to transcript mapping can break both transcript panel and visualizer semantics.
- Changes to RTM setup in `LandingPage` affect toolkit subscription readiness.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Detailed bootstrapping and teardown timeline.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event mapping, UID remap, in-progress/completed segmentation.
