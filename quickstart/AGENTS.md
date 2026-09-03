# Agent Development Guide

This guide is for coding agents and contributors making changes to the Athena
backend.

**Read this first.** Athena is two halves. This Next.js app is the server; the
client is a Chrome extension in `../extension/` with no build step, which vendors
the Agora web SDKs and cannot import anything from here. A change to the control
channel almost always needs edits on both sides. See
[../docs/ai/RECIPE.md](../docs/ai/RECIPE.md) for what Athena is and how the
control channel works.

This app is a fork of the official Agora Conversational AI Next.js quickstart.
Everything outside `lib/athena/`, `app/api/athena/` and `components/athena/` is
inherited and kept close to upstream on purpose, so improvements there stay easy
to pull in. Prefer adding to the `athena/` namespace over editing inherited code.

## How to Load

This repository uses progressive disclosure documentation. Docs live under `docs/ai/` in three levels.

1. Read [docs/ai/L0_repo_card.md](docs/ai/L0_repo_card.md) to identify the repo.
2. Load ALL 8 files in [docs/ai/L1/](docs/ai/L1/). They are small, so load all of them upfront.
3. Follow L2 deep-dive links only when L1 isn't detailed enough. The index is at [docs/ai/L1/L2/_index.md](docs/ai/L1/L2/_index.md).

This repo declares `Recipe Role: derived` in L0. Read
[docs/ai/RECIPE.md](docs/ai/RECIPE.md) for this backend's extension points,
invariants and stable contracts, and
[../docs/ai/RECIPE.md](../docs/ai/RECIPE.md) for the reader-facing recipe that
covers both halves.

The sections below (Start Here, Patterns, Anti-Patterns, etc.) remain the canonical contributor handbook for hands-on work; the `docs/ai/` tree is the structured summary used by AI agents.

## Start Here

- Read [README.md](./README.md) for setup, commands, verification, and deployment.
- Use [docs/ai/RECIPE.md](docs/ai/RECIPE.md) for this backend's recipe contract.
- Use [lib/athena/prompt.ts](lib/athena/prompt.ts) for the examiner behaviour and
  the control payload contract. It is the most consequential file in the repo.
- Use [docs/ai/L1/L2/from_scratch_bootstrap.md](docs/ai/L1/L2/from_scratch_bootstrap.md) for the baseline implementation map.
- Use [docs/ai/L1/L2/transcript_pipeline.md](docs/ai/L1/L2/transcript_pipeline.md) for transcript and RTM behavior.
- For layout and responsibilities inside `components/`, `app/api/`, and `lib/`, use [docs/ai/L1/03_code_map.md](docs/ai/L1/03_code_map.md) and [docs/ai/L1/02_architecture.md](docs/ai/L1/02_architecture.md).

## Current System Shape

- App shell: Next.js 16 App Router, React 19, and TypeScript
- Client RTC: `agora-rtc-react` hooks over `agora-rtc-sdk-ng`
- Messaging: `agora-rtm` for transcripts, agent state, metrics, and error events
- Toolkit core: `agora-agent-client-toolkit` for `AgoraVoiceAI`, transcript helpers, and turn status
- UI components: `agora-agent-uikit` for visualizer, transcript, and mic controls
- Server SDK: `agora-agents` for managed agent session startup
- API routes: token generation, agent invite, chat, and stop routes live in `app/api`
- Default agent config: Agora-managed STT, LLM, and TTS; `.env.local` contains only Agora project credentials
- Athena layer: `app/api/athena/*` routes, `lib/athena/*` logic, `components/athena/*` UI
- Control channel: `MiniMaxTTS({ skipPatterns: [5] })` strips curly braces before
  speech synthesis while the transcript keeps them, so one model call drives the
  live understanding map

## Supported Modes

### Local Development

- Run from the repo root with `pnpm run dev`.
- Next.js serves the app and the route handlers at `http://localhost:3000`.
- Local credentials are read from `.env.local`, usually written by `agora project env write .env.local`.

### Vercel Deployment

- Deploy the repository as a single Next.js app.
- Set `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE` in the deployment target.
- Keep `NEXT_AGORA_APP_CERTIFICATE` server-side only.

## Routing / Ownership

- UI and RTC/RTM client lifecycle live in `components`.
- Browser-facing API routes live in `app/api`.
- Shared constants and transcript normalization live in `lib`.
- If a workflow, request contract, or ownership boundary changes, update `README.md`, `AGENTS.md`, and the relevant `docs/ai/` files in the same change.

## Athena Key Files

- `lib/athena/prompt.ts`: the examiner system prompt and the control payload
  contract. Edit here for persona, phasing, adaptive difficulty, or schema.
- `lib/athena/parse.ts`: extracts the payload from a spoken turn and applies it.
  **Mirrored by `../extension/parse.js`; change both.**
