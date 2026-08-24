# Athena

Whenever you're reading something online and come across a word, line, or
concept you don't quite get, the usual move is to open another tab, search it,
and somehow lose ten minutes before finding your way back.

Athena cuts out that detour. Highlight whatever you don't understand and ask her
about it. Since she already sees what's on the page, her answer is grounded in
your material and not just a generic search result.

And you can actually talk to her. Ask a follow-up, say what still doesn't make
sense, or ask her to explain it differently. Want a tutor? She'll guide you
through it. Want to be tested? She'll switch into interviewer mode, ask tougher
questions when you're getting it right, and come back to the parts you struggled
with.

A Chrome extension, built on the [Agora Conversational AI Engine](https://docs.agora.io/en/conversational-ai/overview/product-overview).

## What else it does

- **Understanding map.** Every topic from your passage is a chip on screen that
  fills in as she judges your answers. Fumble one and it sits amber until she
  circles back to it.
- **Revision list.** Every session is saved locally and rolled into one list of
  topics ranked by how much they still need work, across everything you've read.
  Pick a few and she re-examines you on just those, using the original passages.
- **Summary.** Sessions end with what was solid, what you recovered, and what to
  revise, downloadable as markdown with the transcript.
- **Second screen.** `/watch/<id>` mirrors the map for a tutor without giving
  them the transcript. They can nudge her back to a topic.
- **Type or talk.** Typed answers take the same path as spoken ones.
- Talk over her and she stops. Mute, redirect her to your weak topics, or end
  the session whenever.

## How the map works

No second model, no classifier call, no extra API key.

The ConvoAI join payload supports [`tts.skip_patterns`](https://docs-md.agora.io/en/conversational-ai/rest-api/agent/join.md).
Set it to `5` and the engine strips curly-brace content before speech synthesis,
while the real-time transcript still restores the full text. So braces are a
side channel down the existing voice pipeline: you never hear it, the app always
sees it.

```
LLM output:  "Good, so what does that cost you on writes?
              {"focus":"Indexing","mark":{"topic":"Normalization","result":"correct"}}"

TTS speaks:  "Good, so what does that cost you on writes?"
App parses:  the payload, and flips the Normalization chip green
```

One model, one call, one round trip. Contract in
[`lib/athena/prompt.ts`](quickstart/lib/athena/prompt.ts), reader in
[`lib/athena/parse.ts`](quickstart/lib/athena/parse.ts), 21 tests in
[`scripts/athena-parse.test.ts`](quickstart/scripts/athena-parse.test.ts).

The extension does capture and UI, the Next.js app holds the App Certificate and
signs tokens, and Agora runs Deepgram, GPT-4o-mini and MiniMax behind one agent.
Diagrams and call sequence in [`docs/architecture.md`](docs/architecture.md).

## Setup

Needs Node 22+, pnpm 10, the [Agora CLI](https://github.com/AgoraIO/cli), and
Chrome. pnpm 10 specifically, since 11 turns the sample's harmless
`ERR_PNPM_IGNORED_BUILDS` warning into a hard failure.

```bash
cd quickstart
pnpm install
pnpm dev          # http://localhost:3000
```

`agora init` has already written `.env.local` with the App ID and Certificate
and enabled rtc, rtm and convoai. No other keys are needed: speech recognition,
the model and the voice are all resold through Agora.

Then load the extension at `chrome://extensions`: Developer mode, Load unpacked,
pick [`extension/`](extension/). Click the icon and paste a few paragraphs. The
first run opens a tab asking for the microphone, since Chrome grants that per
origin.

Tests: `cd quickstart && node --import tsx scripts/athena-parse.test.ts`

## Limitations

Athena is a study aid, not a grader, and that's on screen throughout. She can
explain and examine what you give her and tell you where you're weak. She can't
grade you or judge material outside the passage.

- Speech recognition mishears acronyms, so a correct answer can be transcribed
  into a wrong one, and `gpt-4o-mini` can accept a fluent but empty answer.
- The control channel depends on model compliance. The parser is tolerant, so a
  dropped payload means a chip lags a turn rather than a crash.
- Sessions are an in-memory `Map` and don't survive a restart. The revision
  history does persist, in `chrome.storage.local` on your machine.
- One speaker, English only, and highlight capture doesn't work on `chrome://`
  pages or the PDF viewer. Pasting always does.
- Not deployed. Runs on `localhost:3000`, and CORS is open by origin scheme
  because unpacked extension IDs aren't known ahead of time.
- One upstream fix: `tailwind.config.ts` used `require()` in a TypeScript
  config, which throws under Node 24+. Changed to an import.
