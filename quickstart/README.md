# Athena backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933)](https://nodejs.org/)
[![Agora ConvoAI](https://img.shields.io/badge/Agora-Conversational%20AI-099DFD)](https://docs.agora.io/en/conversational-ai/overview/product-overview)

The server half of [Athena](../README.md). The Chrome extension in
[`../extension/`](../extension/) is the client; this Next.js app is the trust
boundary that holds the App Certificate, signs RTC and RTM tokens, and starts
the Conversational AI agent.

It began as the [official Agora Next.js
quickstart](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs)
and keeps that repo's token flow, StrictMode lifecycle guards and transcript
handling intact. What was added on top is the viva: a passage store, an examiner
prompt, and a control channel that lets one model call drive a live UI.

> **New here?** Read [`../docs/ai/RECIPE.md`](../docs/ai/RECIPE.md) first. It
> explains what Athena is and, more usefully, the one trick worth stealing from
> it.

## What lives here

| Path | Job |
| --- | --- |
| [`lib/athena/prompt.ts`](lib/athena/prompt.ts) | Compiles a passage into an examiner system prompt, including the control-payload contract |
| [`lib/athena/parse.ts`](lib/athena/parse.ts) | Pulls the JSON payload back out of a spoken turn and applies it to the map |
| [`lib/athena/store.ts`](lib/athena/store.ts) | In-memory session store, six hour TTL, so a passage travels by id not URL |
| [`lib/athena/summary.ts`](lib/athena/summary.ts) | Renders the end-of-session markdown |
| [`lib/athena/cors.ts`](lib/athena/cors.ts) | Permissive in development, allowlist-only in production |
| [`app/api/athena/*`](app/api/athena/) | session, token, start, stop, live, summary |
| [`app/viva`](app/viva/), [`app/watch/[id]`](app/watch/) | Standalone viva page and the read-only second screen |
| [`components/athena/`](components/athena/) | Understanding map, summary panel, watch view |

Everything outside `athena/` is inherited from the base quickstart and is kept
close to upstream on purpose, so improvements there stay easy to pull in.

## Prerequisites

- [Node.js 22+](https://nodejs.org/en/download/)
- **pnpm 10.** Not 11: it turns the sample's harmless `ERR_PNPM_IGNORED_BUILDS`
  warning into a hard install failure.
- [Agora CLI](https://github.com/AgoraIO/cli)
- Google Chrome, for the extension

## Run it

Install the CLI if you do not have it:

```bash
# macOS and Linux
curl -fsSL https://raw.githubusercontent.com/AgoraIO/cli/main/install.sh | sh -s -- --add-to-path

# Windows PowerShell
irm https://dl.agora.io/cli/install.ps1 | iex
```

If `agora --help` is not found afterwards, open a new terminal. If it still
fails, check that the installer's directory made it onto your `PATH`.

Then bind a project and start the server:

```bash
agora login
agora project create athena --feature rtc --feature rtm --feature convoai
agora project use athena
agora project env write .env.local

pnpm install
pnpm dev            # http://localhost:3000
```

Speech recognition, the model and the voice are all resold through Agora, so
there is no Deepgram, OpenAI or MiniMax key to find. Two variables is the whole
setup, and `agora project env write` writes both.

Now load the extension: `chrome://extensions` → Developer mode → **Load
unpacked** → pick [`../extension/`](../extension/). Full walkthrough in the
[recipe](../docs/ai/RECIPE.md).

If the agent never joins, or transcripts never appear, run
`agora project doctor --deep`. It checks credentials, feature enablement,
network reachability and local env binding in one pass.

## Environment

| Variable | Required | Notes |
| --- | :---: | --- |
| `NEXT_PUBLIC_AGORA_APP_ID` | yes | Agora Console → your project → App ID |
| `NEXT_AGORA_APP_CERTIFICATE` | yes | Same page. Server-side only |
| `ATHENA_ALLOWED_ORIGINS` | on deploy | Comma-separated CORS allowlist. Blank in development, where any `chrome-extension://` or loopback origin is accepted. A production build with this unset refuses every cross-origin caller |

Template: [`env.local.example`](env.local.example).

## Commands

```bash
pnpm doctor       # prerequisites and credentials
pnpm dev
pnpm lint
pnpm typecheck
pnpm verify:api   # route contract checks
pnpm build
pnpm verify       # all of the above, in order
```

The parser has its own suite, and none of it needs Agora credentials:

```bash
node --import tsx scripts/athena-parse.test.ts    # 21 assertions
```

## Deploy

A stock Next.js app: deploy to Vercel unchanged, setting
`NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE` in the deployment
and keeping the certificate server-side. A `Dockerfile` is here too.

Two extra steps, because the client is an extension rather than a web page:

1. Pin the extension's ID with a `key` in `../extension/manifest.json`. An
   unpacked extension gets a fresh ID per install path, and an allowlist of an
   ID that changes on every reload is not an allowlist.
2. Set `SERVER` in `../extension/config.js` to the deployment origin **and** add
   that origin to `host_permissions` in the manifest. Chrome blocks fetches to
   any host the manifest does not declare, so changing one without the other
   fails as an opaque network error.

Then set `ATHENA_ALLOWED_ORIGINS=chrome-extension://<pinned id>`.

## Documentation

- [`../docs/ai/RECIPE.md`](../docs/ai/RECIPE.md), the recipe: what Athena is and
  how the control channel works
- [`docs/ai/RECIPE.md`](docs/ai/RECIPE.md), the machine-readable profile for this
  backend: extension points, invariants, stable contracts
- [`AGENTS.md`](AGENTS.md), the contributor and coding-agent handbook
- [`../docs/architecture.md`](../docs/architecture.md), diagrams and the full
  call sequence
- [`docs/ai/L0_repo_card.md`](docs/ai/L0_repo_card.md), the progressive
  disclosure entry point

## Licence

MIT. This app derives from the Agora Conversational AI Next.js quickstart,
Copyright (c) 2025 Agora Community, whose notice is kept in [`LICENSE`](LICENSE).
