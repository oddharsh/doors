# wire-weight: measuring methods, and the instruments that lie

## Reading a compressed body honestly

`fetch()` decodes for you and reports nothing about the wire. Read raw bytes
(node `http2` or `https`), decode by `content-encoding`, and recompress the
decoded bytes yourself. Match against brotli q11 AND q4: the two numbers name
who compressed. Cloudflare's on-the-fly brotli reproduces local q4 almost byte
for byte; an origin twin reproduces q11 exactly.

Two things that look like the twin not being served and are not:

- **A local dev harness transcodes by MIME type.** miniflare re-encodes
  `application/json`, `text/plain` and `application/xml` to whatever the client
  offered, and node's fetch does not offer br by default, so twins for those
  types arrive as gzip locally while `text/markdown` (not on its list) arrives
  as br. Ask what the client offered before asking what the server sent.
- **A gradual deployment splits by version.** During a 10/90 canary, one request
  in ten hits the version with twins and nine hit the one without, and version
  affinity pins one client to one version, so a single client sees ONE answer
  with total confidence. Vary the affinity key per request (on Cloudflare,
  `Cloudflare-Workers-Version-Key`) to see the split. Measured 2026-09-03 on the
  reference site: 1 of 10 requests for `garage/horizon.md` came back at the q11
  size, 9 at q4, because the twin tier was on the 10 percent canary.

## Early Hints: two signals, cold profile, never startTime

Server side, the probe sees the 103 over HTTP/2 (node's http2 client emits 1xx
blocks as a `headers` event). Whether the PRELOAD paid off is a browser question:

- `initiatorType === "early-hints"` on the resource entry says the feature was
  active.
- A fetch duration far too small for the byte count (59 KB in 1.8 ms) says the
  preload completed inside the 103-to-200 window: a preload-cache hit.
- Do NOT judge by `startTime`, which is stamped when the document consumes the
  resource and always looks like it lands right after the 200.
- Use a fresh profile so the cache is cold.

The payoff scales with the 103-to-200 window, which is origin think time. A warm
static page has almost none, so a real fetch of 50 to 115 ms there is the
feature working as designed, not failing.

## Speculation rules cannot be measured from the page

Resource Timing never sees a speculation fetch, and Chrome gates speculation on
tab visibility, which every agent-driven browser fails. Measure at the ORIGIN:
count requests carrying `Sec-Purpose: prefetch` or `prefetch;prerender`. Run a
positive control first (hover a link under a `moderate` rule and confirm the
origin saw it); if the control fetches nothing, the run measured the instrument.
The reference site keeps `tools/speculation-probe.ts` for exactly this and counts
`Sec-Purpose` in production.

## The 404 clamp, and the shape of the control

A miss under an immutable prefix must not inherit the immutable rule. Clamp it
to `max-age=0, must-revalidate` or `no-store` in the code that owns the prefix.
When you test that, the ghost URL must have the SAME shape the site emits
(hash length, alphabet, extension), because the clamp is keyed on the route's
pattern and anything else falls through to whatever the static layer does.

## Rebuilt Responses drop encodeBody

On Cloudflare Workers, `encodeBody: "manual"` is write-only: `new Response(body,
{ status, headers })` loses it and the runtime compresses your already-compressed
body a second time. `new Response(body, response)` (the response as init)
preserves it; mutate headers on the result afterwards. There is no getter, so
the loss is silent and the symptom is a body that decodes once into more
compressed bytes. Check this first when a precompressed route misbehaves.

## Where the reference does it

- `src/worker/lib/assets.ts`: twins, clamp, `encodeBody` handling
- `tools/build.ts`: hashing, q11 twins, CSP hashes from the final bytes
- `tools/perf-snapshot.ts`: the wire-size diff and the nightly row
- `tools/early-hints-probe.ts`, `tools/speculation-probe.ts`: the browser
  measurements with their controls
