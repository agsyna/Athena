# Athena — how to pitch it

The demo script ([`demo-script.md`](demo-script.md)) is what you *do* on screen.
This is what you *argue* around it. Different job.

---

## The one line

> **Athena turns anything you're reading into a spoken viva — she examines you on
> your own material, adapts to every answer, and shows your understanding forming
> on screen as you talk.**

Say this first, every time, unchanged. If a judge walks away with one sentence,
this is the sentence.

---

## The 60-second version

> "You can read a page on database indexing and feel like you know it. You find
> out you didn't in the exam room, when someone asks you *why*. Nothing between
> the textbook and the exam makes you say it out loud and get pushed on it.
>
> A viva does exactly that — it's the oldest assessment format we have and the
> best one, and it's the least scalable thing in education. It needs an examiner
> in a room with one student.
>
> Athena is that examiner. You paste anything you're studying — a lecture note, a
> Canvas page — and she reads it, tells you what she'd examine you on, and asks
> you to explain it out loud. She asks harder questions when you're right,
> narrower ones when you're half right, and she comes back later to the thing you
> got wrong to see if you've fixed it. There's no question bank; the questions
> come from your passage.
>
> And you can watch her judgement land. Every topic is a chip on screen that goes
> green, amber or grey as you talk. At the end you get a revision file: strengths,
> what you recovered, what to revise, in order."

Then demo. Do not explain the architecture before the demo — you'll spend your
credibility on plumbing before they care about the product.

---

## The three claims to defend

Everything else is detail. These are what make it not-a-chatbot.

**1 · The material is the student's, not ours.**
Every quiz app ships a question bank. The bank is the product and the bank is the
ceiling. Athena has no bank — she generates the topic list and every question from
the passage in front of her. That's why she works for a first-year physiology
student and a final-year DBMS student without us doing anything.

**2 · The assessment is legible while it happens.**
Almost every AI tutor is a wall of text that ends in a verdict you have to trust.
Athena's judgements are visible per-topic, per-turn, *as she speaks*. The student
sees themselves being assessed and can argue with it. That's the difference
between a grade and a mirror.

**3 · The judgements ride the voice pipeline itself.**
No second model, no classifier call, no extra round trip, no vendor API key.
One agent emits speech and structured state in the same breath; the TTS is
configured to skip the braces, so the student never hears it and the app always
sees it. Cost, latency and consistency all fall out of that one decision.

---

## The technical beat (30 seconds, delivered *after* the demo)

> "One thing worth knowing about how that map works. The Agora join payload has
> `tts.skip_patterns` — set it to 5 and the engine strips curly-brace content
> before speech synthesis, but the real-time transcript still restores the full
> text. So Athena's model emits her question *and* a JSON judgement in the same
> response. The student hears the question. The browser parses the judgement.
> One model, one call, one round trip.
>
> The alternatives are all worse: a hidden tag without skip_patterns gets read
> aloud. A second classifier LLM per turn adds latency, cost, and a second opinion
> that can contradict what the student was just told. An MCP tool call needs the
> agent's endpoint publicly reachable — a tunnel, on conference wifi, mid-demo."

That last clause matters more than it looks. It shows you chose under real
constraints rather than picking the first thing that worked.

---

## Mapping to the problem statement

Judges score against the brief. Have this table in your head, and name the
requirement out loud as it happens in the demo — "that's the interruption
requirement" — so nobody has to infer it.

| The brief asks for | Athena's answer | Where they see it |
|---|---|---|
| Natural real-time conversation | Agora ConvoAI: Deepgram nova-3 → GPT-4o-mini → MiniMax, sub-second | Beats 3–4 |
| Student interruption + follow-ups | True barge-in; also a "Cut in" button | **Beat 6**, called out |
| Memory within the session | `maxHistory: 40` + a running topic ledger — she knows what she's already judged | Beat 7 |
| Adaptive difficulty | Correct → harder; partial → narrower, same topic; wrong → move on and return | Beats 4–5 |
| Dynamic questioning, not a script | No question bank at all — topics extracted from the pasted passage | Beat 3 ("nothing hard-coded") |
| At least one external action | Downloadable `.md` revision file, rendered from recorded state | Beat 8 |
| Handling not knowing | Ambiguous answer → clarifying question and **no mark emitted**; the chip stays neutral | Say it at beat 5 |
| Human / teacher control | Mute, cut in, "go back over my weak topics", end session; the summary is the teacher artifact | Beat 7 |
| Beyond one-to-one Q&A | Two-phase session: she orients and teaches on request before she examines | Beat 3 |

