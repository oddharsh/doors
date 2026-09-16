# isitagentready.com, read on 2026-09-16

Cloudflare's scanner. Astro front end, one `POST /api/scan` with
`{url, enabledChecks?, format?: "json" | "agent"}`, an MCP server at
`/mcp` with a `scan_site` tool, and 24 fix skills published as an Agent Skills
index at `/.well-known/agent-skills/index.json` (every digest verifies; none
of the 24 files carries frontmatter). This file records what it checks and how
it scores, so `ladder.mjs` can reproduce the number and so a reader can see
where doors deliberately measures differently.

## The 22 checks

Five categories. Commerce is scored only when `isCommerce` is true, and
`a2aAgentCard` and `ap2` are off by default in the UI's "All Checks" profile
(they still run through the API).

| id | category | their description | doors reads it with |
|---|---|---|---|
| `robotsTxt` | discoverability | Publish /robots.txt with clear crawl rules | `agent-audit` |
| `sitemap` | discoverability | Publish a sitemap and reference it from robots.txt | `agent-audit` |
| `linkHeaders` | discoverability | Include Link response headers for agent discovery (RFC 8288) | `ladder.mjs` (agent relations: `api-catalog`, `service-desc`, `service-doc`, `alternate`, `ard`) |
| `dnsAid` | discoverability | Publish DNS for AI Discovery (DNS-AID) records | `agent-audit` / `agent-identity` |
| `markdownNegotiation` | content | Return HTML responses as markdown when agents request it | `agent-audit` (ranked + tie), `markdown-twins` (7 real clients) |
| `robotsTxtAiRules` | bot access | Add User-agent rules for AI crawlers like GPTBot, Claude-Web, and others | `agent-audit` (`named`), `crawler-policy` |
| `contentSignals` | bot access | Declare AI content usage preferences with Content Signals in robots.txt | `ladder.mjs`, `crawler-policy` |
| `webBotAuth` | bot access | Let your site identify itself as a bot with Web Bot Auth (informational) | `agent-audit` / `agent-identity` (thumbprint check) |
| `apiCatalog` | discovery | Publish an API catalog for automated API discovery (RFC 9727) | `agent-audit` |
| `oauthDiscovery` | discovery | Publish OAuth/OIDC discovery metadata | `agent-auth` (the chain) |
| `oauthProtectedResource` | discovery | Publish OAuth Protected Resource Metadata | `agent-auth` |
| `authMd` | discovery | Publish Auth.md metadata for agent registration | `agent-auth` |
| `mcpServerCard` | discovery | Publish an MCP Server Card | `ladder.mjs` (presence), `mcp-doors` (deep-equal to `tools/list`) |
| `a2aAgentCard` | discovery | Publish an A2A Agent Card | `agent-audit` / `agent-identity` (every interface fetched) |
| `agentSkills` | discovery | Publish an agent skills discovery index | `skills-index` (every digest verified) |
| `webMcp` | discovery | Support WebMCP to expose site tools via the browser | `ladder.mjs` (static, two hops; theirs runs a browser) |
| `ard` | discovery | Publish an ARD manifest | `ladder.mjs` (`identifier` is `urn:air:`, 2-5 `representativeQueries`, CORS) |
| `ucp` | commerce | Enable content payments via Universal Commerce Protocol | `agent-commerce` |
| `acp` | commerce | Publish ACP discovery metadata | `agent-commerce` |
| `x402` | commerce | Support x402 protocol for agent-native HTTP payments | `agent-commerce` |
| `mpp` | commerce | Support MPP for agent-native HTTP payments | `agent-commerce` |
| `ap2` | commerce | AP2 declared in the A2A Agent Card | `agent-commerce` |

Statuses: `pass`, `fail`, `neutral` (not counted), `unableToCheck`. Each check
carries an `evidence[]` of the requests made and a `finding` per step, which is
the part of their design worth copying: a verdict with its receipts.

## The ladder, verbatim from their scan-site skill

