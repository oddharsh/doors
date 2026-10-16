---
name: discovery-files
description: 'Create or repair the files crawlers and agents read first: llms.txt (root and per-section), llms-full.txt, sitemap.xml, and robots.txt that names the site''s own crawler and states AI-crawler policy. Use this whenever a site is missing llms.txt or a sitemap, when an audit reports those doors as absent, when someone asks "how do I add llms.txt", "should I block GPTBot", "my sitemap is stale", or wants every advertised path verified. Ships a sweep that fetches every URL the discovery files promise and fails on a broken one; falls back to a manual checklist.'
---

# discovery-files

The three files most crawlers read before anything else, and the one rule that
governs all of them: never advertise a door you do not serve.

## Sweep first, then write

```bash
node <plugin-root>/skills/discovery-files/scripts/sweep.mjs https://example.com
```

It reads `/llms.txt`, every per-section `llms.txt` the root one links, and
`/sitemap.xml` (one level of index), then HEADs every same-origin URL they
promise. Exit 1 on a broken path. Run it before editing so the work starts
from what is actually dangling, and run it again after, because a rewritten
`llms.txt` is where dangling paths come from.

## Writing llms.txt

One line saying what the site is. Then sections, each a list of links with a
short description. Keep the root short; give a section of many pages its own
`<section>/llms.txt` and link it from the root, so an agent after one page
pulls a small file rather than the whole index. Plain text or Markdown at
`/llms.txt`, and make sure the server types it as text: a catch-all route
that returns the homepage for unknown paths is the most common way this file
is "present" and useless.

If the site has a build step, generate the per-section files from the same
registry that builds navigation, so a new page cannot be forgotten. The
reference site does this (`references/site-paths.md`, discovery files row).

Start with an H1 naming the site and a one-paragraph summary in a `>`
blockquote (llmstxt.org's shape, and what isitagentready's fix sheet asks for).
Then add a **`## When to use this site`** section: the concrete jobs the site is
right for, each with the door to call (a page, its `.md` twin, an endpoint, an
MCP tool). is-agentic.com grades this directly (`agent-instruction`, open on
28 of 41 reports) and reads the same section for onboarding claims: if there is
an API, say whether it is free, whether it needs a key and how to get one, and
whether there is a sandbox. If nothing needs a key, say that. Name jobs, not
adjectives; "generic marketing copy does not read as guidance" is their words.

## Link headers

The cheapest of isitagentready's level-1 trio is one header on the homepage
response (RFC 8288), pointing at the machine doors that exist:

```
Link: </llms.txt>; rel="describedby"; type="text/plain", </index.md>; rel="alternate"; type="text/markdown"
Link: </.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc", </docs>; rel="service-doc"
```

The first line fits any site; the second only a site with an API. On
Cloudflare a Transform Rule or the Worker adds them without touching the
origin. Every target must answer, like every other door here.

## ARD, once there is more than one agentic resource

`/.well-known/ai-catalog.json` (application/json, `Access-Control-Allow-Origin:
*`) lists each agent-facing resource for registries: `specVersion`, a `host`
(`displayName`, a stable `identifier`), and `entries[]`, each with an
`identifier` of the form `urn:air:<host>:<kind>:<name>`, a `displayName`, a
media `type` (`application/mcp-server-card+json`, ...), exactly one of `url` or
`data`, and 2 to 5 `representativeQueries` a person would actually type. An
`Agentmap:` line in robots.txt points at it when it lives elsewhere.
isitagentready grades it outside the ladder; it is worth building when the site
has two or more of an MCP server, an agent card, a skills index, NLWeb or an
API.

## sitemap.xml and robots.txt

The checklist in `references/checklist.md` covers both, including the one
policy point worth stating out loud: naming AI crawlers in `robots.txt` is the
site owner's decision, so report what the file says and change it only when
asked. Do allow the site's own crawler by name if it runs one.

## Handing off

A site that also wants agents to *read* the pages rather than only find them
wants `markdown-twins` next; one that wants a machine-readable catalogue of
what it can do wants `mcp-doors`. Run `agent-audit` again at the end: the
verdict for these three doors should move from `no` to `yes` on the same
origin, and if it does not, the file is not where the server thinks it is.
