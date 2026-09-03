# Athena Backend: Repo Card

> The server half of Athena, a Chrome extension that examines you out loud on
> anything you highlight. Forked from the official Agora Conversational AI
> Next.js quickstart.

## Identity

| Field | Value |
| --- | --- |
| Repo | `agsyna/Athena` (this app lives in `quickstart/`) |
| Type | `frontend-app` with privileged API routes |
| Language | TypeScript, Next.js 16 App Router, React 19 |
| Deploy Target | Local Node.js dev server, Vercel |
| Owner | agsyna |
| Recipe Role | derived |
| Derived From | `AgoraIO-Conversational-AI/agent-quickstart-nextjs` |
| Recipe Version | 1.0.0 |
| Recipe Status | stable |
| Last Reviewed | 2026-09-03 |

## The One Thing To Know

Athena drives a live understanding map from a voice agent **without a second
model call**. The agent appends a JSON object to every spoken turn, and
`MiniMaxTTS({ skipPatterns: [5] })` makes the engine strip curly braces before
speech synthesis while the real-time transcript still carries the full text.

Speech and UI state can never disagree, because they are the same tokens. That
line in [app/api/athena/start/route.ts](../../app/api/athena/start/route.ts) is
load-bearing: remove it and the agent reads its own telemetry aloud.

## Two Halves

The client is a Chrome extension in `extension/`, one directory up from this
app. It has no build step and vendors the Agora web SDKs, so it cannot import
anything from here. This app exists because the App Certificate cannot live in
an extension that anyone who installs it can read.

## L1 summaries

The Audience column helps agents prioritise: **Use** = consuming the repo behavior, **Maintain** = changing internals.

| File | Purpose | Audience |
| --- | --- | --- |
| [01_setup](L1/01_setup.md) | Environment setup, quick commands, env vars, verification safety | Use & Maintain |
| [02_architecture](L1/02_architecture.md) | End-to-end runtime architecture and data flow | Maintain |
| [03_code_map](L1/03_code_map.md) | Directory/module map and ownership boundaries | Maintain |
| [04_conventions](L1/04_conventions.md) | Coding conventions, lifecycle patterns, and doc sync rules | Maintain |
| [05_workflows](L1/05_workflows.md) | Common task recipes (run, modify, validate, ship) | Use & Maintain |
| [06_interfaces](L1/06_interfaces.md) | API contracts, event payloads, env contracts | Use & Maintain |
| [07_gotchas](L1/07_gotchas.md) | High-impact pitfalls and known failure modes | Maintain |
| [08_security](L1/08_security.md) | Secret handling, trust boundaries, auth/token model | Maintain |

## Recipe

- [RECIPE.md](RECIPE.md) is this backend's machine-readable profile.
- [../../../docs/ai/RECIPE.md](../../../docs/ai/RECIPE.md) is the reader-facing
  recipe covering both halves, and the one the Agora catalog renders.