| level | name | key requirements |
|---|---|---|
| 0 | Not Ready | fewer than 2 of: robots.txt, sitemap, Link headers |
| 1 | Basic Web Presence | 2 of 3: robots.txt, sitemap, Link headers |
| 2 | Bot-Aware | level 1 + both: AI bot rules in robots.txt, Content Signals |
| 3 | Agent-Readable | level 2 + markdown content negotiation |
| 4 | Agent-Integrated | level 3 + 1 of 4: MCP Server Card, A2A Agent Card, agent skills, API catalog |
| 5 | Agent-Native | level 4 + 2 of 3: Web Bot Auth, all integrations, auth metadata (OAuth or Auth.md) |

`ladder.mjs` computes exactly this. The score shown beside it (`n of m counted
checks pass`) is theirs too: passes over non-neutral checks, per profile.

## Commerce detection

`isCommerce` is set from homepage signals: platform fingerprints
(`platform:shopify`), payment scripts (`payment:paypal`, `payment:apple-pay`),
meta tags (`meta:shopify`), URL hints (`url:/shop`, `url:/store`), and
`prices:multiple`. A non-commerce origin gets `neutral` on all five commerce
checks with the message "not a commerce site". `agent-commerce` reads a
similar set plus the Apple Pay merchant-association file, Shopify's
`/products.json` and WooCommerce's Store API, and adds an open x402 or MPP door
as a signal on its own, because an API seller has no cart.

## How each commerce check probes, and where doors differs

| check | theirs | doors |
|---|---|---|
| x402 | `GET /`, `/api`, `/api/v1` looking for 402; query Coinbase's Bazaar (`api.cdp.coinbase.com/platform/v2/x402/discovery/resources`), which errored on the day | knock every same-origin api-catalog anchor and openapi.json operation plus the same three and `--paths`; classify the 402 by carrier; report an unconfigured gate (`x-payment-note`) as `maybe` |
| mpp | `GET /openapi.json`, require `x-payment-info` with `intent`, `method`, `amount` | read `offers[]`, the flat form and the `{price, protocols[]}` form; knock every advertised operation and expect a `Payment` challenge; list advertised routes that answer 200 |
| ucp | `GET /.well-known/ucp`, pass on `ucp.version` alone; reports `hasServices`/`hasCapabilities` from the top level (false on Shopify's profile) | validate the required root, transports, spec/schema/endpoint reachability with a transport-appropriate knock, authority binding on `dev.ucp.*` |
| acp | `GET /.well-known/acp.json` | validate every required field, both closed enums, `api_base_url` answers, `max-age>=3600` |
| ap2 | agent card declares AP2 | same, matching `github.com/google-agentic-commerce/ap2/` under `capabilities.extensions[].uri` |

## Their fix sheet

Each failing check ships a `prompt` (paste into a coding agent), `specUrls`, and
a `skillUrl` at `https://isitagentready.com/.well-known/agent-skills/<name>/SKILL.md`.
The skills are short (550 to 2,600 bytes): requirements as bullets, then
"validate by POSTing to our API". One spec link was dead on the day: MPP's
`paymentauth.org/draft-payment-discovery-00.txt` answers a GitHub Pages 404,
and the living document is `mpp.dev/advanced/discovery`. AP2 has no fix skill
and no fix-sheet entry at all, though the API grades it. The doors
equivalents are the `RECIPE` lines in `ladder.mjs` and the SKILL.md of the named
skill, which validate with the probe rather than with a third party's API.

## Three things their design gets right that doors copied

1. **Evidence per check.** A verdict without the requests behind it is a
   claim. `--json` on every doors probe carries the same.
2. **Neutral is a status.** Commerce on a blog and Web Bot Auth on a site
   with no crawler are not failures.
3. **The fix is a skill.** Publishing recommendations as an Agent Skills index
   means the fix sheet is loadable by the tool that will do the fixing.
   `skills-index` exists partly so a site can do the same for its own doors.
