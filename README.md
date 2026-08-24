# Athena

A Chrome extension that turns whatever you're reading into a spoken oral exam.

Paste a passage into the side panel (or highlight it on the page and click the
Athena icon), and Athena reads it, tells you what it covers, and asks whether
you want to be examined or want something explained first. When you say go, she
starts asking questions. You answer out loud. A map of topics on screen fills in
as she judges each answer.

Built on the [Agora Conversational AI Engine](https://docs.agora.io/en/conversational-ai/overview/product-overview).

## Why

Reading something and being able to explain it are not the same thing, and you
usually find out which one you have in an exam. A viva is the format that
catches the difference, but it needs an examiner sitting across from you, which
is the part that doesn't scale.

Athena examines the specific material in front of you rather than a fixed
question bank, and adapts to how each answer goes: a correct answer earns a
harder follow-up, a partial one keeps her on the topic with a narrower question,
and a wrong one gets marked and revisited later in the session. If you say you
don't know, she explains it and then checks you followed. If an answer is
ambiguous she asks a clarifying question instead of guessing at a mark.

You can also type instead of speaking. Typed answers go down the same path and
land in the transcript and summary identically.

## The understanding map

This is the part I think is interesting, and it needs no second model, no
classifier call, and no extra API key.

The ConvoAI join payload supports [`tts.skip_patterns`](https://docs-md.agora.io/en/conversational-ai/rest-api/agent/join.md).
Setting it to `5` tells the engine to strip curly-brace content before speech
synthesis, and the spec says the real-time transcript "restores the complete
text after each sentence finishes." So anything in braces is a side channel that
goes down the existing voice pipeline: the student never hears it, the app
always sees it.

```
Athena's LLM output:
  "Good, so what does that cost you on writes? {"focus":"Indexing",
   "mark":{"topic":"Normalization","result":"correct"}}"

  TTS speaks:      "Good, so what does that cost you on writes?"
  Transcript gets: the full string, braces included
  Browser parses:  the control payload, flips the Normalization chip green
```

One model, one call, one round trip. The alternatives are worse: a hidden tag
without `skip_patterns` gets read aloud, a second classifier call per turn adds
latency and cost and can contradict what the student was just told, and an MCP
tool call needs the agent's tool endpoint to be publicly reachable.

The contract is in [`quickstart/lib/athena/prompt.ts`](quickstart/lib/athena/prompt.ts),
the reader and state reducer in [`quickstart/lib/athena/parse.ts`](quickstart/lib/athena/parse.ts),
with tests in [`quickstart/scripts/athena-parse.test.ts`](quickstart/scripts/athena-parse.test.ts).

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the diagrams and the call
sequence.

```
Chrome extension (MV3)
  background.js   captures a highlighted passage (optional shortcut)
  sidepanel.js    paste box, and the viva itself
  viva.js         RTC/RTM join, transcript, control channel
      |
      |  POST /api/athena/session  (passage -> session id)
      v
Next.js app (the Agora quickstart, extended)
  /api/athena/token    RTC + RTM token
  /api/athena/start    starts the agent
  /api/athena/summary  builds the revision file
  /api/athena/live     mirrors the map for the watch page
      |
      |  agora-agents SDK
      v
Agora Conversational AI Engine
  Deepgram nova-3 -> GPT-4o-mini -> MiniMax speech_2_6_turbo
```

**Why there's a server at all.** The Agora App Certificate signs RTC and RTM
tokens and authenticates the ConvoAI REST calls. It's a secret, and an extension
is a folder of files anyone who installs it can read. The Next.js app is that
boundary and does nothing else.

**Why the viva runs in the side panel.** It used to run in a separate window,
because the first version embedded the app in an iframe and the microphone never
worked: a cross-origin frame inside a `chrome-extension://` page is its own
permission context, so a grant given to `localhost:3000` doesn't carry over and
the prompt it raises can't reliably be answered from the panel. Vendoring the
Agora SDKs and running the session on the extension's own origin removes the
frame and the problem, so the viva sits next to what you're reading again. The
standalone page at `/viva` still works if you want it in a tab.

## What it does with the Agora pipeline

| Capability | Where |
|---|---|
| Barge-in | Talk over Athena and she stops. Also a "cut in" button using `interrupt()`. |
| Session memory | `maxHistory: 40`, which is what lets her remember what she already judged and circle back. |
| Adaptive difficulty | Correct means harder, partial means narrower, wrong means move on and return. |
| Dynamic questions | Generated from the passage. No question bank. |
| Text injection | Typed answers and the "go back over my weak topics" button both use `sendText()`. |
| Two-phase session | Orientation first, examination only when you ask for it. |
| Second screen | `/watch/<id>` mirrors the map read-only, and a watcher can ask Athena to revisit a topic. |

## The summary

Ending a viva produces a markdown file: strengths, recoveries, weak areas, a
suggested revision order, and the transcript. It's rendered from recorded
session state rather than a closing LLM call, so it can't contradict the
judgements you watched land on the chips, and it can't fail at the end of a run.

`POST /api/athena/summary`, then `GET /api/athena/summary?id=...&download=1`,
which responds with `Content-Disposition: attachment`.

The extension also keeps a history of every viva in `chrome.storage.local` and
rolls it up into one revision list across sessions. Selecting topics from that
list starts a fresh viva on just those, rebuilt from the passages they came from.

## Setup

Needs Node 22+, pnpm 10, the [Agora CLI](https://github.com/AgoraIO/cli), and Chrome.

pnpm 10 specifically: pnpm 11 turns the sample's harmless
`ERR_PNPM_IGNORED_BUILDS` warning into a hard failure. `npm install -g pnpm@10`.

```bash
# already done in this repo, listed for reference
agora init athena --template nextjs --new-project --dir quickstart

cd quickstart
pnpm install
pnpm dev          # http://localhost:3000
```

`agora init` writes `quickstart/.env.local` with `NEXT_PUBLIC_AGORA_APP_ID` and
`NEXT_AGORA_APP_CERTIFICATE`, and enables rtc, rtm and convoai on the project.
No other API keys are needed: the speech recognition, the model, and the speech
synthesis are all resold through Agora.

Then load the extension:

1. `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked, and pick [`extension/`](extension/)

Click the Athena icon, paste a few paragraphs, and hit Start viva. The first run
opens a tab asking for the microphone, because Chrome grants that per origin and
the extension has its own.

You can also open <http://localhost:3000/demo.html>, highlight a section, and
click the icon, which pre-fills the box. Highlight capture is best-effort:
Chrome blocks injection on `chrome://` pages, the Web Store and the built-in PDF
viewer, and a selection can be collapsed before the panel reads it. Pasting
always works.

Run the parser tests:

```bash
cd quickstart && node --import tsx scripts/athena-parse.test.ts
```

## Layout

```
athena/
  extension/            Chrome extension (MV3)
    background.js       selection capture
    sidepanel.*         paste box, viva UI, revision list
    viva.js             RTC/RTM session
    parse.js            control channel reader (port of lib/athena/parse.ts)
    revision.js         cross-session history
    vendor/             Agora web SDKs, so there's no build step
  quickstart/           the Agora Next.js quickstart, extended
    app/api/athena/     session, token, start, stop, summary, live
    app/viva/           standalone viva page
    app/watch/[id]/     read-only second screen
    components/athena/
    lib/athena/         prompt, parser, summary renderer
    scripts/athena-parse.test.ts
  docs/
```

Everything Athena adds is namespaced under `athena/`. The quickstart's own
architecture, token flow, env names and commands are unchanged apart from one
fix noted below.

## Models

| Service | Role | Key |
|---|---|---|
| Agora ConvoAI | Agent orchestration and lifecycle | App ID + Certificate |
| Agora RTC | Audio | same |
| Agora RTM | Transcripts, agent state, text injection | same |
| Deepgram `nova-3` | Speech recognition | none, resold via Agora |
| OpenAI `gpt-4o-mini` | Examiner reasoning and the control channel | none, resold via Agora |
| MiniMax `speech_2_6_turbo` | Speech synthesis | none, resold via Agora |

## Limitations

Athena is a study aid, not a graded assessment. That's on screen during the
session and at the top of every summary file. She can examine material you give
her and tell you where you're weak. She can't grade you, replace an examiner, or
judge material outside the passage.

Ways she can be wrong:

- Speech recognition mishears technical vocabulary, especially acronyms, so a
  correct answer can be transcribed into a wrong one.
- `gpt-4o-mini` is small and can misjudge a subtle but correct answer, or accept
  a fluent but empty one.
- Topic quality depends on the passage. A well-structured section gives good
  topics, a random paragraph gives vague ones.
- The control channel depends on model compliance. The parser is tolerant, so a
  dropped payload means a chip updates a turn late rather than a crash, but a
  chip can lag the conversation.

Known limits of the build:

- Sessions live in an in-memory `Map`, so they don't survive a server restart or
  scale across replicas.
- One speaker. No diarisation, so a second voice in the room is treated as you.
- English only, per the ASR config.
- CORS is allowed by origin scheme (`chrome-extension://`, localhost) because
  unpacked extension IDs aren't known ahead of time. Fine for a local dev
  server, not for a public deployment.
- Not deployed. Runs on `localhost:3000`, and the extension's server URL is a
  constant in `sidepanel.js`.
- One upstream fix: `tailwind.config.ts` used `require()` inside a TypeScript
  config, which throws under Node 24+ where the config loads as ESM. Changed to
  an import. No other sample file was touched.

## Next

- Several students in one channel, examined in turn, with their maps compared.
- Aggregate maps across a class, so a lecturer can see which concept everyone is
  amber on.
- Spaced repetition: weak topics scheduled back for a second viva days later.
- Memory across sessions, so she can open with "last week you struggled with
  isolation levels, let's start there."
