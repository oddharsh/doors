---
name: agent-score
description: One command for the 0-100 agent-readiness score is-agentic.com (Vercel's scanner, scored by Ora) gives a public site, computed from probes with controls, with every open check, the points it is worth and the doors skill that closes it. Use this when someone asks "what's our Is Agentic score", "how do we get to 100 on is-agentic", "fix our is-agentic report", "why did Vercel's scanner say our 404s are wrong", or wants the agent-readiness number a developer platform, docs site, SaaS app or store will be compared on; --reference reads their latest completed report and prints every check where the two instruments disagree, and why. It folds in their 36 checks (Essential 80, Recommended 20, Bonus up to 5) over agent-readiness, agent-audit, agent-auth, crawler-policy and mcp-doors, and adds its own reads of the page, the 404, a sitemap sample and the OpenAPI document. For isitagentready.com's 0-5 ladder, use agent-readiness.
---

# agent-score

is-agentic.com grades a site out of 100: 80 points for Essential checks that
every site is charged for (server-rendered text, real 404s, Markdown with
`Vary: Accept`, crawlers let in, no JavaScript redirects, no login walls),
20 for Recommended checks that turn on when the scan finds an API, OAuth,
an MCP server or a store, and up to 5 for emerging formats. Developer
platforms are the audience, so it is the number a docs site or an API will be
asked for. This skill computes the same number with the same arithmetic,
from probes that can be shown to fail, and lists what is left in the order
that recovers the most points.

## Run it

```bash
node scripts/score.mjs --control                         # first: every check green on one fixture, red on another
node scripts/score.mjs https://docs.example
node scripts/score.mjs https://api.example --reference   # also read their latest report and diff, check by check
node scripts/score.mjs https://store.example --json
```

`--control` serves three local origins: one built to pass every check doors
measures, and two built to fail them (two, because a failing origin has to
keep some doors open for the checks they gate to count: a live MCP server for
its resources and App view to fail, a sitemap for its sampled pages to fail).
It exits 1 if any check reads the same on all three. Run it after touching
the script, and before trusting a red row on a stranger's site.

Read the output top down: the score and label; the three buckets (the
recommended line says how many search checks sat outside the pool); one row
per check with its credit and the evidence (`n/a` means the check's gate is
shut, `?` means doors cannot measure it); then **next**, every check worth
points, essentials first, each with the points it would recover, a one-line
recipe and the doors skill that does the work. With `--reference`, their
score and buckets follow, then a row for every check where the two
instruments disagree.

## The rubric

| tier | pool | counts when | checks |
|---|---|---|---|
| Essential | 80 | always | content without JavaScript, agent-friendly 404s, Markdown negotiation with Vary, not blocked by bot detection, redirect hygiene, content behind auth |
| Essential | 80 | an API, MCP or OAuth is in evidence | OpenAPI published, scoped permissions, JSON error responses, OAuth 2.0 metadata, MCP resources, MCP App view and its CSP |
| Recommended | 20 | always | JSON-LD, Organization completeness, canonical/lang/og metadata, sitemap, trust pages, when-to-use guidance, content efficiency, page token budget, brand search |
| Recommended | 20 | an API, MCP or developer docs is in evidence | docs linked, developer portal, a reachable endpoint, schema quality, function-calling names, response and error schemas, versioning, rate-limit headers, MCP server, CLI, onboarding, developer-resource search |
| Bonus | +5 | never a penalty | emerging formats: llms.txt, agent card, api-catalog, MCP server card, skills index, ARD, DNS-AID, Web Bot Auth, Content-Signal, commerce doors |

Checks in a pool weigh the same, a partial earns its fraction, a shut gate
removes the check from the pool, and the score is the three summed, rounded
half up and capped at 100. That arithmetic reproduces the published score on
all 41 reports read on 2026-10-16. Labels: 85+ "Strong technical baseline",
70+ "Ready with a few material gaps", 50+ "Important blockers remain", then
"Agents are likely to struggle". `references/is-agentic.md` has the 36 check
ids, what each asks for, how doors reads it, and the 41 reports.

## Where the two instruments disagree, and which to believe

- **Brand and developer-resource search.** Two checks rank the domain in a web
  search. doors names no search engine, so they read `?` and leave the pool.
  Believe theirs, and re-scan before acting on a partial: their own evidence
  calls it "one search sample".
- **Markdown negotiation.** Both send a bare `Accept: text/markdown`, which no
  shipping agent client sends. The row grades the bare header so the numbers
  match and quotes the audit's real-client verdict beside it. A pass here can
  still hand Claude Code HTML: believe `markdown-twins`.
- **Bot detection.** Theirs reported crawlers as "unknown" when a sample did not
  answer. Ours sends each identity beside a browser and curl and refuses to
  grade when neither control gets in, so a 403 is policy. Believe ours.
- **The 404 probe.** Theirs knocks the apex (`nytimes.com`) for a `www.` origin.
  Ours knocks the origin given. When the apex runs a different stack, both are
  right about different hosts.
- **Prose in the docs.** Their scanner reads documentation pages for versioning
  and onboarding claims. Ours reads the homepage, llms.txt, agent.txt and
  AGENTS.md, so a policy buried in the docs scores lower here. Move it into
  the spec or llms.txt and both agree.
- **A CLI.** Ours confirms an npm or PyPI name with one registry request and
  gives half credit to anything it cannot confirm (a Homebrew tap). Theirs
  graded Stripe's tap-hosted CLI partial too.
- **YAML specs.** doors parses JSON only, so a YAML-only spec passes
  `openapi-spec` and leaves the five spec-reading checks unmeasured.
- **The bonus.** Their signals are never itemized; ours counts the emerging doors
  the siblings read, at their observed rate of about 0.23 points a signal.
  Approximate on both sides.

## What to build, in order

The **next** list is the order: essentials first, because a shared 80-point
pool over 6 to 11 checks makes each one worth 7 to 13 points, against at most
2.5 for a recommended check. For most sites the first three are the same and
are an afternoon each:

1. **Render the text.** 500+ characters in the raw HTML, one H1 first,
   headings stepping down a level at a time. A JavaScript shell scores 0 here
   and loses most of `content-efficiency` with it.
2. **Make 404 a 404.** An app shell answering 200 everywhere tells an agent
   every path exists. Answer 404, and under `Accept: text/markdown` a short
   Markdown body that links the sitemap and llms.txt (`markdown-twins` builds
   the negotiation that serves it).
3. **Negotiate Markdown on `/` with `Vary: Accept`.** Without `Vary`, a CDN
   hands the cached HTML to the agent that asked for Markdown.

Then the API essentials if the site has an API (an OpenAPI document, scopes in
it, problem+json errors), then the recommended list by points. Re-run after
each change; nothing here is cached.

## If the script cannot run

Work the rubric by hand from `references/is-agentic.md`, one row at a time,
with curl: `curl -s -o /dev/null -w "%{http_code}" https://site/no-such-path`
must print 404; `curl -sI -H "Accept: text/markdown" https://site/` must show
`content-type: text/markdown` and `vary` naming Accept; `curl -s https://site/ |
sed 's/<[^>]*>//g' | tr -s ' \n' | wc -c` should clear 500 once scripts and
styles are removed. Or read their report directly: `npx is-agentic <domain>`.

## Reference implementation

The reference site scores 100 on their scanner (essential 11 of 11,
recommended 18 of 24, bonus +5 from 40 signals, scanned 2026-10-13). The six
open recommended items are listed with their fixes at the end of
`references/is-agentic.md`; the cap hides them from the number. The page
checks it passes are built in files `../../references/site-paths.md`
already names: the Markdown negotiation (`src/worker/lib/http.ts`), the 404
clamp (`src/worker/lib/assets.ts`), the api-catalog
(`public/.well-known/api-catalog`), and the OAuth metadata (`agent-auth`).
