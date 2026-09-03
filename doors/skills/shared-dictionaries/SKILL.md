---
name: shared-dictionaries
description: 'Ship compression dictionaries (RFC 9842, dcz/dcb) so returning visitors download deltas instead of pages: brotli q11 twins at build time, a site-wide family dictionary plus per-page snapshots rolled from the wire, Use-As-Dictionary offers that a browser will actually register, and a production check with a control. Use this whenever someone wants smaller repeat loads, mentions shared dictionaries, Compression Dictionary Transport, Use-As-Dictionary, Available-Dictionary, dcz, dcb, "delta compression for my static site", or has precompression that seems not to work; also when an audit shows a site on edge-quality brotli. Ships the check; falls back to the rules and trap references.'
---

# shared-dictionaries

The largest wire win a static site has left, and the one with the most ways
to ship something that does nothing. Check first, then build, then check
again from production.

## Check first

```bash
node <plugin-root>/skills/shared-dictionaries/scripts/dcz-check.mjs https://example.com/some/page
```

Node 24 or newer, because older zstd accepts the `dictionary` option and
silently ignores it, which is one of the traps here. It reads the page's
offers, says whether a browser would register them (cache-control vetoes are
silent), fetches the dictionary, asks for the page again carrying its hash,
decodes the delta and compares it to the plain page, and then offers a hash
of nothing and expects plain compression back. That control is the point: a
server that answers dcz to any hash is not matching dictionaries, and every
client will fail to decode.

## Build it, in this order

1. **Precompressed twins first.** Write a brotli q11 twin beside every text
   asset at build time and serve it with the platform's manual-encoding flag.
   Edge compression on the fly is roughly q4; measured on the reference site,
   every hashed asset with a twin arrived at exactly its q11 size and every
   text file without one arrived 12 to 24 percent larger.
2. **Family dictionary.** One 64 KB raw corpus from the FINAL bytes of two or
   three pages that share the site's shell, at an immutable content-hashed
   URL, advertised on every HTML response via `Link: rel="compression-dictionary"`.
   Deltas are build output: a pure function of bytes the build just produced,
   so nothing is committed and nothing can be forgotten.
3. **Per-page and per-asset snapshots**, committed, rolled from production
   on a schedule, pruned by commit time (checkout destroys mtime order).
4. **Offers scoped** with `match` and `match-dest`, on responses whose
   cache-control a browser will keep.
5. **Check from production** after every deploy, and keep that check
   advisory: it reads the live site, so making it required deadlocks the
   release that would fix it.

`references/rules.md` carries the reasoning and the measurements behind each
step; `references/site-paths.md` in the plugin cites the build step, the
serving path, the roll and the production check by file.

## What "working" looks like

The check reads: an offer on the page, registrable cache-control on both
page and dictionary, a delta encoding with a byte-identical round trip and a
ratio in the tens for a per-page snapshot or low single digits for the
family, and a control that came back plain. Anything else is a tier that
reports success and ships bytes.
