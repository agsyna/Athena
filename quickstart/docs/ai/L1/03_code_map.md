# 03 Code Map

> Directory-level ownership map and where to change behavior safely.

## Top-Level Layout

```text
app/                 Next.js routes + API handlers
components/          Client UI and RTC/RTM lifecycle
lib/                 Shared constants and transcript helpers
scripts/             Verification and doctor helpers
docs/                Human-oriented guides
docs/ai/             Progressive disclosure docs (this system)
public/              Static assets and branding
types/               Shared TypeScript route/component contracts
```

Athena's own code is namespaced, so the boundary with inherited quickstart code
stays obvious:

```text
app/api/athena/      session, token, start, stop, live, summary
lib/athena/          prompt, parse, store, summary, cors, types
components/athena/   understanding map, summary panel, watch view
app/viva/            standalone viva page
app/watch/[id]/      read-only second screen
scripts/athena-parse.test.ts
```

Everything outside those paths is inherited and kept close to upstream.

## API Route Ownership (`app/api`)

- `generate-agora-token/route.ts`: builds RTC+RTM token via `buildTokenWithRtm`.
- `invite-agent/route.ts`: validates input/env, configures and starts agent session.
- `stop-conversation/route.ts`: stops agent and handles idempotent already-stopping cases.
- `chat/completions/route.ts`: optional OpenAI-compatible SSE proxy for custom LLM path.

## Client Ownership (`components`)

- `LandingPage.tsx`: pre-call shell, token/invite/RTM bootstrap, conversation mount/unmount.
- `ConversationComponent.tsx`: RTC join, mic publish, toolkit init, transcript/metrics/issues state.
- `QuickstartConversationLayout.tsx`: in-call framing and slots.
- `QuickstartTranscriptPanel.tsx`: live transcript panel.
- `QuickstartPipelineMetrics.tsx`: latency chips from metrics stream.
- `ConnectionStatusPanel.tsx` + `ConversationErrorCard.tsx`: issue rendering/severity.

## Shared Logic (`lib`)

- `agora.ts`: default constants (`DEFAULT_AGENT_UID`).
- `conversation.ts`: transcript normalization, spacing cleanup, timestamp normalization, visualizer state mapping.

## Validation and Tooling

- `scripts/verify-api-contracts.ts`: imports route handlers and validates contract behavior.
- `scripts/doctor.mjs`: local setup checks consumed by `pnpm run doctor`.
- `tailwind.config.ts`: includes `agora-agent-uikit` dist classes in content scan.

## Fast File Lookup

- Change agent prompt/model/VAD -> `app/api/invite-agent/route.ts`.
- Change token policy/channel naming -> `app/api/generate-agora-token/route.ts`.
- Change transcript mapping behavior -> `lib/conversation.ts` + `components/ConversationComponent.tsx`.
- Change session bootstrap UX -> `components/LandingPage.tsx`.
Athena lookups:

- Change what kind of examiner she is -> `lib/athena/prompt.ts`.
- Change the control payload schema -> `lib/athena/prompt.ts` **and** `lib/athena/parse.ts` **and** `extension/parse.js`.
- Change voice, model, speech recognition or VAD -> `app/api/athena/start/route.ts`.
- Change session lifetime or storage -> `lib/athena/store.ts`.
- Change who may call the API -> `lib/athena/cors.ts`.
- Change the panel UI -> `extension/sidepanel.js` and `extension/sidepanel.css`.

## Additional Component Roles

- `QuickstartPreCallCard.tsx`: start CTA and pre-call messaging.
- `QuickstartConversationLayout.tsx`: shared in-call composition shell.
- `MicrophoneSelector.tsx`: input-device selection UI.
- `ConnectionStatusPanel.tsx`: summary + detailed connection issue panel.
- `ErrorBoundary.tsx`: runtime guardrail for conversation subtree.

## Type Contract Locations

- `types/conversation.ts`: request/response payloads and component prop types.
- `types/env.d.ts`: typed environment variable expectations.
- `types/jsx.d.ts` and `react-jsx.d.ts`: JSX typing support details.

## Static and Styling Assets

- `public/*`: icons, logos, and heading SVG assets used in pre-call/in-call experience.
- `app/globals.css` and `styles/globals.css`: baseline theme/layout styles.
- `tailwind.config.ts`: utility class scan and theme extension.

## Verification Path Mapping

- API contract behavior test: `scripts/verify-api-contracts.ts`.
- Environment and prerequisites check: `scripts/doctor.mjs`.
- Aggregate check chain: `pnpm run verify` script in `package.json`.

## Ownership Boundaries

- `components/` owns client runtime lifecycle and UI state.
- `app/api/` owns privileged operations needing app certificate.
- `lib/` owns pure transforms reusable across client modules.
- `docs/` owns human-facing implementation narrative and runbooks.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Cross-file call path during start/stop.
- [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) — Official baseline map for recreating the quickstart recipe.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Mapping and rendering flow from toolkit events.
