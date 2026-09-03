# Contributing to Athena

Thanks for taking a look. Athena is two halves that have to be run together, so
this covers getting both up before it covers anything else.

## Getting set up

You need Node 22+, **pnpm 10** (not 11: it turns the sample's harmless
`ERR_PNPM_IGNORED_BUILDS` warning into a hard install failure), the
[Agora CLI](https://github.com/AgoraIO/cli), and Chrome.

```bash
git clone https://github.com/agsyna/Athena.git
cd Athena

agora login
agora project create athena --feature rtc --feature rtm --feature convoai
agora project use athena
agora project env write quickstart/.env.local

cd quickstart
pnpm install
pnpm dev
```

Then `chrome://extensions` → Developer mode → **Load unpacked** →
[`extension/`](extension/).

Reload the extension from that page after every change to anything under
`extension/`. The Next.js dev server hot-reloads on its own.

## The shape of the thing

- [`extension/`](extension/) is the client. Plain ES modules, no build step, no
  bundler. `sidepanel.js` owns the UI, `viva.js` owns RTC and RTM, `parse.js`
  mirrors the backend parser, `revision.js` owns local history.
- [`quickstart/`](quickstart/) is the backend. It is a fork of the official
  Agora Next.js quickstart, and everything outside `lib/athena/`,
  `app/api/athena/` and `components/athena/` is kept close to upstream on
  purpose so improvements there stay easy to pull in.
- [`docs/ai/RECIPE.md`](docs/ai/RECIPE.md) explains how the control channel
  works. Read it before changing anything that touches the prompt or the parser.

Note that the parser exists twice, in `extension/parse.js` and in
`quickstart/lib/athena/parse.ts`, because the extension has no build step and
cannot import TypeScript. **If you change one, change both**, and add the case
to `quickstart/scripts/athena-parse.test.ts`.

## Before you open a pull request

```bash
cd quickstart
pnpm verify                                       # lint, typecheck, contracts, build
node --import tsx scripts/athena-parse.test.ts    # 21 assertions
```

If you changed the prompt, the control schema or the parser, also run one real
viva end to end and confirm you never hear a curly brace or a JSON key spoken
aloud. No automated check catches that, because it depends on the live TTS
pipeline honouring `skipPatterns`.

## Conventions

Commit messages are [conventional commits](https://www.conventionalcommits.org/):

```
type(scope): lowercase description
```

`feat`, `fix`, `docs`, `chore`, `test`, `refactor`. Present tense. Say why in the
body, not just what. Branches follow `type/short-description`.

Two rules inherited from Agora's own contributor guide, and worth keeping:

- **No AI tool names** in commit messages or pull request descriptions.
- **No `Co-Authored-By` attribution trailers.**

Keep documentation in the same commit as the change it describes. If you touch a
request contract, an environment variable or an ownership boundary, the matching
lines in `README.md`, `quickstart/AGENTS.md` and `quickstart/docs/ai/` need to
move with it.

## Things not to break

- `skipPatterns: [5]` on the TTS builder in `app/api/athena/start/route.ts`.
  Remove it and the agent reads its own telemetry out loud.
- One brace pair per turn. The engine skips the first outermost pair only.
- `RtcTokenBuilder.buildTokenWithRtm`. An RTC-only token does not grant RTM, and
  RTM is how the transcript arrives.
- `NEXT_AGORA_APP_CERTIFICATE` staying server-side. An extension is readable by
  anyone who installs it, which is the whole reason the backend exists.
- The StrictMode `isReady` guard and the `uid="0"` transcript remap, both
  inherited from the base quickstart and both load-bearing.

## Reporting a bug

Say what you highlighted, what you expected Athena to do, and what she did
instead. If it is a control-channel problem, the browser console in the side
panel (right-click → Inspect) logs every parsed payload, and that log is usually
the whole answer.
