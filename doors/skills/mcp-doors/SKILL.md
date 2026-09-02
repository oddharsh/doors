---
name: mcp-doors
description: 'Give a website an MCP door an agent can find and use: a server that speaks the 2026-07-28 revision AND the legacy revisions on one endpoint, generated .well-known cards (server-card.json, agent-card.json, api-catalog) tested against the live tools/list, honest tool annotations, and the client-side request rules (Mcp-Method, both Accept framings, MCP-Protocol-Version as a reply only) that a survey of 38 live servers showed are required. Use this whenever someone wants to add MCP to a site, expose site data as tools, publish a server card or agent card, check whether their MCP server is reachable by strict clients, debug a client that gets 400/406 from a server, or asks "how do agents call my site". Ships a conformance probe; falls back to the survey and checklist.'
---

# mcp-doors

An MCP server is a door; the card is the sign on it; the annotations are the
sign's honesty. All three are checked by the same probe.

## Knock first

```bash
node <plugin-root>/skills/mcp-doors/scripts/conform.mjs https://example.com
node <plugin-root>/skills/mcp-doors/scripts/conform.mjs https://example.com/other/mcp --card /.well-known/mcp/other.json
```

It sends the request a strict client sends (`references/survey.md` says why
each header is there), reports which era answered, lists the tools and which
of them declare that they write, and deep-compares the published card's tool
names to the live list. Exit 1 on a card that drifts, because that is the
one failure nothing else ever reports: a wrong card costs an agent a wasted
probe and never a visible error. A 401 is reported as a locked door, present
and unreadable, not as absence.

## Building the server

Serve both eras on one endpoint by reading the opening move, keep `ping`,
validate `Mcp-Method` when present rather than requiring it, and put the wire
rules (versions, `_meta` keys, `resultType`, cache hints, error codes) in ONE
module even if you run two servers, because two copies drift and the symptom
is a server quietly speaking a dialect no client asked for. The reference
implementation is cited in the plugin's `references/site-paths.md` (MCP wire
rules row); it is a few hundred lines and reads in one sitting.

Emit `resultType: "complete"` and `serverInfo` in `_meta` on every result
unconditionally; JSON-RPC clients ignore unknown fields and modern clients
read an absent `resultType` as complete anyway. One code path beats two.

## Cards and catalog

Generate `server-card.json` and `agent-card.json` from the server's own tool
registry and test them against `tools/list` in CI. Serve
`/.well-known/api-catalog` as `application/linkset+json` (RFC 9727) naming
every machine door, and make the ROOT card describe the server at the root:
the reference site's root card served its second server for weeks, and both
the api-catalog and every probe pointed at that path. A card under a long
`max-age` cannot be purged from clients, so move card meaning rarely.

## Annotations

Default every tool to read-only and non-destructive. The tool that writes
declares `readOnlyHint: false` on its own definition, beside the write. Then
read the probe's `writes` line back: it should name exactly those tools and
no others.

## Identity, briefly

If the site runs its own crawler, sign its requests (RFC 9421) and publish
the key at `/.well-known/http-message-signatures-directory`; publish
`_index._agents.<host>` as an SVCB record (DNS-AID) pointing at the host, and
do not publish `_a2a` unless an A2A server exists behind it. Both are graded
by `agent-audit`, and both are the same rule: advertise only what you serve.
