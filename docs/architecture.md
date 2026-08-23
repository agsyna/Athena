# Athena — system architecture

## Components

```mermaid
flowchart TB
    subgraph browser["Google Chrome"]
        page["Any web page<br/><i>the student's study material</i>"]
        sw["Service worker<br/><code>background.js</code>"]
        panel["Side panel<br/><code>sidepanel.js</code>"]
        vivawin["Viva window<br/><i>own popup → localhost:3000/viva</i>"]
    end

    subgraph app["Athena app — Next.js (localhost:3000)"]
        session["<code>/api/athena/session</code><br/>passage → session id"]
        start["<code>/api/athena/start</code><br/>builds prompt, starts agent"]
        token["<code>/api/generate-agora-token</code><br/><i>quickstart, unchanged</i>"]
        stop["<code>/api/stop-conversation</code><br/><i>quickstart, unchanged</i>"]
        summary["<code>/api/athena/summary</code><br/>renders the .md file"]
        store[("In-memory<br/>session store")]
    end

    subgraph agora["Agora"]
        engine["Conversational AI Engine"]
        rtc["RTC channel<br/><i>audio</i>"]
        rtm["RTM channel<br/><i>transcripts, agent state</i>"]
    end

    subgraph vendors["Resold through Agora — no keys of ours"]
        stt["Deepgram nova-3"]
        llm["OpenAI gpt-4o-mini"]
        tts["MiniMax speech_2_6_turbo<br/><b>skip_patterns: [5]</b>"]
    end

    page -->|"highlighted text<br/>on user gesture"| sw
    sw -->|"chrome.storage.session"| panel
    panel -->|"POST passage"| session
    session --> store
    panel -->|"opens window ?s=id&a=1"| vivawin

    vivawin --> token
    vivawin -->|"POST session_id"| start
    start --> store
    start -->|"agora-agents SDK"| engine
    engine --> stt --> llm --> tts
    engine -->|"agent joins"| rtc
    engine -->|"publishes"| rtm

    vivawin <-->|"mic / audio"| rtc
    rtm -->|"TRANSCRIPT_UPDATED<br/>AGENT_STATE_CHANGED"| vivawin
    vivawin -->|"sendText / interrupt"| rtm

    vivawin -->|"final state"| summary
    summary --> store
```

## Why the pieces sit where they do

**The App Certificate never leaves the server.** It signs RTC and RTM tokens and authenticates ConvoAI REST calls. A Chrome extension is readable by anyone who installs it, so the Next.js app is the trust boundary. This is why a backend is structural here, not optional.

**The extension captures, the app converses.** Selection capture needs `activeTab`, granted only on a user gesture, so it happens in the service worker at click time. Everything voice-related stays in the app, which already contains the official quickstart's correctness work — StrictMode-safe join, microphone track lifecycle, RTM identity matching the token subject, transcript UID remapping.

**The passage travels by id, not by URL.** A highlighted passage runs to thousands of characters, past what is safe in a query string. The extension POSTs it and passes an 8-character id.

**The viva gets its own window, and this is not a stylistic choice.** It was embedded in the side panel first. A cross-origin frame inside a `chrome-extension://` page is a separate microphone permission context — Chrome neither inherits a grant already given to `localhost:3000` nor reliably lets the resulting prompt be answered, returning `NotAllowedError: Permission dismissed`. A top-level window prompts normally and the grant persists. The service worker parks it against the right edge of the browser window so it still sits beside the material.

