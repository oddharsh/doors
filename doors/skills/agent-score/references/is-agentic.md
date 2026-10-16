# is-agentic.com, read on 2026-10-16

Vercel's scanner, launched 2026-08-23. Ora runs the checks and scores them;
Vercel regroups them into the number on the page. Three read-only surfaces
serve a completed report, and none of them starts a scan:

- `GET https://is-agentic.com/api/v1/report?url=<origin>`: JSON, RFC 9457
  errors (`report_not_found` is a 404), 120 requests per IP per 60 seconds
  with `RateLimit` / `RateLimit-Policy` headers. This is what `--reference` reads.
- `https://is-agentic.com/mcp`: Streamable HTTP, tools `is_agentic_get_report`,
  `is_agentic_get_methodology`, `is_agentic_get_developer_docs`.
- `npx is-agentic <domain> [--json]`: reads the report, and when none exists
  starts one through `GET /api/scan/stream?target=` (Server-Sent Events:
  `scan_init` with a `checkRoster`, `check_start`, `check_complete`,
  `scan_complete`). `score.mjs` never calls that endpoint; their usage policy
  rules out automated bulk scanning, so a missing report is the user's call to
  start, by hand.

The site practices what it grades. Report pages answer `Accept: text/markdown`
with Markdown and `Vary: Accept`, errors are `application/problem+json`, and
the domain publishes an RFC 9727 api-catalog, an OpenAPI document, an MCP server
card, an AI catalog and an Agent Skills index. It scores itself 100.

## How the number is built

From their methodology page, then checked against 41 published reports:

- **Essential** checks share an 80-point pool, **Recommended** a 20-point pool,
  and checks inside a pool weigh the same. A partial result earns a fraction of
  its share. Not-applicable checks leave the pool, so the share grows.
- **Bonus** is "emerging formats", capped at +5, never a penalty. The API
  reports only a count (`positive_signals`) and the points; the signals are
  never itemized. Points run about 0.23 a signal across the 41 (3 signals
  gave +0.8, 14 gave +3.3, 22 gave +4.9), close to linear and not exactly so.
- **Score** = `min(100, round_half_up(essential + recommended + bonus))`. This
  reproduces the published score on all 41 reports. (Python's `round` is
  banker's rounding and misses two of them: exa.ai's 92.5 and
  perplexity.ai's 52.5 publish as 93 and 53.)
- **Labels**: 85 and up "Strong technical baseline", 70 to 84 "Ready with a few
  material gaps", 50 to 69 "Important blockers remain", below that "Agents
  are likely to struggle". The 85 and 70 edges are exact in the 41 (85 and 70
  are the lowest scores carrying their labels, 80 and 69 the highest below).
  The 50 edge is inferred: 52 is the lowest "blockers" and 46 the highest
  "struggle".
- In every report, `passing` plus the failed and partial issues of that tier
  equals the tier's `total`. So the issues array lists **every** check that is
  not a pass, and a counted check missing from it passed. A check missing from
  it may also be not applicable, which is why the diff says "pass or n/a".

Underneath sit Ora's own four layers (Discovery 20 points over 15 checks,
Access 30 over 41, Usability 40 over 56, Payments 10 over 6: 118 checks) and a
letter scale (A+ 95 to 100 down to F 0 to 27), per the launch coverage. Vercel
shows neither. At most 35 checks were eligible on any of the 41 sites, so most
of the 118 land in the bonus count or in checks a report never itemizes.

A `<meta name="is-agentic-site-type" content="content|business|app|store">`
tag picks which lens the report opens on. It changes neither the score nor
the evidence, so doors ignores it.

## The 36 checks

Recovered from the `issues` arrays of 41 reports (every check that failed or
went partial somewhere). A check that passes everywhere is invisible to this
method, so the roster is a floor. It is close to the ceiling for scored checks:
the most eligible on any one site was 35 (11 essential + 24 recommended, on
aadhar.sh and exa.ai), and 36 ids are listed here. No Payments-layer check
appeared as an issue on any of the 41, the five retailers included.

