---
name: agent-commerce
description: Make a store or a paid API something an agent can buy from, and measure which doors are already open: UCP (Google's Universal Commerce Protocol profile at /.well-known/ucp), ACP (the OpenAI and Stripe Agentic Commerce Protocol discovery document at /.well-known/acp.json), x402 and MPP (two HTTP 402 payment protocols with different carriers, often both on one route), and AP2 (Google's Agent Payments Protocol, declared as an extension on the A2A agent card). Use this whenever a merchant, marketplace, commerce platform or API seller asks how agents will shop, check out, or pay on their site ("agentic commerce", "can ChatGPT buy from my store", "agent checkout", "x402", "MPP", "402 payments", "UCP", "ACP", "AP2", "Shopify agent-ready"), or wants to know which of these a competitor ships. The probe classifies every 402 by dialect, derives the routes it knocks from the origin's own api-catalog and openapi.json, and ships a fixture control that speaks all four dialects so a "no" is a measurement.
---

# agent-commerce

Five protocols, three questions. Can an agent reach a checkout (UCP, ACP)?
Can it pay for a request over HTTP (x402, MPP)? Can a user delegate a purchase
to it with a signed mandate (AP2)? Each one is a document or a header an agent
reads before it spends anything, so each is cheap to publish and each has a
shape a strict client refuses when it is slightly wrong.

## Run the probe first

```bash
node scripts/commerce.mjs --control                        # first: every dialect read from a local fixture
node scripts/commerce.mjs https://store.example
node scripts/commerce.mjs https://store.example --paths /api/quote,/v1/report
node scripts/commerce.mjs https://store.example --json
```

