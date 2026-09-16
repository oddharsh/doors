---
name: agent-auth
description: Tell an agent how to get a credential for your site, and prove the chain holds: OAuth 2.0 authorization server metadata (RFC 8414, or OpenID Connect discovery), protected resource metadata (RFC 9728) that a 401 challenge points at, and Auth.md with an agent_auth block for self-service registration. Use this when someone asks how agents or MCP clients authenticate to their API ("how does Claude get a token for my site", "MCP OAuth", "oauth-protected-resource", "openid-configuration for agents", "auth.md", "agent registration"), when an MCP client reports it cannot find the authorization server, or to check an existing setup: the probe walks every hop (challenge to PRM to AS metadata to token endpoint) and reports the first one that does not answer, which is what a strict client does.
---

# agent-auth

An agent that hits a 401 does not read your docs. It reads the `WWW-Authenticate`
header, which names a protected resource metadata document, which names
authorization servers, each of which serves metadata naming a token endpoint.
Every hop is a fetch, and a strict client (the MCP authorization spec makes this
chain mandatory) stops at the first one that disagrees with the last. So the
three documents are cheap to publish and the CHAIN is what has to be right.

## Run the probe first

```bash
node scripts/auth.mjs https://example.com
node scripts/auth.mjs https://example.com --protected /api/orders    # knock a route that should answer 401
node scripts/auth.mjs https://example.com --json
```

It reads the AS metadata (RFC 8414 path first, then both OpenID spellings), the
PRM, and `/auth.md`, then follows every link: each `authorization_servers[]`
entry is fetched and its `issuer` compared with the URL it was found under, the
token endpoint is POSTed to (a real one answers 400 or 401, never 404), and the
`agent_auth.register_uri` is knocked. One control: a well-known path that cannot
exist must not answer 200, or an SPA catch-all is minting "present" for every
document below and only JSON that parses is counted.

**A field note from the first foreign run (2026-09-16).** A Shopify storefront
passes the presence checks on every scanner: it serves AS metadata and a PRM at
its own origin. The chain has two broken hops. The AS document at
`store.example/.well-known/oauth-authorization-server` carries
`issuer: https://shopify.com/authentication/<id>`, which does not derive to the
path it was served from, and RFC 8414 s3.3 tells a client to reject exactly
that. The PRM then names `accounts.store.example` as an authorization server,
whose metadata says it is `shopify.com/authentication/<id>` too. A client that
validates issuers, which the MCP spec requires, dead-ends on a site that reads
as fully configured. Presence checks cannot see this; the walk can.

## What to build, in order

1. **PRM** at `/.well-known/oauth-protected-resource`: `resource` (this origin),
   `authorization_servers` (issuer URLs, each of which will serve metadata),
   `scopes_supported`, `bearer_methods_supported: ["header"]`,
   `resource_documentation` pointing at `/auth.md`. Serve as `application/json`
   with CORS `*`; browser-side agents read it.
2. **AS metadata** at `/.well-known/oauth-authorization-server` (or under the
   issuer's path, if the issuer has one): `issuer` equal to the URL it derives
   from, `token_endpoint`, `grant_types_supported`,
   `token_endpoint_auth_methods_supported`, and `authorization_endpoint` plus
   `response_types_supported` whenever a grant needs a browser. If you delegate
   to a hosted AS, do NOT mirror its document at your origin with its issuer
   inside; name it from the PRM and let it serve its own metadata.
3. **A challenge** on every protected route: `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://<origin>/.well-known/oauth-protected-resource"`.
   This is the hop an agent enters by. A PRM nothing points at is a document.
4. **Auth.md** at `/auth.md` (`text/markdown`) saying what an agent can reach,
   how to register, what a credential grants, and naming the two well-known
   documents by URL. Add an `agent_auth` block to the AS metadata with
   `skill` (this file), `register_uri`, `identity_types_supported`,
   `credential_types_supported`, `claim_uri`, `revocation_uri`. The reference
   site issues anonymous bearer tokens for public scopes, which is the honest
   shape when nothing private is behind the door: an agent gets a credential and
   a scope list without a human, and the token grants what was public anyway.
5. **Keep scopes agreeing.** Every scope the PRM lists must be one the AS lists,
   and the probe diffs them.

## Traps

- `issuer` is compared as a string by real clients. A trailing slash, `http`
  for `https`, or a mirrored document from a hosted provider all fail the
  comparison silently.
- OIDC discovery REQUIRES `jwks_uri`; RFC 8414 does not. Publish under the
  spelling that matches what you serve.
- A token endpoint that 404s on POST reads as "exists" to a HEAD or GET probe.
  Knock it with the method a client uses.
- auth.md is prose, and agents quote it back to their users. Say what a
  credential does NOT grant as plainly as what it does.

## Reference implementation

`public/.well-known/oauth-authorization-server`,
`public/.well-known/oauth-protected-resource`, `src/content/auth.md`, and the
registration handler at `src/worker/agent.ts` (`/agent/auth`, `/agent/auth/claim`).
`references/recipe.md` reproduces the three documents. Paths in
`../../references/site-paths.md`.