"Gate" is when the check counts. Theirs is "when scan evidence indicates that
a site offers an API, OAuth flow, GraphQL endpoint, MCP server, developer
portal, or commerce surface"; the gates below are what doors infers from which
sites carried which ids. "Seen" is how many of the 41 reports listed it.

| id | tier | gate | seen | what they ask for | doors reads it with |
|---|---|---|---|---|---|
| `content-no-js` | essential | always | 35 | 500+ characters in raw HTML, an H1 first, sequential headings, 5%+ content ratio | page read |
| `agent-friendly-404` | essential | always | 30 | a real 404 for `/__ora-404-probe-<rand>`; full credit needs a Markdown body under `Accept: text/markdown` | 404 read, both Accepts |
| `markdown-negotiation-vary` | essential | always | 25 | bare `Accept: text/markdown` on `/` gets `text/markdown` and `Vary: Accept` | bare Accept, plus the audit's real-client read in the detail |
| `agent-crawler-reachability` | essential | always | 9 | ChatGPT-User, OAI-SearchBot, Claude-User, PerplexityBot, ClaudeBot, Google-Extended, ora-agent, DeepSeekBot reach `/` | `crawler-policy` bot views, with the browser and curl controls |
| `redirect-hygiene` | essential | always | 3 | no meta-refresh, no JavaScript redirect stubs, short chains | hop-by-hop read of `/` and six sitemap pages |
| `docs-auth-gate` | essential | always | 1 | sampled content pages answer without a login | the same sample plus the docs link |
| `openapi-spec` | essential | dev | 26 | `/openapi.json` or `/api/openapi.yaml` | catalog `service-desc`, Link header, six conventional paths |
| `scoped-permissions` | essential | dev | 22 | named OAuth scopes in the spec, or `scopes_supported` in RFC 9728 metadata | spec + `agent-auth` |
| `json-error-responses` | essential | dev | 19 | API errors come back as JSON with a code and a hint | a knock on an unknown path under the spec's server URL |
| `oauth-support` | essential | oauth | 7 | `/.well-known/oauth-authorization-server`; "mentioned on homepage" is partial | `agent-auth` |
| `mcp-resource-listing` | essential | MCP advertises resources | 4 | `resources/list` returns at least one, or the capability is dropped | `mcp-doors` conform (resources) |
| `mcp-view-domain` | essential | MCP App declared | 1 | the `ui://` view reads as HTML with no login form | `mcp-doors` conform (App view) |
| `mcp-view-csp` | essential | MCP App declared | 1 | `_meta.ui.csp` with `connectDomains` / `resourceDomains` | `mcp-doors` conform (App view) |
| `json-ld` | recommended | always | 30 | JSON-LD of the site's identity type | page read |
| `org-schema-completeness` | recommended | always | 33 | Organization with `contactPoint` and `address` | page read |
| `metadata-completeness` | recommended | always | 9 | canonical, `<html lang>`, `og:image`, `og:type` | page read |
| `sitemap` | recommended | always | 7 | a valid `/sitemap.xml` | robots `Sitemap:` line, then the path |
| `trust-anchors` | recommended | always | 17 | `/about`, `/contact`, `/privacy` with 500+ characters each | homepage links, then the paths; a catch-all 200 is not a page |
| `agent-instruction` | recommended | always | 28 | "when to use" guidance in llms.txt or an agent-instructions file (`/agent.txt` counted on vercel.com) | llms.txt, agent.txt, AGENTS.md |
| `content-efficiency` | recommended | always | 2 | readable text is 5%+ of the HTML | page read |
| `page-token-budget` | recommended | always | 1 | every measured page under ~100K characters (~25K tokens) | `/` plus six sitemap pages |
| `brand-search-accuracy` | recommended | always | 16 | the domain ranks top for brand + product | **unmeasured**: a web search doors does not run |
| `pricing-info` | recommended | dev or store | 2 | a `/pricing` page or schema.org Offer | page read |
| `public-api-docs` | recommended | dev | 6 | `/docs`, `/api` or `/developers` linked from the homepage | page read |
| `developer-portal` | recommended | dev | 3 | a portal at `/developers` | page read |
| `public-api` | recommended | dev | 7 | a reachable REST or GraphQL endpoint; "described in docs" scores 3/7 | parameterless GETs from the spec, `/graphql` |
| `api-schema-analysis` | recommended | dev | 29 | operationId, description, typed parameters on every operation | spec read (JSON only) |
| `function-calling-compat` | recommended | dev | 31 | unique operationIds, typed schemas, descriptions; MCP without OpenAPI is partial | spec read, plus the tool-name rule `^[A-Za-z0-9_-]{1,64}$` |
| `response-schema-coverage` | recommended | dev | 4 | typed response schemas (failed at 0% and 9%) | spec read |
| `api-error-model` | recommended | dev | 6 | typed 4xx/5xx schemas or `application/problem+json` | spec read |
| `api-versioning-policy` | recommended | dev | 6 | versioned path or header, plus a deprecation signal; prose in docs is partial | spec read |
| `rate-limit-headers` | recommended | dev | 16 | RateLimit headers live; documented-only is partial | live API responses, then the spec |
| `mcp-server` | recommended | dev | 28 | Streamable HTTP MCP with a public tool list (6/6); OAuth-locked is 5/6; a registry listing alone is partial | `mcp-doors` conform |
| `cli-tool` | recommended | dev | 12 | an official CLI on npm, PyPI or Homebrew; "mentioned in llms.txt" is partial | install command in the page or llms.txt, confirmed on npm or PyPI |
| `onboarding-friction` | recommended | dev | 25 | free tier, self-serve keys, sandbox; "verified live" beats "described" | page + llms.txt prose, and a zero-auth endpoint from `public-api` |
| `agentic-search-specific` | recommended | dev | 11 | developer resources surface in a name search | **unmeasured**: a web search |