It reads the homepage for commerce signals (platform fingerprints, product
schema, cart links, payment scripts, the Apple Pay merchant file, Shopify's
`/products.json`, WooCommerce's Store API) so a zero on a blog reads as "not
applicable" rather than as five gaps. Then it fetches the UCP and ACP documents
and validates them against their specs, reads the A2A agent card for the AP2
extension, and knocks a set of routes for a 402. **The routes come from the
origin's own catalogs**: every same-origin `api-catalog` anchor, every
`openapi.json` operation, then `/`, `/api`, `/api/v1`, `/llms-full.txt` and
whatever `--paths` adds. A scanner that knocks three fixed paths reported a live
x402 seller as "not detected" on 2026-09-16 because its paid routes were under
`/api/<vendor>/...`; the catalog knew.

**Every 402 is classified, and a response can carry two protocols.** x402 v2
puts a base64 `PaymentRequired` in a `PAYMENT-REQUIRED` header; x402 v1 puts the
same object in the JSON body; MPP puts a `Payment` challenge in
`WWW-Authenticate`; Cloudflare pay-per-crawl answers with `crawler-price`. A
seller that serves x402 and MPP clients from one route sends the first and
third on the same response (measured on stableenrich.dev), so the classifier
returns every dialect present, and pay-per-crawl is reported separately because
it is the edge charging crawlers rather than a merchant door.

`--control` starts a local server that speaks all four and validates every
document reader against known-good fixtures. Run it once before trusting a
"no" from a foreign origin.

## What the verdicts mean

| door | yes | likely | maybe |
|---|---|---|---|
| ucp | profile validates and its services answer | profile present with problems (a 404 endpoint, a schema off `ucp.dev`, a missing required registry) | JSON at the path with no `ucp` root |
| acp | every required field, closed enums respected, `api_base_url` answers | present with problems (the RFC's `max-age>=3600` counts) | |
| x402 | a route answers 402 in an x402 dialect | | a gate exists and is unconfigured (`x-payment-note`) |
| mpp | a route challenges with `WWW-Authenticate: Payment` | a discovery document advertises prices but no route challenges | |
| ap2 | the agent card declares the AP2 extension URI | | |

Two MPP readings are worth knowing. Discovery is advisory and the Challenge is
authoritative (mpp.dev says so), so the probe knocks every advertised
operation and lists the ones that answer 200 without payment: a document
describing a gate that is not there. And `x-payment-info` has three shapes in
the wild: canonical `offers[]`, the flat single-offer shorthand, and a
multi-protocol `{price, protocols:[{x402:{}},{mpp:{...}}]}` form that
x402-plus-MPP sellers emit. The third is read for what it says and flagged,
because a canonical MPP client parses none of it.

## What to build, by what you sell

**A storefront** (products, cart, checkout):

1. **UCP profile** at `/.well-known/ucp`. The root is `{"ucp": {...}}` with
   `version` (YYYY-MM-DD), `services` and `payment_handlers` (both required,
   both may be empty) and `capabilities`. A shopping service is
   `dev.ucp.shopping` with `transport` `rest` or `mcp`, a `spec`, a `schema`
   (OpenAPI for rest, OpenRPC for mcp) and an `endpoint`. Capabilities are
   named `dev.ucp.shopping.checkout`, `.cart`, `.catalog`, `.order`, and each
   one's `schema` must be served from a host that reverses to `dev.ucp`
   (authority binding). Shopify emits this for every store; if you are on
   Shopify you have it, and the probe will tell you whether its MCP endpoint
   answers a JSON-RPC POST. `references/protocols.md` has a minimal profile.
2. **ACP discovery** at `/.well-known/acp.json`: `protocol.name` `"acp"`,
   `protocol.version` and `supported_versions`, `api_base_url`, `transports`
   from `["rest","mcp"]`, `capabilities.services` from
   `["checkout","orders","delegate_payment","carts"]`. Serve with
   `Cache-Control: public, max-age=3600` or longer. This is what ChatGPT's
   checkout reads.
3. **AP2** on the agent card: add
   `{"uri":"https://github.com/google-agentic-commerce/ap2/v1","required":true}`
   under `capabilities.extensions`. The `agent-identity` skill builds the card;
   AP2 is one line on it, and it means "I accept mandates".

**A paid API** (pay per call, no cart):

4. **A 402 on every paid route.** Pick x402 v2 (`PAYMENT-REQUIRED` header,
   `accepts[]` with CAIP-2 `network`, `payTo`, `asset`, `amount`) or MPP
   (`WWW-Authenticate: Payment id=... realm=... method=... intent=...
   request=<base64url JCS JSON>`), or both on one response. The reference site
   gates `/llms-full.txt` behind x402 v1 and serves it free with an
   `x-payment-note` header until a wallet is configured; that degrade-loudly
   shape is worth copying, since a broken paywall is worse than an open one.
5. **Say where the paid routes are.** List them in `/.well-known/api-catalog`
   (RFC 9727) or `/openapi.json`, and for MPP put `x-payment-info.offers[]`
   on each paid operation. Register with the Bazaar (x402) or MPPScan (MPP)
   if you want to be found by agents that search a registry rather than your
   origin.

## Traps

- UCP's registries live under `ucp.` (`ucp.services`, not `services`). A
  validator reading the top level reports a Shopify profile with nine
  capabilities as having none; measured 2026-09-16 on isitagentready.com.
- A UCP `mcp` endpoint 301s a bare GET to the storefront. Knock it with a
  JSON-RPC POST or you will report it as gone.
- `Cache-Control` on `acp.json` is in the RFC. A `max-age=60` passes presence
  and fails conformance.
- x402 v1 named networks by string (`base-sepolia`) and v2 by CAIP-2
  (`eip155:84532`); clients register schemes by the CAIP-2 form. New
  deployments should be v2.
- The AP2 URI is `.../ap2/v1`; the sample cards carry it under
  `capabilities.extensions[].uri`. A card with the URI somewhere else is not
  a declaration.

## Reference implementation

The x402 gate: `src/worker/x402.ts` (`handleLlmsFull`, the `accepts` envelope,
the facilitator verify-and-settle). The site sells nothing else, so UCP, ACP
and MPP are cited from their specs in `references/protocols.md` rather than
from site code. Paths in `../../references/site-paths.md`.
