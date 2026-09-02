# What 38 live MCP servers taught the client half

Measured 2026-08-14 by the reference site's `/lens` door probe, which had been
reporting three well-known servers as unreadable. Every rule here came from a
population that broke without it.

## Three request rules

1. **Send `Mcp-Method` on every POST.** The spec requires it on Streamable
   HTTP; `mcp.context7.com` and `docs.mcp.cloudflare.com` answer 400
   `-32020` without it and 200 with it. Derive it from the same constant as
   the body's `method`, so the two cannot disagree.
2. **Offer BOTH framings in `Accept`**: `application/json, text/event-stream`.
   A server may answer either at its discretion, and `mcp.deepwiki.com`
   refuses a JSON-only Accept with 406 "Client must accept both".
3. **`MCP-Protocol-Version` cannot be a constant.** `mcp.svelte.dev` refuses
   without it; `mcp.deepwiki.com` and `mcp.exa.ai` serve happily without it
   and refuse the byte-identical request WITH it, because they validate the
   header against their own list and neither speaks `2026-07-28`. So send it
   only as a reply to a refusal that names it: one retry, on nobody who
   already works.

## Reading a 401

Sixteen of the 38 are auth-gated and refuse in two dialects: an empty body
(Cloudflare's six) and an OAuth challenge (Notion, Sentry, Linear, PayPal,
Neon, Webflow, Canva, Grafana, Wix). Both are doors. Report them as present
and unreadable with the scheme named, never as "not JSON".

## Being a server that both eras can use

2026-07-28 deleted `initialize`, deleted sessions, and moved version, client
identity and capabilities into `_meta` on every request. Legacy clients have
no fall-forward. The reference site serves both on one endpoint by reading
the opening move: a request carrying `_meta` is modern and stateless; an
`initialize` selects legacy. It keeps `ping`, validates `Mcp-Method` when
present rather than requiring it (requiring would reject every legacy client
at the transport), and does not enforce `protocolVersion` as a required
`_meta` field because an absent `_meta` is how a legacy client presents
itself. Enforcing it broke two of the site's own clients, which is the
transferable lesson: a server-side strictness change is a client-side change
too, and your own clients are the ones least likely to complain.

## Cards are generated, and tested against the live list

A `server-card.json` written by hand acquires a tool the server does not
serve, or keeps one it dropped, and no request ever fails because of it. The
reference site generates both cards from the servers' own registries and a
test deep-equals each against `tools/list`. Mind the cache: a well-known card
under a long `max-age` cannot be purged from a client that already holds it,
so a card that moves meaning is a wasted probe for up to its lifetime. Keep
`server/discover` and `tools/list` the source of truth; the card is a hint.

## Annotations are a claim, and the default is read-only

Decorate every tool with `readOnlyHint`, `destructiveHint`, `idempotentHint`
and `openWorldHint`, default them to "reads a public thing, changes nothing",
and override on the definition of the tool that writes, beside the code that
makes it true. A blanket assertion that every tool shares one annotation
shape passes right up until a writing tool exists and then advertises a
database insert as an idempotent read. Note the browser keeps only
`readOnlyHint` of the five, so a page-driven agent needs the description to
restate that a tool writes.
