---
name: agent-readiness
description: One command that says how agent-ready an origin is on the 0-5 ladder isitagentready.com (Cloudflare) grades with, which of its 22 checks are open, and the next door to build with the doors skill that builds it, in the order the ladder wants them. Use this FIRST when a merchant, platform or site owner asks "is my site agent-ready", "what level are we on isitagentready", "how do I get to Agent-Native", "what should we build next for agents", or wants a readiness report for a storefront or a paid API; use --profile commerce for a store so the commerce doors count and lead the list, and --reference to run Cloudflare's scanner beside it and see, check by check, where the two instruments disagree and why. It runs agent-audit, agent-auth, skills-index and agent-commerce and adds Link headers, Content-Signal, ARD, the MCP server card and a static WebMCP read of its own.
---

# agent-readiness

isitagentready.com is Cloudflare's scanner: 22 checks in five categories,
folded into a level from 0 (Not Ready) to 5 (Agent-Native), with a fix sheet
per failing check. It is the number a merchant will be asked for, so this skill
computes the same number, with the same thresholds, from probes that carry
controls and follow the origin's own catalogs. Where the two disagree, the
disagreement is the finding.

## Run it

```bash
node scripts/ladder.mjs https://store.example --profile commerce --reference
node scripts/ladder.mjs https://docs.example --profile content
node scripts/ladder.mjs https://api.example --profile api --json
```

Profiles are theirs: `content` counts discoverability, content and bot access;
`api` counts everything but commerce; `all` counts commerce only when the
origin sells something; `commerce` counts the commerce doors always and puts
them first in the to-do list. `--reference` POSTs the origin to their
`/api/scan` and prints a row for every check where their status and ours
differ, with both details.

Read the output top down: the control line (if the audit's controls failed,
the origin refuses the instrument and nothing below is a measurement), the
level and the commerce rungs, the 22 rows, then **next (in order)**, which is
the ladder's own requirement for the next level followed by every other shut
door, each with a one-line recipe and the skill that does the work.

## The ladder

| level | name | needs |
|---|---|---|
| 1 | Basic Web Presence | 2 of robots.txt, sitemap, Link headers with agent relations |
| 2 | Bot-Aware | AI crawler rules in robots.txt AND Content-Signal |
| 3 | Agent-Readable | `Accept: text/markdown` negotiation |
| 4 | Agent-Integrated | 1 of MCP server card, A2A agent card, Agent Skills index, api-catalog |
| 5 | Agent-Native | 2 of Web Bot Auth, all four integrations, auth metadata (OAuth or Auth.md) |

Copied from their `scan-site` skill on 2026-09-16; `references/isitagentready.md`
keeps the full check list and their fix-sheet text. Commerce is outside their
ladder, so this skill adds three rungs of its own for a store: **transactable**
(UCP or ACP), **payable** (x402 or MPP), **delegable** (AP2 on the agent card).

## Where the two instruments disagree, and which to believe

Every row below was measured on 2026-09-16 with `--reference`.

- **Markdown negotiation.** Their scanner sends a bare `Accept: text/markdown`,
  which no shipping agent client sends. A Shopify storefront answers that with
  Markdown and hands HTML to any Accept that also lists `*/*`, so it passes
  there while 0 of the 7 real clients in `markdown-twins` get Markdown. Ours
  reports it shut and says why. Believe the replay.
- **UCP.** Their validator reads `services` and `capabilities` at the top level
  and reported a Shopify profile carrying one service and nine capabilities
  under `ucp.` as `hasServices: false`. Ours reads the profile's required
  root. Both pass the door; only ours can say what is behind it.
- **x402.** Theirs knocks `/`, `/api`, `/api/v1` and asks Coinbase's registry,
  so a seller with paid routes under `/api/<vendor>/` reads "not detected".
  Ours knocks what the api-catalog and openapi.json advertise.
- **WebMCP.** Theirs runs a browser and reads `navigator.modelContext`, which is
  the right instrument. Ours reads the page and its scripts statically (two
  hops) and reports `likely` at best. When they say pass and ours says shut,
  believe them and add the script path to the static read.
- **AI crawler rules.** Theirs passes any robots.txt with a wildcard group
  ("rules apply to all crawlers including AI bots"). Ours passes it too, for
  the ladder's sake, and the detail says whether an AI crawler is NAMED, which
  is what a policy reader can act on.
- **Agent Skills.** Theirs counts entries. Ours hashes every artifact, which the
  RFC makes a MUST, and reads the frontmatter a loader needs.
- **A bot wall.** Theirs returns a `siteError` with no per-check output when
  the origin refuses it. Ours runs the audit's two controls first and marks the
  run unmeasurable, which is the same answer with the reason attached. When
  only the commerce probe is refused (a retailer that lets a browser in and
  refuses unknown user-agents: sephora.com), its five rows read `unknown`
  rather than "no commerce".
- **No homepage.** Theirs refuses an origin whose `/` is 404 (`siteError:
  not_found`), which is every API host without a landing page. Ours reads a
  404 as measurable: api.exa.ai sells over x402 and MPP behind such a root.

## What a commerce platform does with it

Run `--profile commerce --reference` on one storefront. The level and the
disagreement rows are the report. The to-do list is the roadmap, and every line
names the skill: `agent-commerce` for the three commerce rungs, `agent-auth`
for the OAuth chain a checkout agent will walk, `agent-identity` for the card
that carries AP2, `markdown-twins` for the negotiation the platform's edge may
already half-do. Re-run after each door; the number moves the day the document
ships, since nothing here is cached longer than an hour.

## Reference implementation

The reference site grades level 5 on both instruments (17 of 17 non-commerce
checks), with one disagreement (WebMCP, static read against a browser) that
the static read now resolves. Its own readiness surface is
`src/worker/agent-ready.ts` (the `agent_ready` MCP tool and `/terminal`
frame), which counts five doors and refuses to score a check that could not
run. Paths in `../../references/site-paths.md`.
