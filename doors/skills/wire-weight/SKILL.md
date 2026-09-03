---
name: wire-weight
description: Measure what a page costs on the wire and who is paying for its compression, then fix delivery at the origin: brotli q11 precompressed twins instead of edge q4, content-hashed immutable assets with a 404 clamp, Early Hints, speculation rules, and a script-src by hash. Use this whenever someone asks why their site is "slow", how big a page really is, whether Cloudflare (or any CDN) is compressing for them, about brotli levels, precompression, immutable caching, cache busting, Early Hints or 103, prerender or prefetch, or a Content-Security-Policy without unsafe-inline. Run the probe before changing anything: it says which of those the origin already does.
---

# wire-weight

Every number here is a wire byte or a header, because those are the only two
things a visitor's browser receives. A build's "minified size" is not a cost
anyone pays.

## Run the probe first

```bash
node scripts/weigh.mjs https://example.com/some/page
node scripts/weigh.mjs https://example.com/some/page --json
```

It speaks HTTP/2 itself, which is what lets it see two things `fetch()` hides:
the raw compressed body, and a 103 Early Hints block, which node's h2 client
delivers as a `headers` event before the response. Five lines come back.

**compression: who compressed.** The decoded body is recompressed locally at
brotli q11 and q4 and the wire size is matched against both. An origin that ships
precompressed twins lands within a percent of q11. An edge compressing on the
fly lands at q4, and q4 is 12 to 24 percent larger than q11 for byte-identical
content: on the reference site, before it shipped text twins, `garage/horizon.md`
was 50,624 bytes live against 50,508 at local q4 and 42,629 at q11. The verdict
prints all three numbers so the saving is a subtraction, not a claim.

**early hints.** A 103 seen on this connection, with its hints, or failing that
the `Link: rel=preload` entries the 200 carries, which is what an edge replays
as a 103. The browser-side proof that a hint actually completed inside the
103-to-200 window needs a real browser and two signals; `references/method.md`
has that recipe and the trap in it.

**csp.** Whether `script-src` is by hash or nonce with no `'unsafe-inline'`, or
still loose. A hash-aware browser IGNORES `'unsafe-inline'` when hashes are
present in the same directive, so "hashes plus unsafe-inline" is the strict
policy wearing a comment.

**speculation.** Speculation-rules blocks, prerender or prefetch, and their
eagerness.

**hashed assets and the clamp.** One content-hashed CSS or JS reference is
fetched for its `immutable, max-age` of a year, and then a sibling that cannot
exist, with the SAME hash shape, is fetched as the control. A miss that inherits
the immutable rule is how a stale page's broken asset becomes permanent: the
browser caches the 404 for a year. The shape matters, and the probe learned it
the hard way (field note below).

## Build order, and what each step is worth

1. **Content-hash the shell** (`/a/<name>.<hash8>.<ext>`), serve it
   `public, max-age=31536000, immutable`, and clamp misses under that prefix to
   `max-age=0` or `no-store`. Then a change mints a new URL and nothing is ever
   stale. On the reference site this replaced every version bump.
2. **Precompress at q11 at build time** and serve the twin: headers from the
   PLAIN asset (its cache rules are keyed on the plain path), body from the
   twin, `Content-Encoding: br`, `Vary: accept-encoding`, an ETag that differs
   per encoding. Every text asset, not just HTML: Markdown twins, JSON indexes,
   feeds and sitemaps were 16 percent lighter on the reference site for
   byte-identical content. On Cloudflare Workers set `encodeBody: "manual"` and
   read `references/method.md` on the way a rebuilt Response silently drops it.
3. **Emit `Link: rel=preload`** for the render-blocking shell on documents;
   Cloudflare replays it as a 103. Worth most where the origin thinks before
   answering (a cold isolate, a KV read); worth little on a warm static page.
4. **Speculation rules**, `prerender` at `moderate` eagerness (hover or
   pointerdown), excluding anything with a side effect on load. An eager rule
   was measured fetching nothing twice on the reference site; `references/method.md`
   says how to measure one, since the page itself cannot.
5. **`script-src` by hash**, computed at build from the FINAL bytes, one list
   per document; an empty list is the best case (a bare `'self'`). Nonces do not
   work on precompressed bytes, which is why hashes. Inline event handlers cannot
   be hashed; remove them rather than reach for `'unsafe-hashes'`.

## Field note: the control tested the wrong layer

The first version of the 404 control replaced the hash with ten zeros. The
reference site answered that 404 with `public, max-age=31536000, immutable`,
and the probe reported a clamp gap. The site clamps exactly the shape it emits,
`/a/<name>.<8 hex>.<ext>`, and hands anything else to the asset layer, whose
one-year rule then decorated a 404 for a URL the site would never produce. The
control now mirrors the real ref's hash length and alphabet, and the same site
answers it `max-age=0, must-revalidate`. A control has to be a plausible
instance of the failure, or it measures a different system.

## Reference implementation

Twins and the clamp: `src/worker/lib/assets.ts` (`servePrecompressedText`,
`servePrecompressedShell`, `serveAssetWith404Clamp`). Hashing, twins and CSP
hashes: `tools/build.ts`. Preload Links: `src/worker/lib/shell-assets.ts`.
Speculation rules: `tools/photos/shell-data.ts`. The per-PR wire diff and the
nightly series: `.github/workflows/perf-diff.yml`, `perf-history.yml`,
`/garage/dyno`. Paths in `../../references/site-paths.md`.
