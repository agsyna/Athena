# Athena

**Paste or highlight anything you're studying. Have a live spoken viva about it.**

Athena is a Chrome extension that turns any passage — a lecture note, a Canvas page, a blog post — into a real-time spoken oral examination. Paste it into the side panel, or highlight it on the page and let Athena pick it up. Athena asks, listens, and picks her next question based on how the last answer went. You can cut in mid-sentence. A live understanding map on screen tracks what you've got and what you haven't, chip by chip, as the conversation happens.

Built on the [Agora Conversational AI Engine](https://docs.agora.io/en/conversational-ai/overview/product-overview).

---

## The problem it solves

Reading is not the same as knowing. Students discover the gap in the exam room, because nothing between the textbook and the exam makes them *say the thing out loud and be pushed on it*. A viva does that, but a viva needs an examiner, and examiners don't scale.

Athena is an examiner that is always available, examines the specific material in front of you rather than a fixed question bank, and shows you your own understanding forming in real time.

**Target user:** a student preparing for a technical viva, oral exam, or interview — anyone who needs to be able to *defend* material, not just recognise it.

---

## What makes it different

Most study bots quiz you from a fixed list. Athena does three things that a quiz cannot:

1. **She adapts mid-conversation.** A correct answer earns a harder follow-up. A partial answer keeps her on the topic with a narrower question. A wrong answer makes her move on — and come back later.
2. **She circles back, and you watch it land.** The topic you fumbled sits amber on screen. Several minutes later Athena returns to it unprompted, reframes the question, and when you get it the chip flips green with a visible pulse. That recovery moment is the point of the product.
3. **She admits when she can't tell.** An ambiguous answer produces a clarifying question, not a silent guess and a wrong mark.

---

## How the understanding map works

This is the technically interesting part, and it needs no second model, no classifier call, and no vendor API key.

The Agora ConvoAI join payload supports [`tts.skip_patterns`](https://docs-md.agora.io/en/conversational-ai/rest-api/agent/join.md). Setting it to `5` tells the engine to strip **curly-brace content before speech synthesis**. The same spec states that the real-time transcript *"restores the complete text after each sentence finishes."*

That gives Athena a silent side-channel straight down the existing voice pipeline:

```
Athena's LLM output:
  "Good — so what does that cost you on writes? {"focus":"Indexing",
   "mark":{"topic":"Normalization","result":"correct"}}"

  → TTS speaks:      "Good — so what does that cost you on writes?"
  → Transcript gets: the full string, braces included
  → Browser parses:  the control payload, flips the Normalization chip green
```

The student never hears it. The app always sees it. One model, one call, one round trip.

The prompt contract lives in [`quickstart/lib/athena/prompt.ts`](quickstart/lib/athena/prompt.ts); the reader and state reducer in [`quickstart/lib/athena/parse.ts`](quickstart/lib/athena/parse.ts), with 17 unit tests in [`quickstart/scripts/athena-parse.test.ts`](quickstart/scripts/athena-parse.test.ts).

> **Why this beats the obvious alternatives.** A hidden-tag scheme without `skip_patterns` gets read aloud. A second classifier LLM call per turn adds latency, cost, an API key, and a second opinion that can contradict what the student was just told. An MCP tool call would work but requires the agent's tool endpoint to be publicly reachable — a tunnel, on conference wifi, mid-demo.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full diagram and call sequence.

```
┌──────────────────────────────┐
│  Chrome extension (MV3)      │
│  · service worker — captures a highlighted passage (optional accelerator)
│  · side panel   — paste box; exchanges the passage for a session id,
│                   then embeds the viva
└───────────────┬──────────────┘
                │  POST /api/athena/session   (passage → session id)
                ▼
┌──────────────────────────────┐
│  Athena app (Next.js)        │   ← the official Agora Next.js quickstart,
│  · /viva            — the viva surface        extended, not replaced
│  · /api/athena/start    — starts the agent
│  · /api/athena/summary  — builds the revision file
│  · /api/generate-agora-token, /api/stop-conversation  (unchanged)
└───────────────┬──────────────┘
                │  agora-agents SDK
                ▼
┌──────────────────────────────┐
│  Agora Conversational AI Engine │
│  Deepgram nova-3 → GPT-4o-mini → MiniMax speech_2_6_turbo
│  agent joins the RTC channel; transcripts + state over RTM
└──────────────────────────────┘
```

**Why a server at all:** the Agora App Certificate signs RTC/RTM tokens and authenticates the ConvoAI REST calls. It is a secret and can never sit in extension code. The Next.js app is that boundary.

**Why the viva UI is served by the app rather than bundled into the extension:** the official quickstart's client carries a lot of hard-won correctness — StrictMode-safe join, microphone track lifecycle, RTM identity matching the token subject, transcript UID remapping. Re-implementing that inside an MV3 bundle would risk all of it for no user-visible gain. The side panel embeds the page instead, with `allow="microphone"` delegating the permission to `localhost`, an origin Chrome will reliably prompt for.

---

## Conversational capabilities demonstrated

| Capability | Where it shows up |
|---|---|
| **Barge-in / interruption** | Talk over Athena and she stops. Also exposed as a "Cut in" button using the toolkit's `interrupt()`. |
| **Session memory** | `maxHistory: 40` — Athena remembers which topics she already judged, which is what lets her circle back. |
| **Adaptive difficulty** | Correct → harder follow-up; partial → narrower question on the same topic; wrong → move on and return later. |
| **Dynamic questioning** | Questions are generated from the student's own highlighted passage. There is no question bank. |
| **Recovery from correction** | A wrong or partial topic revisited and answered correctly flips the chip green and is recorded as *recovered* in the summary. |
| **Client → agent text injection** | "Go back over my weak topics" sends a steering message into the live session via `sendText()`. |

---

## External action

Ending a viva produces a structured revision summary as a downloadable `.md` file: strengths, recoveries, weak areas, a suggested revision order, and the full transcript.

It is rendered from recorded session state rather than a closing LLM call, so it can never contradict the judgements the student watched land on the chips during the session — and it cannot fail at the end of a demo.

Endpoint: `POST /api/athena/summary` → `GET /api/athena/summary?id=…&download=1`, which responds with `Content-Disposition: attachment`.

---

## Setup

**Prerequisites:** Node.js 22+, pnpm 10, the [Agora CLI](https://github.com/AgoraIO/cli), and Google Chrome.

> pnpm **10** specifically — pnpm 11 turns the sample's benign `ERR_PNPM_IGNORED_BUILDS` warning into a hard failure through its dependency-status check. `npm install -g pnpm@10`.

```bash
# 1. Provision an Agora project and scaffold the app (already done in this repo)
agora init athena --template nextjs --new-project --dir quickstart

# 2. Install and run
cd quickstart
pnpm install     # ERR_PNPM_IGNORED_BUILDS is a warning, not an error
pnpm dev         # http://localhost:3000
```

`agora init` writes `quickstart/.env.local` with `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE`, and enables `rtc`, `rtm`, and `convoai` on the project. **No other API keys are required** — speech recognition, the language model, and speech synthesis are all resold through Agora.

**Load the extension:**

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the [`extension/`](extension/) folder

**Try it:** click the Athena icon to open the side panel, paste a few paragraphs into the box, and click **Start viva**. Grant microphone access when Chrome asks.

Or use the shortcut: open <http://localhost:3000/demo.html>, highlight a section, then click the Athena icon — the highlighted text lands in the box ready to go.

> **On highlighting.** Pasting is the primary input and always works. Highlight capture is an accelerator layered on top, because a page selection is genuinely fragile: it can be collapsed before the panel reads it, the panel cannot re-read the page by itself, and Chrome refuses injection outright on `chrome://` pages, the Web Store, and the built-in PDF viewer. When capture works the text is pre-filled; when it doesn't, the textarea is already there.

---

## Repository layout

```
athena/
├── extension/              Chrome extension (MV3) — capture + control surface
│   ├── manifest.json
│   ├── background.js       captures the selection on the user gesture
│   └── sidepanel.{html,js,css}   paste box + embedded viva
├── quickstart/             the Athena app — official Agora Next.js quickstart, extended
│   ├── app/viva/           the viva surface
│   ├── app/api/athena/     session, start, summary
│   ├── components/athena/  viva UI + understanding map
│   ├── lib/athena/         prompt, control-channel parser, summary renderer
│   ├── public/demo.html    self-contained study material for the demo
│   └── scripts/athena-parse.test.ts
└── docs/
    ├── architecture.md
    └── demo-script.md
```

Everything Athena adds is namespaced under `athena/`. The quickstart's own architecture, token flow, env names, lifecycle, and documented commands are unchanged — the one exception is noted under Known limitations.

Run the parser tests:

```bash
cd quickstart && node --import tsx scripts/athena-parse.test.ts
```

---

## External APIs and models

| Service | Role | Key needed |
|---|---|---|
| Agora Conversational AI Engine | Agent orchestration and lifecycle | App ID + App Certificate |
| Agora RTC | Real-time audio transport | same |
| Agora RTM | Transcripts, agent state, client → agent messages | same |
| Deepgram `nova-3` | Speech recognition | **no** — resold via Agora |
| OpenAI `gpt-4o-mini` | Examiner reasoning and the control channel | **no** — resold via Agora |
| MiniMax `speech_2_6_turbo` | Speech synthesis | **no** — resold via Agora |

---

## AI limitations and safety

Athena is a **study aid, not a graded assessment.** That sentence is on screen throughout the session and at the top of every summary file.

**What Athena can do:** examine material you give her, judge spoken answers against that material, adapt her questioning, and tell you where you are weak.

**What she cannot do:** grade you, replace an examiner, or reliably judge material outside the passage you highlighted. She is not a source of truth about the subject — she is a mirror for your own explanation of it.

**When she asks instead of guessing.** The prompt instructs Athena that if an answer is ambiguous, off-topic, or otherwise unjudgeable, she must ask a clarifying question and **emit no `mark`**. A topic stays neutral rather than being silently scored wrong. This matters: an unfair amber chip teaches the student the wrong thing about their own understanding.

**Known ways she can be wrong.** Speech recognition mishears technical vocabulary, especially acronyms and unusual names — a correct answer can be transcribed into a wrong one. `gpt-4o-mini` is a small model and can misjudge a subtle but correct answer, or accept a fluent but hollow one. Topic extraction quality depends on the passage: a well-structured section yields good topics, a random paragraph yields vague ones.

**Human control.** The student can mute, cut Athena off, redirect her to weak topics with one button, or end the session at any moment. Nothing is recorded server-side beyond the in-memory session, and nothing is sent anywhere except Agora's pipeline.

**Failure behaviour.** Every failure mode surfaces visibly rather than hanging: the extension reports an unreachable server with the command to start it; a failed agent start shows an error with a retry; pipeline errors from `AGENT_ERROR` / `MESSAGE_ERROR` render in an alert strip; a failed summary still ends the session cleanly.

---

## Known limitations

- **Single user, single machine.** Sessions live in an in-memory `Map` and do not survive a server restart or scale across replicas.
- **One speaker.** No diarisation — a second voice in the room is treated as the student.
- **English only**, per the ASR configuration.
- **Highlight capture is best-effort.** Chrome blocks injection on `chrome://` pages, the Web Store, and the built-in PDF viewer, and a selection can be collapsed before the panel reads it. Pasting is the primary path and is unaffected.
- **CORS is permissive by origin scheme** (`chrome-extension://`, `localhost`) because unpacked extension IDs are not known ahead of time. Fine for a local dev server; not suitable for public deployment as written.
- **The control channel depends on model compliance.** `gpt-4o-mini` occasionally omits or malforms the payload. The parser is tolerant — a dropped payload means a chip updates one turn later, never a crash — but a chip can lag the conversation.
- **One upstream fix to the quickstart.** `tailwind.config.ts` used `require()` inside a TypeScript config, which throws under Node 24+ where the config loads as ESM. Changed to an `import`. No other sample file was modified.
- **Not deployed.** Runs on `localhost:3000`. The extension's server URL is a constant in `sidepanel.js`.

---

## Where this goes next

- **Study groups.** Several students in one RTC channel, Athena examining them in turn and comparing understanding maps — the collaborative-education case the architecture already supports.
- **Teacher-facing analytics.** Aggregate understanding maps across a cohort show which concepts a whole class is amber on, which is the signal a lecturer actually wants.
- **Spaced repetition.** Weak topics from a session scheduled back for a second viva days later, so recovery is measured rather than assumed.
- **Persistent memory across sessions**, so Athena can open with "last week you struggled with isolation levels — let's start there."