## Where doors measures differently, and which to believe

- **The two search checks.** `brand-search-accuracy` and
  `agentic-search-specific` run a web search and grade the rank. Their own
  evidence calls it "one search sample" and "transient search noise". doors
  names no search engine, so both read `unmeasured` and leave the pool; the
  recommended score is then over 20 checks where theirs is over 22. Believe
  theirs for these two and re-scan before acting on a partial.
- **Markdown negotiation.** Both scanners send a bare `Accept: text/markdown`,
  which no shipping agent client sends (`markdown-twins` replays seven that
  do). `score.mjs` grades the bare header so the number matches, and puts the
  audit's real-client verdict in the detail. A site can pass here and still
  hand HTML to Claude Code: believe the replay.
- **Crawler reachability.** Theirs reported "ClaudeBot: unknown, ora-agent:
  unknown" for firecrawl.dev, which reads as a sample that did not answer.
  `crawler-policy` sends each identity beside a browser and curl and refuses
  to grade when neither control gets in, so a 403 means policy. Believe the
  one with controls.
- **The 404 probe goes to the apex.** Their evidence for www.nytimes.com and
  www.gymshark.com names `https://nytimes.com/__ora-404-probe-...`. doors
  probes the origin it was given. Where the apex and `www` are served by
  different stacks, the two can disagree and both be right.
- **Prose read with a model.** "Deprecation policy mentioned in prose at
  docs.stripe.com" and "Onboarding signals described but not verified live"
  show their scanner reads documentation pages. doors reads the homepage,
  llms.txt, agent.txt and AGENTS.md, so a policy that lives only deep in the
  docs reads lower here. The fix is the same either way: put it in the spec or
  in llms.txt, where a machine finds it without reading prose.