## Call sequence for one viva

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant SW as Service worker
    participant P as Side panel
    participant A as Athena app
    participant E as ConvoAI Engine
    participant C as RTC + RTM

    S->>SW: highlights a passage, clicks the icon
    SW->>SW: executeScript → window.getSelection()
    SW->>P: stash in chrome.storage.session, open panel
    P->>A: POST /api/athena/session {passage}
    A-->>P: {session_id}
    P->>SW: open window /viva?s=session_id&a=1
    SW->>A: window opens, viva auto-starts

    A->>A: GET /api/generate-agora-token
    par
        A->>E: POST /join — Athena prompt, skipPatterns [5]
        E-->>A: {agent_id, RUNNING}
    and
        A->>C: RTM login + subscribe
    end
    A->>C: RTC join + publish microphone
    E->>C: agent joins the channel
    E->>S: greeting (TTS)

    A->>C: sendText "[athena:system] begin"
    Note over E: Athena picks 4–6 topics from the passage
    E->>C: "…first question… {topics:[…],focus:'…'}"
    C->>A: TRANSCRIPT_UPDATED (full text, braces intact)
    Note over A: TTS spoke only the question —<br/>skip_patterns stripped the braces
    A->>A: parse → render chips

    loop each exchange
        S->>C: spoken answer
        E->>C: "…next question… {focus:…, mark:{topic,result}}"
        C->>A: TRANSCRIPT_UPDATED
        A->>A: chip flips — green / amber, with a pulse
    end

    Note over E,S: Athena returns to an amber topic;<br/>a correct answer flips it green — the recovery beat

    S->>A: "End viva"
    A->>E: POST /stop-conversation
    A->>A: POST /api/athena/summary → downloadable .md
```

## The silent control channel

```mermaid
flowchart LR
    L["LLM turn<br/><code>Good. What does that cost on writes?<br/>{&quot;mark&quot;:{&quot;topic&quot;:&quot;Normalization&quot;,&quot;result&quot;:&quot;correct&quot;}}</code>"]
    T{"TTS<br/>skip_patterns: [5]"}
    SP["🔊 spoken<br/><i>Good. What does that cost on writes?</i>"]
    TR["📝 transcript over RTM<br/><i>full text, braces intact</i>"]
    PA["parseTurn()"]
    UI["chip → green + pulse"]
    CAP["caption → spoken text only"]

    L --> T
    T -->|"braces stripped"| SP
    L --> TR
    TR --> PA
    PA -->|"control"| UI
    PA -->|"spoken"| CAP
```

Per the [join endpoint spec](https://docs-md.agora.io/en/conversational-ai/rest-api/agent/join.md), `skip_patterns` value `5` skips content in curly braces, and the real-time transcript *"restores the complete text after each sentence finishes."* The student hears one thing; the app sees both.

**Only one brace pair per turn is requested.** The engine documents that it skips *"the first outermost bracket pair"*, so a second object in the same turn risks being read aloud. The prompt enforces one object; the parser takes the last complete span if the model disobeys.

## Token model

Both tokens come from the quickstart's unmodified `/api/generate-agora-token`, built with `RtcTokenBuilder.buildTokenWithRtm` — one credential covering RTC and RTM.

| Identity | Token subject | Notes |
|---|---|---|
| Student (browser) | `uid` from the token response | RTM must log in with **this exact identity** — a mismatch surfaces as a generic "failed to start conversation" |
| Athena (agent) | `agent_rtc_uid` = `"123456"` (string) | `remoteUids` restricts her to the student's audio only |

Renewal on `token-privilege-will-expire` fetches RTC and RTM tokens in parallel and renews both.

## Failure modes and what the student sees

| Failure | Behaviour |
|---|---|
| Athena app not running | Panel: "Athena server is not reachable", with the command to start it |
| Page cannot be injected (`chrome://`, PDF viewer, Web Store) | Panel explains why and suggests the right-click menu |
| Selection too short | Panel states the minimum and asks for more |
| Session expired | Viva page asks the student to re-highlight |
| Agent fails to join | Error with a retry button; nothing hangs |
| Pipeline error mid-viva | `AGENT_ERROR` / `MESSAGE_ERROR` render in an alert strip; the session continues |
| Token renewal fails | Warning shown before the session drops |
| Malformed control payload | Dropped silently; the chip updates on the next valid payload |
| Summary generation fails | Session still ends cleanly, with a message |