The brief's own example scenario **is a technical viva**. Say that: "the example
in the problem statement is a student preparing for a viva — we built that, and
then went past it."

---

## Where you're weak, and what to say

Pre-empt these. A judge who finds a hole you haven't named trusts nothing else
you said; a hole you named yourself reads as engineering judgement.

**"The statement is about *collaborative* education. This is one student."**
The honest answer, and it's a good one:
> "Right now the collaboration is student-to-examiner, plus the teacher-facing
> artifact at the end. But the transport is an Agora RTC channel — multi-party is
> what it's for. Several students in one channel with Athena examining them in
> turn, comparing understanding maps, is a UI problem on top of this
> architecture, not a rebuild. And the aggregate view is the thing a lecturer
> actually wants: which concept is the whole cohort amber on."

Don't oversell it as built. "The architecture already supports it" is credible;
"we have study groups" is not, and they'll ask you to show it.

**"How do you know she's judging correctly?"**
> "We don't claim she grades. It's a study aid, and that sentence is on screen the
> whole session and at the top of every summary. gpt-4o-mini can accept a fluent
> but hollow answer. What we did control is that she never *silently* guesses —
> an unjudgeable answer produces a clarifying question and no mark, because an
> unfair amber chip teaches the student the wrong thing about themselves."

**"What if the model doesn't emit the JSON?"**
> "It happens. The parser is tolerant — a dropped payload means a chip updates one
> turn later, never a crash. And the summary is rendered from recorded session
> state, not a closing LLM call, so it can't contradict the judgements the student
> already watched land."

**"Isn't this just ChatGPT voice mode?"**
> "Voice mode answers your questions. Athena asks them, tracks which ones you
> failed, and comes back to them. And it examines the passage in front of you
> rather than the whole internet, which is what makes the judgement about *your
> material* rather than the model's general knowledge."

**"Why a Chrome extension?"**
> "Because studying already happens in a browser tab. We didn't want a place you
> go to study — we wanted it beside the thing you were already reading."

---

## Tuning the pitch to who's in the chair

- **Education / domain judge** — lead with the recovery moment (beat 7) and the
  summary. Say "formative, not summative" and mean it. The pitch is: this is the
  only thing between reading and the exam that makes you *defend* the material.
- **Technical judge** — lead with `skip_patterns` and the alternatives you
  rejected. Mention the 17 parser unit tests, the StrictMode-safe join, and that
  you extended the official quickstart rather than forking it.
- **Sponsor / Agora judge** — one agent, no external API keys, ASR + LLM + TTS all
  resold through Agora, RTM used for three separate things (transcripts, agent
  state, client→agent injection). You used the platform the way it was designed
  and then found a use for a feature nobody built for this.

---

## Delivery notes

- **Lead with the failure, not the feature.** "I read the page and thought I knew
  it" lands. "Athena is an AI-powered adaptive viva platform" does not.
- **Shut up during beat 7.** The chip flipping green is the whole pitch. Let it
  happen in silence and then say one sentence about it.
- **Never apologise for the fallbacks.** Pasting is the primary input. "Go back
  over my weak topics" is human control over the session. Both are features; say
  them in that tone and nobody hears a workaround.
- **Say what it can't do before they ask.** Single machine, English only, one
  speaker, not deployed. Naming limits is the cheapest credibility you can buy.
- **Land on the next step, not on the summary.** Close with spaced repetition and
  cohort analytics — it tells the room this is a product with a second version,
  not a hack that ends when the timer does.