- **A CLI on a tap.** Stripe's CLI ships on a Homebrew tap and theirs graded it
  partial ("mentioned in llms.txt"). doors confirms npm and PyPI names with one
  registry request each and reads anything else as "named, not confirmed"
  (half credit). Neither instrument confirms a tap.
- **YAML specs.** doors parses JSON only (zero dependencies), so a YAML-only
  OpenAPI document passes `openapi-spec` and leaves the five spec-reading
  checks unmeasured. Publish the JSON twin; most generators emit both.
- **Bonus.** Theirs counts up to 45 signals (monday.com); doors counts the
  emerging doors its siblings already read (the ladder's 22 checks, llms.txt,
  llms-full.txt, AGENTS.md, NLWeb, TDM terms) at their observed rate. Treat
  the bonus as approximate on both sides of a diff; it is never more than 5.

## First read of the reference site

aadhar.sh scored 100 on 2026-10-13 (essential 80/80, 11 of 11; recommended
16.8/20, 18 of 24; bonus +5 from 40 signals), with six items still open, all
recommended:

| check | their evidence | the fix |
|---|---|---|
| `cli-tool` | No CLI tool found | publish a CLI and name its install command in llms.txt |
| `rate-limit-headers` | documented in the OpenAPI spec, not observed on a live response | send `RateLimit` / `RateLimit-Policy` from the worker, not only in the spec |
| `org-schema-completeness` | Organization missing contactPoint, address | add both to the homepage JSON-LD |
| `onboarding-friction` | zero-auth endpoint verified; no sandbox described | describe a sandbox or test mode in llms.txt (the zero-auth reads may already be one) |
| `brand-search-accuracy` | ranks #8 for the brand alone | search, not markup; a product term in the title and H1 helps |
| `agentic-search-specific` | name search surfaced no developer pages | product name in the titles of /docs, the OpenAPI and MCP pages |

The score is capped, so these move the recommended bucket and not the number.

## The 41 reports

Scores and buckets as published (essential and recommended as earned over
pool, passing of total; bonus as points and signal count). Read through
`/api/v1/report` on 2026-10-16; `scanned` is their date.