- `lib/athena/store.ts`: in-memory session store, six hour TTL.
- `lib/athena/cors.ts`: permissive in dev, `ATHENA_ALLOWED_ORIGINS` allowlist in production.
- `lib/athena/summary.ts`: end-of-session markdown.
- `app/api/athena/start/route.ts`: starts the viva agent. **`skipPatterns: [5]`
  lives here and is load-bearing.**
- `app/api/athena/live/route.ts`: mirrors the map for the watch page and returns
  pending nudges in the same response.
- `scripts/athena-parse.test.ts`: 21 assertions over the parser.
- `../extension/config.js`: where the backend origin is set.

## Inherited Key Files

- `app/api/generate-agora-token/route.ts`: issues RTC + RTM tokens for the browser user.
- `app/api/invite-agent/route.ts`: starts the managed agent session; edit here for system prompt, VAD, model, or voice changes.
- `app/api/stop-conversation/route.ts`: stops the agent session.
- `app/api/chat/completions/route.ts`: optional OpenAI-compatible SSE proxy for a custom LLM (not wired by default).
- `components/LandingPage.tsx`: session bootstrap, RTM setup, provider wiring, and conversation lifecycle.
- `components/ConversationComponent.tsx`: RTC join, mic publication, `AgoraVoiceAI` init, transcript state, and renewals.
- `components/QuickstartConversationLayout.tsx`: in-call header, transcript rail, and controls dock.
- `components/QuickstartPipelineMetrics.tsx`: per-stage latency chips from `AGENT_METRICS`.
- `components/QuickstartTranscriptPanel.tsx`: live transcript rail.
- `lib/agora.ts`: shared agent UID defaults.
- `lib/conversation.ts`: transcript normalization and visualizer state mapping.
- `env.local.example`: local environment template.
- `scripts/verify-api-contracts.ts`: route contract verification.

## Patterns

### The Control Channel

The agent appends one JSON object to every spoken turn. `skipPatterns: [5]` makes
the Agora engine strip curly braces before speech synthesis, while the real-time
transcript still carries the full text. So the same tokens are both the speech
and the UI state, and they cannot disagree.

Rules that hold this together:

- **One brace pair per turn.** The engine skips the first outermost pair only, so
  a second object is spoken aloud.
- **Low LLM temperature.** Currently `0.4`. The payload has to come out in the
  same shape every turn.
- **The parser stays tolerant.** A malformed payload leaves a chip stale. It must
  never throw mid-viva.
- **The parser is duplicated.** `lib/athena/parse.ts` and `../extension/parse.js`
  read the same payload. The extension has no build step and cannot import
  TypeScript. Change one, change both, and add the case to
  `scripts/athena-parse.test.ts`.

### StrictMode Guard (`isReady`)

Both `useJoin` and `useLocalMicrophoneTrack` are gated by `isReady` to prevent double initialization in React StrictMode dev mode. The cleanup fires synchronously before any `setTimeout`, so only the real second mount's timer fires.

```tsx
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
const { isConnected: joinSuccess } = useJoin(config, isReady);
const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
```

### Hook Ownership

- `useJoin` owns `client.leave()`; never call it manually.
- `useLocalMicrophoneTrack` owns track lifecycle; do not manually call `.close()`.
- `usePublish` owns publish state; mute with `track.setEnabled()` and do not manually unpublish.

### AgoraVoiceAI Init

Initialize `AgoraVoiceAI` from `agora-agent-client-toolkit` inside `ConversationComponent`, gated on `isReady && joinSuccess`.

```tsx
useEffect(() => {
  if (!isReady || !joinSuccess) return;
  // AgoraVoiceAI.init() is called here exactly once.
}, [isReady, joinSuccess]);
```

`isReady` becomes true only after the StrictMode fake-unmount cycle completes. Once `isReady` is true, React does not double invoke the effect for later dependency changes such as `joinSuccess` becoming true.

### Transcript and UI Mapping

- Manage `transcript` and `agentState` through `useState` plus `ai.on(TRANSCRIPT_UPDATED, ...)` and `ai.on(AGENT_STATE_CHANGED, ...)`.
- The toolkit uses `uid="0"` as a sentinel for the local user's speech. Remap that value to `client.uid` before passing messages into `QuickstartTranscriptPanel`, or user speech renders on the agent side.
- Include `INTERRUPTED` turns in `messageList`; filter only `IN_PROGRESS`. If the agent's first turn is interrupted and omitted, `messageList` stays empty and the transcript panel never shows that first turn.

### Tokens and Styling

- RTM token access must come from `RtcTokenBuilder.buildTokenWithRtm`; a standard RTC-only token does not grant RTM access.
- Tailwind must scan uikit classes with `./node_modules/agora-agent-uikit/dist/**/*.{js,mjs}` in `tailwind.config.ts`.

## Working Rules

- Prefer the smallest change that keeps the recipe copyable and production-style.
- Never remove `skipPatterns: [5]` from the TTS builder.
- Never let a credential reach `../extension/`. It receives signed short-lived
  tokens and nothing else.
