# Demo script

One flow for both the recorded video and the live demo. The whole thing hangs on
beat 7, and everything before it exists to set that up.

## Before you start

- [ ] `cd quickstart && pnpm dev`, and confirm localhost:3000 is up
- [ ] Extension loaded at `chrome://extensions` (Developer mode, Load unpacked, `extension/`)
- [ ] Microphone already granted to the extension. Do that on a throwaway run, not on camera.
- [ ] <http://localhost:3000/demo.html> open
- [ ] Demo passage also on the clipboard, in case the highlight shortcut misses
- [ ] Headphones on. Without them the agent hears itself and interrupts itself.
- [ ] Quiet room. Deepgram will happily transcribe a passing conversation as your answer.

Run it once end to end before recording. Not a rehearsal of the words, just a
check that the mic prompt is out of the way and the agent joins.

## The beats

**1. Frame the problem (20s)**

> I can read a page on database indexing and feel like I know it. I find out I
> didn't in the exam, when someone asks me why. Nothing between the textbook and
> the exam makes you say it out loud.

**2. The passage (15s)**

Highlight the Indexing and Transactions sections on the demo page, then click
the Athena icon. The side panel opens with the text already in the box.

> Any page. Anything I'm already reading.

Click Start viva. The viva runs in the panel, right next to the notes.

If the highlight doesn't land, paste into the box. Pasting is the primary input,
so this isn't a visible failure.

**3. She orients you (20s)**

Athena summarises what the material covers, names the areas she would examine,
and asks whether you want to be examined or want anything explained first.

> She read it and told me what I'm dealing with. She hasn't started testing me,
> that's my call.

Say "go ahead, examine me." Four to six grey chips appear.

> Those topics came from what I pasted. Nothing hard-coded.

**4. Answer well (30s)**

Answer the first question properly and watch the chip go green. Something like:
*"A B+ tree keeps all the records in the leaves and links them, so a range scan
just walks the leaf level instead of re-descending the tree."*

> Green. She judged that in the same breath she asked the next question. No
> second model, no extra round trip.

**5. Answer badly, on purpose (30s)**

Next question, be vague: *"It, uh, it makes queries faster because of the
ordering, I think."* Chip goes amber.

> Amber. Not wrong exactly, she's saying I didn't actually explain it.

**6. Interrupt her (20s)**

While she's mid-sentence on the next question, talk over her: *"sorry, can you
rephrase that?"* She stops immediately.

> I cut her off. That's barge-in. She stopped listening to herself and started
> listening to me.

**7. The recovery (45s)**

Keep going through the remaining topics. Somewhere in here Athena comes back to
the amber topic on her own and reframes the question. Answer it properly this
time, then stop talking and let the chip flip. It pulses green.

> I didn't ask her to do that. She kept track of what I hadn't got, came back to
> it, and asked it a different way. That's the thing I wanted to see. Not a
> score at the end, but the moment it changes.

If she hasn't circled back by the time the topics run out, press "Go back over
my weak topics". That's human control over the session, not a fallback.

**8. The summary (25s)**

Click End viva. Show the counts, the bubble map and the focus list, then
Download.

> Strengths, what I recovered, what to revise, in order. It's built from the
> same judgements I watched land on those chips, so it can't tell me something
> different from what I just saw.

**9. Close (20s)**

> One Agora agent. No second model, no classifier, no extra API key. Speech
> recognition, the model and the voice all come through Agora. The judgements
> ride down the same voice pipeline as the speech, in curly braces the TTS is
> told to skip.

## Answers worth preparing

You need to answer well on demand. A fumbled "good" answer wastes the green beat.

| Topic | A strong answer |
|---|---|
| Indexing | B+ tree. Internal nodes are just keys, records live in linked leaves, so range scans walk the leaf level. Costs you on every write, since the index has to be maintained too. |
| Transactions | Repeatable read stops the same row changing under you, but new rows matching your predicate can still appear, which is a phantom. Serializable is the one that forbids those. |
| Joins | Hash join builds a table on the smaller side and streams the bigger one past it. Equality only, you can't hash a range predicate. |
| Normalization | 3NF removes transitive dependencies: a non-key attribute mustn't determine another non-key attribute. |

And one deliberately weak answer for beat 5. Vague, not silent. Silence makes
her ask if you're still there.

## If something goes wrong

| Problem | Do this |
|---|---|
| Microphone blocked | The panel opens a tab asking for it. Allow there, then press Start viva again. |
| Highlight doesn't land in the box | Paste it. That's the designed primary path, so don't draw attention to it. |
| Agent doesn't join | `agora project doctor --deep`. Usually RTM enablement lagging, so wait and retry. |
| Chips don't appear | She hasn't taken her first turn. Say "I'm ready." |
| A chip lags the conversation | Keep going, it catches up on the next payload. Don't narrate it. |
| She won't circle back | Press "Go back over my weak topics" and frame it as human control. |
| Everything is broken | Fall back to the recorded video. Have it open in a tab. |

## Timing

| Beat | Running total |
|---|---|
| 1-3 setup | 0:50 |
| 4-5 green then amber | 1:50 |
| 6 interruption | 2:10 |
| 7 recovery | 2:55 |
| 8 summary | 3:20 |
| 9 close | 3:40 |

Inside 3-5 minutes with room to spare. If it's running long, cut beat 1, not
beat 7.