| origin | score | essential | recommended | bonus | scanned |
|---|---|---|---|---|---|
| aadhar.sh | 100 | 80 (11/11) | 16.8 (18/24) | 5 (40) | 2026-10-13 |
| is-agentic.com | 100 | 80 (10/10) | 18.6 (20/22) | 5 (28) | 2026-09-01 |
| supabase.com | 100 | 77.3 (9/10) | 18.2 (18/22) | 5 (40) | 2026-10-09 |
| resend.com | 94 | 73.3 (8/10) | 15.6 (14/22) | 5 (35) | 2026-10-09 |
| exa.ai | 93 | 69.6 (8/11) | 17.9 (20/24) | 5 (31) | 2026-10-07 |
| clerk.com | 88 | 66.7 (7/11) | 16.5 (17/23) | 5 (39) | 2026-10-07 |
| monday.com | 87 | 63.7 (6/9) | 18.3 (17/20) | 5 (45) | 2026-10-16 |
| vercel.com | 87 | 63.5 (8/11) | 18.2 (18/22) | 5 (38) | 2026-08-30 |
| www.browserbase.com | 85 | 62.9 (7/11) | 16.8 (12/19) | 5 (29) | 2026-09-05 |
| planetscale.com | 80 | 57.7 (6/10) | 16.8 (12/19) | 5 (25) | 2026-10-12 |
| stripe.com | 79 | 59.4 (7/11) | 14.4 (13/22) | 5 (27) | 2026-08-21 |
| neon.com | 79 | 57.3 (5/10) | 17 (17/23) | 5 (26) | 2026-10-16 |
| mpp.dev | 78 | 61.3 (6/10) | 12 (10/22) | 5 (25) | 2026-09-08 |
| www.sanity.io | 78 | 59 (4/7) | 13.9 (10/17) | 5 (24) | 2026-09-06 |
| www.notion.com | 77 | 57.9 (6/10) | 14.2 (12/20) | 5 (33) | 2026-08-22 |
| www.mintlify.com | 76 | 57.3 (6/10) | 13.3 (10/18) | 5 (28) | 2026-10-09 |
| www.firecrawl.dev | 76 | 55.8 (6/11) | 14.7 (12/19) | 5 (36) | 2026-08-29 |
| www.cloudflare.com | 75 | 57.3 (6/10) | 12.6 (10/22) | 5 (31) | 2026-09-13 |
| isitagentready.com | 71 | 57.1 (5/7) | 9 (6/17) | 4.9 (22) | 2026-09-10 |
| www.anthropic.com | 70 | 52 (5/10) | 14.4 (11/18) | 3.3 (14) | 2026-10-08 |
| github.com | 69 | 52.5 (5/10) | 12.6 (11/22) | 3.8 (16) | 2026-08-21 |
| context7.com | 69 | 46.5 (6/11) | 17.4 (17/23) | 5 (32) | 2026-10-15 |
| shopify.dev | 62 | 47.6 (3/7) | 11.4 (8/16) | 3.2 (14) | 2026-09-15 |
| www.contentful.com | 62 | 41.5 (4/9) | 15.6 (11/18) | 5 (21) | 2026-09-09 |
| www.allbirds.com | 60 | 45.3 (5/10) | 9.7 (7/18) | 5 (22) | 2026-10-15 |
| hygraph.com | 60 | 41.3 (4/10) | 15.6 (11/18) | 3.5 (17) | 2026-08-25 |
| gitlab.com | 60 | 39.2 (3/8) | 15.4 (12/19) | 5 (22) | 2026-09-12 |
| docs.github.com | 59 | 45.7 (4/7) | 10.4 (7/17) | 3.2 (14) | 2026-10-09 |
| linear.app | 56 | 37.3 (4/10) | 13.8 (10/20) | 5 (23) | 2026-10-13 |
| www.shopify.com | 56 | 37 (3/9) | 14.5 (12/18) | 4.6 (20) | 2026-09-04 |
| en.wikipedia.org | 54 | 44.2 (3/8) | 8.6 (4/14) | 1.4 (6) | 2026-10-08 |
| www.walmart.com | 54 | 40.5 (4/10) | 11 (4/16) | 2.1 (10) | 2026-08-24 |
| www.perplexity.ai | 53 | 34 (3/8) | 13.9 (10/19) | 4.6 (21) | 2026-08-24 |
| example.com | 52 | 46.7 (3/6) | 4.6 (1/8) | 0.8 (3) | 2026-08-31 |
| saleor.io | 52 | 30.3 (3/11) | 16.5 (13/17) | 5 (27) | 2026-10-09 |
| openai.com | 46 | 31.1 (2/8) | 12.1 (8/17) | 2.8 (11) | 2026-10-16 |
| www.target.com | 44 | 31.7 (2/9) | 10.2 (5/16) | 1.8 (7) | 2026-08-24 |
| www.amazon.com | 42 | 29.9 (2/10) | 9.8 (7/18) | 2.1 (9) | 2026-10-15 |
| www.gymshark.com | 33 | 20 (2/10) | 8 (5/17) | 4.6 (19) | 2026-10-16 |
| www.nytimes.com | 24 | 15 (1/8) | 8.3 (5/15) | 0.7 (4) | 2026-10-15 |
| www.coinbase.com | 23 | 11.4 (1/7) | 6.8 (5/18) | 4.4 (20) | 2026-09-10 |

example.com is the floor of the gating: 6 essential and 8 recommended, the
always-on set with no API evidence (it has no sitemap, no JSON-LD and no
trust pages, and is charged for each). Every site with any developer surface
counts 7 to 11 essentials.