- Keep new code inside the `athena/` namespaces rather than editing inherited
  quickstart files, so upstream improvements stay mergeable.
- Keep RTC client creation StrictMode-safe with `useRef`, not `useMemo`.
- Keep token generation on `RtcTokenBuilder.buildTokenWithRtm`.
- Keep transcript UID remapping aligned with the toolkit sentinel behavior.
- Do not require third-party vendor API keys unless the code actually introduces a BYOK provider path.
- Keep README, AGENTS, and `docs/ai/` aligned with implementation changes.

## Commands

From the repo root:

```bash
pnpm install
pnpm run doctor
pnpm run dev
pnpm run verify
```

Useful narrower checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run verify:api
pnpm run build
node --import tsx scripts/athena-parse.test.ts    # control channel parser
```

## Verification Safety

- Safe without live Agora credentials:
  - `pnpm run lint`
  - `pnpm run typecheck`
  - `pnpm run verify:api`
  - `pnpm run build`
- Requires local env setup but not a live Agora session:
  - `pnpm run doctor`
  - `pnpm run verify`
- Often blocked inside restricted sandboxes because of port binding or process spawning:
  - `pnpm run dev`

## Anti-Patterns / What NOT To Do

- Do not call `client.leave()` manually; it breaks `useJoin` cleanup.
- Do not call `localMicrophoneTrack.close()` manually; it breaks hook ownership.
- Do not remove the `isReady` guard.
- Do not set `reactStrictMode: false` as a workaround.
- Do not use the deprecated `turnDetection.type: 'agora_vad'` flat API; use `turnDetection.config.start_of_speech` and `turnDetection.config.end_of_speech`.
- Do not replace `RtcTokenBuilder.buildTokenWithRtm` with an RTC-only token builder.
- Do not hide SDK requirements only in `CLAUDE.md`; all agent-facing guidance belongs in `AGENTS.md`.
- Do not remove `skipPatterns: [5]`, and do not emit two brace pairs in one turn.
- Do not edit `lib/athena/parse.ts` without mirroring `../extension/parse.js`.
- Do not ship a deployment without `ATHENA_ALLOWED_ORIGINS` set.

## Done Criteria

Before finishing a change:

0. If you touched the prompt, the parser or the TTS config: run one real viva and
   confirm you never hear a curly brace, a JSON key, or the word "focus". No
   automated check catches an audible control channel, because it depends on the
   live TTS pipeline honouring `skipPatterns`.
1. Run the narrowest relevant verification command.
2. For shipped app/runtime changes, ensure `pnpm run verify` passes.
3. If you changed files in `components/` or `app/api/`, verify that `README.md`, this file, and the relevant `docs/ai/` files still match the implementation.
4. Update root README and affected docs when workflow, request contracts, architecture, or environment guidance changes.
5. If the change touches workflows, interfaces, gotchas, or security details, update the matching file under [docs/ai/L1/](docs/ai/L1/) and bump `Last Reviewed` in [docs/ai/L0_repo_card.md](docs/ai/L0_repo_card.md).

## Git Conventions

### Commit messages: conventional commits

- **Format:** `type: description` or `type(scope): description`
- **Types:** `feat:` (new feature), `fix:` (bug fix), `chore:` (maintenance, version bumps), `test:` (test additions/changes), `docs:` (documentation)
- **Scoped variant:** `feat(scope):`, `fix(scope):`, e.g. `feat(api): add stop-conversation status flag`
- **Lowercase after prefix.** `feat: add feature`, not `feat: Add feature`
- **Present tense.** "add feature", not "added feature"
- **PR number appended.** `feat: add feature (#123)`

### Branch names

- **Format:** `type/short-description`, lowercase, hyphen-separated
- **Types match commit types:** `feat/`, `fix/`, `chore/`, `test/`, `docs/`
- **Examples:** `feat/agent-metrics`, `fix/transcript-uid`, `docs/progressive-disclosure`

### General rules

- **No AI tool names.** Never mention claude, cursor, copilot, cody, aider, gemini, codex, chatgpt, or gpt-3/4 in commit messages or PR descriptions.
- **No Co-Authored-By trailers.** Omit AI attribution lines.
- **No `--no-verify`.** Let git hooks run normally.
- **No git config changes.** Do not modify `user.name` or `user.email`.

## Doc Commands

| Command         | When to use                                                  |
| --------------- | ------------------------------------------------------------ |
| generate docs   | No `docs/ai/` directory exists yet                           |
| update docs     | Code changed since the `Last Reviewed` date in L0            |
| test docs       | Verify docs give agents the right context (writes `docs/ai/test-results.md`) |
| fix docs        | Close findings from a docs review or test run                |

The generator and tester live in the [AgoraIO-Community/ai-devkit](https://github.com/AgoraIO-Community/ai-devkit) skill set. See the [progressive disclosure standard](https://github.com/AgoraIO-Community/ai-devkit/blob/main/docs/progressive-disclosure-standard.md) for the full specification.
