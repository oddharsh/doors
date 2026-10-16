---
name: make-agent-ready
description: The front door for building, not grading. Turns "make my site agent-ready" into one ordered build brief that scores well on both agent-readiness scanners, isitagentready.com (Cloudflare's 0-5 ladder) and is-agentic.com (Vercel and Ora's 0-100), limited to what is relevant for the kind of site it is (a personal or content site gets no API or commerce work). Each item says why it counts on each scanner, what to change, the commands that prove it shipped and the doors skill with the detail. Use this FIRST when someone says "make my site agent-ready / agent-native", "get us to 100 on is-agentic and level 5 on isitagentready", "what should we build for agents", "set up a new site so agents can use it", or hands over a site and an afternoon. Works on a live origin (plans only what is still open, measured by doors' own probes) or with no origin at all (the whole plan for a new site of that type). To only measure, use agent-score or agent-readiness.
---

# make-agent-ready

Two scanners grade agent readiness, and they disagree on what matters: one
climbs a ladder of discovery files and protocols, the other charges every page
for basics most sites skip. Both publish their fixes (Cloudflare as 24 fix
skills, Vercel as a recommendation on every check). This skill folds those
fixes, and what doors' probes learned on live sites, into one catalog of 31
cards, and turns the catalog into a brief a coding agent can work top to
bottom.

## Run it

```bash
node scripts/plan.mjs https://site.example --type content     # measure, then plan only what is open
node scripts/plan.mjs https://site.example                    # infer the type (the site-type tag, then commerce, then API evidence)
node scripts/plan.mjs --type content                          # a new site: the whole plan, no network
node scripts/plan.mjs --check                                 # every check on both scanners has a card
```

The output is Markdown written for a coding agent: paste it into the session
that owns the site's code, or work it here. `--json` gives the structure.

## Pick the type first

| type | for | builds | leaves alone |
|---|---|---|---|
| `content` (alias `personal`) | personal sites, blogs, portfolios, docs read as prose | page basics, crawler policy, sitemap, llms.txt with when-to-use, Link headers, Markdown negotiation | MCP, OpenAPI, OAuth, CLI, pricing, commerce |
| `business` | company and marketing sites | the content list, a complete Organization, brand search | the API list, commerce |
| `app` (alias `api`) | APIs, developer platforms, hosted software | everything except commerce | commerce (optional for a paid API) |
| `store` (alias `shop`) | anything that sells | the content list, pricing, WebMCP, the commerce doors | the API list unless there is one |

The type maps to is-agentic's own four site types, and the brief's first card
declares it on the page.

## What it folds in

- **The ladder** (isitagentready): robots.txt, sitemap and Link headers, then
  AI rules plus Content-Signal, then Markdown negotiation, then one
  integration, then two of Web Bot Auth, all integrations and auth metadata. A
  lower rung blocks every level above it, so the brief weights them that way.
- **The pools** (is-agentic): an Essential is worth 7 to 13 points and a
  Recommended at most 2.5; not-applicable checks leave the pool. The brief puts
  Essentials first and never asks a content site to build an API.
- **The fix text** of both, rewritten as steps with the commands that prove
  them, plus what the doors probes found the scanners miss: the equal-q
  Markdown tie, the Markdown body on a 404, the edge that refuses agents
  robots.txt allows.

## The rules every brief starts with

1. Never advertise a door you do not serve.
2. **Do not open a door you will not finish.** On is-agentic, an MCP server, an
   OpenAPI document, OAuth metadata or a developer portal is evidence of an API,
   and evidence turns on three more Essentials. A content site that adds `/mcp`
   and stops loses points. When the probe finds such a door on a site whose type
   would skip it, the brief lists it under **Finish or close**.
3. Keep every claim true: a Person, not an invented Organization; no sandbox
   you do not run.
4. Essentials first, lower rungs first.
5. Prove each change from the outside, then re-plan.

## The honest ceilings

- **A content site** can reach 100 on is-agentic (its pool is the six page
  Essentials and about nine Recommended rows, and the bonus covers small gaps)
  and level 4 on isitagentready, using an Agent Skills index as its
  integration. Level 5 needs two of Web Bot Auth (only for a site that runs a
  crawler), all four integrations, and OAuth or Auth.md, none of which a
  content site has a reason to build. Level 4 is the ceiling, and the brief
  says so rather than inventing doors.
- **An app** can reach both maxima; the API cards are most of the work.
- **A store** reaches level 4 or 5 depending on its integrations, and the
  commerce doors are graded outside the ladder.

## After the brief

Work the cards in order, deploy, and re-run with the origin. The brief only
lists what is still open, so a shrinking brief is the progress report. Then
read the published numbers: `agent-score --reference` and
`agent-readiness --reference` diff doors' measurement against each scanner's
own, check by check. is-agentic refreshes a report only when it is older than
6 hours, so use Rescan on their report page first.

## Where the cards live

`scripts/catalog.mjs` is the single source: 31 cards, each naming the checks
it closes on both scanners, its relevance per type, the steps, the proof and
the skill. `--check` fails if either scanner grades a check no card covers,
or a card names a skill or a probe that does not exist; run it after changing
the catalog or either grader.
