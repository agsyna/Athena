# Pitch notes

[`demo-script.md`](demo-script.md) is what to do on screen. This is what to say
around it.

## The one line

> Athena turns anything you're reading into a spoken viva. She examines you on
> your own material, adapts to every answer, and shows your understanding
> forming on screen as you talk.

Say this first, unchanged. If someone walks away with one sentence, this is it.

## The 60-second version

> You can read a page on database indexing and feel like you know it. You find
> out you didn't in the exam room, when someone asks you why. Nothing between
> the textbook and the exam makes you say it out loud and get pushed on it.
>
> A viva does exactly that. It's the oldest assessment format there is and the
> least scalable, because it needs an examiner in a room with one student.
>
> Athena is that examiner. You paste anything you're studying, a lecture note or
> a Canvas page, and she reads it, tells you what she'd examine you on, and asks
> you to explain it out loud. She asks harder questions when you're right,
> narrower ones when you're half right, and comes back later to the thing you
> got wrong to see if you've fixed it. There's no question bank. The questions
> come from your passage.
>
> And you can watch her judgement land. Every topic is a chip on screen that
> goes green, amber or grey as you talk. At the end you get a revision file:
> strengths, what you recovered, what to revise, in order.

Then demo. Don't explain the architecture first, or you spend your credibility
on plumbing before anyone cares about the product.

## The three claims

**The material is the student's.** Every quiz app ships a question bank, and the
bank is both the product and the ceiling. Athena has no bank. She generates the
topic list and every question from the passage in front of her, which is why she
works for a first-year physiology student and a final-year DBMS student without
any extra work.

**The assessment is legible while it happens.** Most AI tutors are a wall of text
ending in a verdict you have to trust. Athena's judgements are visible per topic
and per turn, as she speaks, so the student can see themselves being assessed
and argue with it. That's the difference between a grade and a mirror.

**The judgements ride the voice pipeline.** No second model, no classifier call,
no extra round trip, no extra API key. One agent emits speech and structured
state in the same response, and the TTS is configured to skip the braces, so the
student never hears it and the app always sees it.

## The technical beat, after the demo

> One thing worth knowing about how that map works. The Agora join payload has
> `tts.skip_patterns`. Set it to 5 and the engine strips curly-brace content
> before speech synthesis, but the real-time transcript still restores the full
> text. So the model emits her question and a JSON judgement in the same
> response. The student hears the question, the browser parses the judgement.
> One model, one call, one round trip.
>
> The alternatives are worse. A hidden tag without `skip_patterns` gets read
> aloud. A second classifier LLM per turn adds latency, cost, and a second
> opinion that can contradict what the student was just told. An MCP tool call
> needs the agent's endpoint publicly reachable, which means a tunnel, on
> conference wifi, mid-demo.

That last part matters more than it looks. It shows the choice was made under
real constraints rather than by picking the first thing that worked.

## Mapping to the brief

Name the requirement out loud as it happens in the demo, so nobody has to infer
it.

| The brief asks for | Athena's answer | Where |
|---|---|---|
| Natural real-time conversation | Agora ConvoAI: Deepgram nova-3, GPT-4o-mini, MiniMax | Beats 3-4 |
| Interruption and follow-ups | True barge-in, plus a cut-in button | Beat 6 |
| Memory within the session | `maxHistory: 40` and a running topic ledger, so she knows what she already judged | Beat 7 |
| Adaptive difficulty | Correct means harder, partial means narrower on the same topic, wrong means move on and return | Beats 4-5 |
| Dynamic questioning | No question bank, topics extracted from the pasted passage | Beat 3 |
| An external action | Downloadable `.md` revision file, rendered from recorded state | Beat 8 |
| Handling not knowing | Ambiguous answer produces a clarifying question and no mark, so the chip stays neutral | Say it at beat 5 |
| Human control | Mute, cut in, "go back over my weak topics", end session | Beat 7 |
| Beyond one-to-one Q&A | Two-phase session: she orients and teaches on request before examining | Beat 3 |

The brief's own example scenario is a technical viva. Worth saying out loud.

## Weak spots, and what to say

Name these first. A hole someone else finds costs more than one you named.

**"The brief is about collaborative education. This is one student."**

> Right now the collaboration is student to examiner, plus the teacher-facing
> artifact at the end and the read-only watch page. But the transport is an
> Agora RTC channel, which is built for multi-party. Several students in one
> channel with Athena examining them in turn is a UI problem on top of this
> architecture, not a rebuild. And the aggregate view is what a lecturer
> actually wants: which concept is the whole cohort amber on.

Don't oversell it as built. "The architecture supports it" is credible, "I have
study groups" is not, and they'll ask to see it.

**"How do you know she's judging correctly?"**

> She doesn't grade. It's a study aid, and that sentence is on screen the whole
> session and at the top of every summary. gpt-4o-mini can accept a fluent but
> hollow answer. What I did control is that she never silently guesses: an
> unjudgeable answer produces a clarifying question and no mark, because an
> unfair amber chip teaches the student the wrong thing about themselves.

**"What if the model doesn't emit the JSON?"**

> It happens. The parser is tolerant, so a dropped payload means a chip updates
> one turn later rather than a crash. And the summary is rendered from recorded
> session state, not a closing LLM call, so it can't contradict the judgements
> the student already watched land.

**"Isn't this ChatGPT voice mode?"**

> Voice mode answers your questions. Athena asks them, tracks which ones you
> failed, and comes back to them. And she examines the passage in front of you
> rather than the whole internet, which is what makes the judgement about your
> material rather than the model's general knowledge.

**"Why a Chrome extension?"**

> Because studying already happens in a browser tab. I didn't want somewhere you
> go to study, I wanted it beside the thing you were already reading.

## Who's in the chair

- **Education judge.** Lead with the recovery moment (beat 7) and the summary.
  Formative, not summative.
- **Technical judge.** Lead with `skip_patterns` and the alternatives I
  rejected. Mention the 21 parser tests, the StrictMode-safe join, and that the
  official quickstart was extended rather than forked.
- **Agora judge.** One agent, no external API keys, ASR and LLM and TTS all
  resold through Agora, RTM used for three separate things: transcripts, agent
  state, and client-to-agent injection.

## Delivery

- Lead with the failure, not the feature. "I read the page and thought I knew
  it" lands. "An AI-powered adaptive viva platform" does not.
- Shut up during beat 7. The chip flipping green is the pitch. Let it happen in
  silence, then say one sentence about it.
- Don't apologise for the fallbacks. Pasting is the primary input, and "go back
  over my weak topics" is human control over the session. Say them in that tone
  and nobody hears a workaround.
- Say what it can't do before anyone asks. Single machine, English only, one
  speaker, not deployed.
- Close on the next step, not the summary. Spaced repetition and cohort
  analytics say this has a second version.
