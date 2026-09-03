# Shared-dictionary delivery, the rules that are not in the spec

RFC 9842 says what the headers mean. These are the rules the reference site
learned by shipping it, each from a measurement, in the order you meet them.

## What a dictionary is

Bytes the BROWSER already holds. Two tiers pay for themselves:

- **Per-resource**: the previous version of the same asset or page. Deltas of
  93 to 97 percent on a real change; a 47 KB script in 115 bytes. The
  snapshot of the previous version has to be COMMITTED, because no build can
  derive from source what a browser's cache contains. Roll it from the wire,
  not from the build: an edge feature that rewrites HTML after your server
  (WebMCP's injected tag, Rocket Loader, an A/B mutation) makes a snapshot
  derived from source match nothing, and the symptom is a silent tier
  downgrade rather than an error.
- **Site-wide family**: one raw 64 KB corpus of the bytes pages share, at an
  immutable content-hashed URL, advertised by every HTML response with
  `Link: rel="compression-dictionary"`. Around 13 percent on a page the
  visitor has never seen. Build it from the bytes browsers RECEIVE: the
  reference site's corpus was read pre-minification for weeks, 370 of its 552
  newlines carrying indentation no target had, and feeding it the right bytes
  was 30 KB across 55 pages. Raw bytes, never a `zstd --train` artifact: the
  server library reads a trained dictionary's tables while the browser reads
  the same bytes as content, and the navigation dies on
  `ERR_CONTENT_DECODING_FAILED`.

## What makes a browser register the offer

`Use-As-Dictionary` is refused outright under `no-cache` and under
`must-revalidate`; `s-maxage` is invisible to it; and the
`stale-while-revalidate` window IS the dictionary's lifetime. All silent. The
check script reads cache-control on both the page and the dictionary for
exactly this. Scope the offer with `match` to what you will answer with a
delta and `match-dest` to the destinations, because the default is every
destination: an offer that covered an SVG sprite taught Chromium to send
`Available-Dictionary` on image fetches the server ignored, and one deploy
later the icons vanished for every warm Chromium until a hard reload.

## dcz over dcb

Cloudflare passes both through identically. Deltas are within a few percent
either way and dcb is slightly smaller. Decode is where zstd wins, 8x on a
47 KB reconstruction, and decode scales with the RECONSTRUCTION, not the
delta, so the gap never closes by shrinking the delta and widens on the slow
devices that need it. Level 19; 20 to 22 are byte-identical at these sizes.

## The server side

- Plain responses stay brotli q11, and that is forced: a Worker cannot see
  the client's `Accept-Encoding` (the runtime rewrites it to a constant), so
  the ONLY safe trigger for a dictionary encoding is `Available-Dictionary`
  itself, which doubles as proof the client speaks it.
- `encodeBody: "manual"` or the platform's equivalent on every precompressed
  body, or the runtime compresses the compressed bytes again. Rebuilding a
  Response with an init OBJECT drops that flag silently; passing the response
  as init keeps it.
- A delta against the wrong bytes is not an error, it is a larger delta or a
  fallback to plain. Nothing throws. Which is why the check offers a wrong
  hash as a control and expects plain back.

## Verify from the wire, every night

Roll snapshots from production, and run the check against production after
every deploy. A dictionary 11 days stale still gave 87 percent; a dictionary
that was never adopted gave nothing, silently, for 161 commits, while the
check that existed printed PASS because it offered a dictionary it had built
itself. Ask whether the bytes browsers HOLD are covered, not whether the ones
you just built are.
