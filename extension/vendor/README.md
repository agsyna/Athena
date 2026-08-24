# Vendored Agora SDKs

Copied verbatim from `quickstart/node_modules` so the viva can run inside the
extension. Manifest V3 forbids loading remote script, so an extension that talks
to Agora has to carry the SDK rather than pull it from a CDN.

| File | Source | Shape |
|---|---|---|
| `agora-rtc.js` | `agora-rtc-sdk-ng/AgoraRTC_N-production.js` | UMD, global `AgoraRTC` |
| `agora-rtm.js` | `agora-rtm/agora-rtm.js` | UMD, global `AgoraRTM` |
| `agora-toolkit.mjs` | `agora-agent-client-toolkit/dist/index.mjs` | ESM, no external imports |

Two things make this work without a bundler:

- Both SDKs ship UMD builds that attach a global when no module loader is
  present, so a plain `<script>` tag is enough.
- The toolkit's ESM bundle has **no external imports** — it inlines everything
  it needs — so it loads as a module with no resolution step.

`agora-rtm.js` contains one `eval` call: protobufjs's `inquire()`, a Node-only
module lookup wrapped in `try/catch`. Under the MV3 content security policy it
throws and is caught, exactly as it already does in any browser.

To refresh after a dependency bump, re-run the three copies above. Keep the
versions in step with `quickstart/package.json` — the toolkit and the RTM SDK
exchange message shapes.
