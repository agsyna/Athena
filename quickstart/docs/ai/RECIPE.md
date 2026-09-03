---
recipe_version: 1.0.0
recipe_status: stable
derived_from: AgoraIO-Conversational-AI/agent-quickstart-nextjs
extension_points:
  - prompts.examiner
  - control.schema
  - api.athena-routes
  - pipeline.providers
  - ui.viva
invariants:
  - tts.skip-patterns
  - control.one-object-per-turn
  - tokens.rtc-rtm
  - certificate.server-only
  - lifecycle.strict-mode
  - transcript.uid-remap
stable_contracts:
  - env.required
  - api.athena.session
  - api.athena.token
  - api.athena.start
  - api.athena.stop
  - api.athena.live
  - api.athena.summary
---

# Athena Backend Recipe Profile

The reader-facing recipe is [`docs/ai/RECIPE.md`](../../../docs/ai/RECIPE.md) at
the repository root, which covers both halves of Athena. This file is the
machine-readable profile for the half that lives here: the Next.js backend.

## Recipe Role

- Role: `derived` recipe, forked from the official Agora Next.js quickstart.
- Target audience: developers building a voice agent that drives a live UI
  without paying for a second model call.
- Reuse model: clone, bind an Agora project, run, then replace the examiner
  prompt and the control schema with your own.

## Recipe Scope

This backend provides:

- an in-memory session store so a long passage travels by id rather than URL
- RTC and RTM token signing, with the App Certificate never leaving the server
- an agent start route that compiles a passage into an examiner system prompt
  and configures TTS to strip the control channel before speech synthesis
- a live mirror route for a read-only second screen, and a summary renderer
- a CORS layer that is permissive in development and allowlist-only in
  production

## What Makes This Different From The Base Quickstart

The base quickstart starts a voice agent. This one starts a voice agent that
reports structured state on every turn through the speech pipeline itself.

`MiniMaxTTS({ skipPatterns: [5] })` in
[`app/api/athena/start/route.ts`](../../app/api/athena/start/route.ts) makes the
engine strip curly-brace spans before speech synthesis while the real-time
transcript still carries the full text. The system prompt in
[`lib/athena/prompt.ts`](../../lib/athena/prompt.ts) requires exactly one JSON
object per turn, appended last. [`lib/athena/parse.ts`](../../lib/athena/parse.ts)
reads it back out.

Everything else that the base quickstart established, the token flow, the
StrictMode lifecycle guards, the transcript UID remap, is unchanged and should
stay that way.

## Extension Points

- `prompts.examiner`: `buildAthenaPrompt` and `ATHENA_GREETING` in
  [`lib/athena/prompt.ts`](../../lib/athena/prompt.ts). This is where "oral
  examiner" is defined, and where you would define something else.
- `control.schema`: the `AthenaControl` interface and `applyControl` in
  [`lib/athena/parse.ts`](../../lib/athena/parse.ts), plus the matching contract
  section of the prompt. Change both together or the model and the reader drift
  apart.
- `api.athena-routes`: browser-facing routes under `app/api/athena`. Shared
  types live in [`lib/athena/types.ts`](../../lib/athena/types.ts).
- `pipeline.providers`: the `DeepgramSTT`, `OpenAI` and `MiniMaxTTS` builder
  chain in [`app/api/athena/start/route.ts`](../../app/api/athena/start/route.ts).
  A different TTS vendor must still support skip patterns, or the control
  channel becomes audible.
- `ui.viva`: [`components/athena/`](../../components/athena/) for the standalone
  `/viva` and `/watch/[id]` pages. The extension's own UI is in
  `extension/sidepanel.js` and does not import from here.

## Invariants

- **Keep `skipPatterns: [5]` on the TTS builder.** Without it the control
  payload is spoken aloud. This is the single load-bearing line in the recipe.
- **One brace pair per turn.** The engine skips the first outermost pair only, so
  a second object is read out.
- Keep the LLM temperature low (currently `0.4`). The payload has to come out in
  the same shape every turn.
- Keep `RtcTokenBuilder.buildTokenWithRtm`. An RTC-only token does not grant
  RTM, and RTM is how the transcript arrives.
- Keep `NEXT_AGORA_APP_CERTIFICATE` server-side. The extension is readable by
  anyone who installs it, which is the entire reason this backend exists.
- Preserve the StrictMode `isReady` guard and the `uid="0"` transcript remap
  inherited from the base quickstart.
- Keep the parser tolerant. A malformed payload must degrade to a stale chip,
  never to a thrown error mid-viva.

## Stable Contracts

- `POST /api/athena/session` accepts `{ passage, sourceTitle?, sourceUrl?,
  focusTopics? }` and returns a short session id. Rejects passages under 80 or
  over 20000 characters.
- `GET /api/athena/session?id=` returns the stored session.
- `GET /api/athena/token` returns `{ token, uid, channel }` with RTM access.
- `POST /api/athena/start` accepts `{ requester_id, channel_name, session_id }`
  and returns `{ agent_id, create_ts, state }`. Returns 404 with a
  student-readable message when the session has expired.
- `POST /api/athena/stop` accepts `{ agent_id }` and treats an
  already-stopping session as success.
- `POST /api/athena/live` mirrors the understanding map and returns any pending
  watcher nudge in the same response, so a running viva needs one loop, not two.
- `POST /api/athena/summary` accepts `{ sessionId, topics, transcript,
  durationMs }` and returns rendered markdown.
- Required env: `NEXT_PUBLIC_AGORA_APP_ID`, `NEXT_AGORA_APP_CERTIFICATE`.
  Required on deploy: `ATHENA_ALLOWED_ORIGINS`.

## Internal / Subject to Change

- The exact topic-status vocabulary (`unattempted`, `active`, `partial`,
  `wrong`, `correct`) and how the map renders it.
- The six-hour session TTL and the in-memory store. Anything durable would
  replace [`lib/athena/store.ts`](../../lib/athena/store.ts) wholesale.
- Reseller defaults for speech recognition, model and voice.
- Summary wording and layout.

## Consumer Onboarding Recipe

1. Clone, then bind an Agora project and write `quickstart/.env.local`.
2. Run `pnpm run doctor` and `pnpm run dev`.
3. Load `extension/` unpacked and run one viva end to end.
4. Confirm you never hear a curly brace. That is the recipe working.
5. Replace `buildAthenaPrompt` and the control schema with your own, keeping
   `skipPatterns` and the one-object-per-turn rule.
6. Validate with `pnpm run verify` before sharing modifications.
