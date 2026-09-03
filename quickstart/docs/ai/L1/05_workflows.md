# 05 Workflows

> Repeatable task recipes for common quickstart changes and validation loops.

## Run Locally

1. `pnpm install`
2. `agora login`
3. `agora project use <your-project>`
4. `agora project env write .env.local`
5. `pnpm run doctor`
6. `pnpm run dev`

If start fails, run `agora project doctor --deep`.

## Change Agent Behavior

Target file: `app/api/invite-agent/route.ts`.

Typical edits:

- System prompt (`ADA_PROMPT`).
- Greeting default (`GREETING`).
- Shared agent UID (`DEFAULT_AGENT_UID` in `lib/agora.ts`).
- VAD (`turnDetection.config.*`).
- STT/LLM/TTS model/provider blocks.

Validation path:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run verify:api`
4. `pnpm run build`

## Change Athena's Behaviour

Target file: `lib/athena/prompt.ts`, not `app/api/invite-agent/route.ts`. The
Athena agent is started by `app/api/athena/start/route.ts` and takes its
instructions from `buildAthenaPrompt`.

Typical edits:

- Examiner persona, phasing and adaptive difficulty rules (`buildAthenaPrompt`).
- Greeting spoken on join (`ATHENA_GREETING`).
- The control payload contract, at the bottom of the prompt.
- Voice, model, speech recognition, VAD (`app/api/athena/start/route.ts`).

Validation path:

1. `pnpm run lint`, `pnpm run typecheck`, `pnpm run verify:api`
2. `node --import tsx scripts/athena-parse.test.ts`
3. **Run one real viva.** Confirm you never hear a brace, a JSON key, or the
   word "focus". No automated check catches an audible control channel, because
   it depends on the live TTS pipeline honouring `skipPatterns`.

## Change The Control Schema

1. Update the contract section of `lib/athena/prompt.ts`.
2. Update `AthenaControl` and `applyControl` in `lib/athena/parse.ts`.
3. Mirror both into `extension/parse.js`.
4. Add cases to `scripts/athena-parse.test.ts`, including a malformed payload.
5. Run one real viva and watch the chips.

## Change Token or Session Bootstrap

Token behavior:

- Edit `app/api/generate-agora-token/route.ts`.
- Preserve RTM-capable token generation.

Bootstrap behavior:

- Edit `components/LandingPage.tsx`.
- Keep invite + RTM setup parallelized before conversation mount.

## Change Transcript Rendering

1. Update transforms in `lib/conversation.ts`.
2. Update wiring in `components/ConversationComponent.tsx`.
3. Ensure `IN_PROGRESS` is separated from history, `INTERRUPTED` retained in history.
4. Re-check [transcript_pipeline.md](L2/transcript_pipeline.md) for consistency.

## Ship-Readiness Workflow

1. Run `pnpm run verify`.
2. Confirm docs alignment (`README`, guides, `AGENTS`, `docs/ai`).
3. Use conventional commit and branch naming.

## Progressive Disclosure Doc Workflow

- `generate docs`: create `docs/ai/` tree when absent.
- `update docs`: refresh after workflow/interface/security changes.
- `test docs`: execute question-based validation and write `docs/ai/test-results.md`.
- `fix docs`: close findings from `docs/ai/test-results.md` or a docs review.

## Workflow: Implement a Baseline Recipe Repo

1. Treat this repo as the official Agora Next.js quickstart baseline.
2. Do not recreate Agora ConvoAI integration from memory.
3. Follow [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) for the implementation map and checklist.
4. Preserve the recipe invariants in `docs/ai/RECIPE.md`.
5. Run the verification commands before publishing a derivative.

## Workflow: Add a New API Route

1. Add route under `app/api/<route-name>/route.ts`.
2. Define payload types in `types/conversation.ts` if shared with client.
3. Add/update contract verification in `scripts/verify-api-contracts.ts`.
4. Run `pnpm run verify:api` and `pnpm run typecheck`.
5. Update `README.md` and `docs/ai/L1/06_interfaces.md`.

## Workflow: Modify Transcript UX

1. Update transforms in `lib/conversation.ts`.
2. Update render usage in transcript/layout components.
3. Validate edge states (`IN_PROGRESS`, `INTERRUPTED`, empty history).
4. Reconcile guidance in [transcript_pipeline.md](L2/transcript_pipeline.md).
5. Run `pnpm run lint` and `pnpm run build`.

## Workflow: Enable BYOK Provider Path

1. Uncomment relevant provider block in invite route.
2. Add the provider variables shown in the lower README BYOK section to your local environment.
3. Keep default no-key path intact for baseline quickstart behavior.
4. Keep provider variables out of `env.local.example`; they are not part of the base contract.
5. Re-run `pnpm run verify` before shipping.

## Workflow: Docs Refresh After Runtime Changes

1. Update L1 files matching changed subsystem.
2. Update or add L2 deep dives if L1 explanation exceeds concise bounds.
3. Bump `Last Reviewed` in `L0_repo_card.md`.
4. Re-run docs test and append retest notes for any fixes.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Full runtime sequence for bootstrap and teardown tasks.
- [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) — Baseline implementation checklist for recipe consumers.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Required checks when editing transcript flow.
