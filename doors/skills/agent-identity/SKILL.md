---
name: agent-identity
description: Give a site a verifiable identity for agents, and give its own crawler a verifiable identity for everyone else: Web Bot Auth (RFC 9421 HTTP message signatures with a public key directory), the agent card at /.well-known/agent-card.json, and DNS-AID service records under _agents. Use this whenever someone wants their bot to be recognised rather than blocked ("how do I prove my crawler is mine", "verified bot", "signed requests", "Cloudflare keeps challenging my scraper"), asks how agents discover a site's MCP or A2A endpoints, mentions agent cards, SVCB records for agents, or http-message-signatures-directory. Also use it to check an existing setup: the probe verifies each published key's kid is its JWK thumbprint, which is what real verifiers key on.
---

# agent-identity

Identity runs in both directions. Inbound, an agent wants to know what this site
is and where its doors are: that is the agent card and the DNS-AID records.
Outbound, this site's own crawler wants the sites it visits to know who is
knocking, which is Web Bot Auth: every outbound request carries an RFC 9421
signature, and the public key sits in a well-known directory any receiver can
fetch. A robots.txt name can be copied by anyone; a signature cannot.

## Run the probe first

```bash
node scripts/identity.mjs https://example.com
node scripts/identity.mjs https://example.com --json
```

It reads the key directory, the agent card and three `_agents` SVCB records
(`_index`, `_a2a`, `_mcp`) through DNS-over-HTTPS with the DO bit set, and runs
one control: a name that cannot exist must come back NXDOMAIN, or the DNS tier
above it cannot be trusted.

**The directory line is more than presence.** For every key it computes the RFC
7638 thumbprint (SHA-256 over the required members in lexicographic order,
base64url) and compares it with the `kid` the key carries. The Web Bot Auth
architecture draft says `keyid` in a signature MUST be that thumbprint, so a
directory whose kids are labels like `rn-2026-06-30` passes every existence
check and fails the first real verifier, which looks the key up by thumbprint
and finds nothing. That is not hypothetical: it is what the probe found on the
reference site the first time it ran (field note in `references/recipe.md`).

The agent card line fetches each declared interface once. A `404` there is the
card pointing at a door that is not there, which is worse than no card, because
an agent that trusts the card gives up on the site rather than on the card.

## What to build, in order

1. **Key directory** at `/.well-known/http-message-signatures-directory`: a JWK
   Set of PUBLIC keys, each with `kid` equal to its thumbprint, served as
   `application/http-message-signatures-directory+json` with a long cache. The
   reference uses one Ed25519 key. Keep the private half a secret the signer
   reads, and derive `keyid` in code from the public members rather than from a
   `kid` field somebody typed, so the signature and the directory cannot disagree.
2. **Sign outbound requests** with `Signature-Input`, `Signature` and
   `Signature-Agent` headers, covering `@authority` and `signature-agent`, tagged
   `web-bot-auth`. `references/recipe.md` has the exact parameter string and the
   reference signer to read.
3. **Agent card** at `/.well-known/agent-card.json`: name, provider, the
   interfaces (an MCP URL with its protocol binding and server card, an A2A URL
   if you have one) and skills. Every URL in it must answer.
4. **DNS-AID**: an SVCB record at `_index._agents.<host>` pointing at the host
   (`1 host. alpn="h2,h3" port=443 mandatory=alpn,port`). Publish `_a2a` or
   `_mcp` ONLY for a server that exists; a record pointing at nothing passes a
   scanner and breaks an agent. Sign the zone, so the resolver's AD flag is
   true.
5. **Say who your bot is on a page** (the reference has `/bot`), and allow it in
   your own robots.txt by name. The `crawler-policy` skill covers the robots
   half.

## Traps

- `dig SVCB` on macOS's ancient dig silently degrades to an A query and prints
  nothing; ask by type number (`TYPE64`) or use DoH, which is what the probe does.
- A key directory is fetched by strangers' verifiers on every signed request
  they see; cache it for weeks and change keys by ADDING a new one first.
- Signing costs CPU. On Workers Free, 28 signed probes in one invocation blew the
  budget on the reference site (its notes call this gotcha 36). Sign what needs
  identity; do not sign a fan-out.

## Reference implementation

Signer: `src/worker/lib/botauth.ts`. Directory and card: `public/.well-known/`.
DNS-AID declared and checked in `config/infra.json` (`bun run infra:check`).
Paths in `../../references/site-paths.md`.
