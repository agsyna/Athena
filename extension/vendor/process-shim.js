/**
 * A `process` stand-in for the vendored SDKs.
 *
 * All three bundles are published for a bundler to consume, and a bundler
 * substitutes `process.env.NODE_ENV` with a literal at build time. Loaded
 * directly in a browser they reach the real identifier and throw
 * `process is not defined` — which is what the panel hit on its first join.
 *
 * Three sites need it, and only one of them guards itself:
 *   - agora-agent-client-toolkit: `process.env.NODE_ENV` at two points, bare
 *   - agora-rtc-sdk-ng: `process.env.BUF_BIGINT_DISABLE`
 *   - agora-rtm: `process.env.DEBUG`
 *
 * `production` is the honest answer for a vendored release build: it turns off
 * the SDKs' development-only logging, which is what a bundled production build
 * of the quickstart does too. Everything else reads as undefined, which is the
 * same thing those bundles see when the variable is simply unset.
 *
 * Must load before any SDK. It is a classic script for exactly that reason —
 * classic scripts run to completion before deferred module scripts begin.
 */
globalThis.process = globalThis.process ?? { env: { NODE_ENV: 'production' } };
