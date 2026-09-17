# Verifying a posthog-js bump

The same check fits Sentry's browser SDK, analytics-next, and other SDKs whose job is to send events to a remote endpoint.

**Check.** Never point the upgraded SDK at the real project. Build with the app's public SDK env vars set to a placeholder token and an unroutable host, serve the production build, and drive it in a browser with that host intercepted at the network layer. Serve the SDK's lazily loaded bundles from its own `dist` directory in `node_modules`, stub the config and feature-flag endpoints with a minimal JSON body, and record the POSTs to the capture endpoint. Decode those bodies rather than counting them: depending on the SDK's compression setting they arrive gzipped or base64-encoded in a `data=` field, and the decoded batch carries the library version, which is how you see that the new version sent them.

Then look for the events the repo depends on — a pageview on load and another after a client-side navigation — and, when the app filters or rewrites events before sending, one event of each shape the filter matches plus a control event it must not match. A filter that fires and a transport that dropped everything look identical unless you have the control.

Two things reliably cost time. These SDKs drop captures from anything that looks like a bot, and an automated browser does: mask `navigator.webdriver`, the headless marker in the user agent, and `navigator.userAgentData` in an init script that runs before the page loads, or you record an empty batch and conclude the SDK is broken. And register the wait for the SDK's lazy bundle before navigating, not after, or the response has already arrived.

**Why it is enough.** You have seen the upgraded SDK, in the real app, produce exactly the payloads the repo's own code reads.

**When it stops applying.** A server-side SDK, where the route or handler is what you drive. A major bump, or a release that changes the transport or the endpoint shape, where a mock you wrote from the old behaviour can agree with itself and still be wrong.
