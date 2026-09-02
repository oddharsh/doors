---
name: agent-audit
description: 'Grade any website for how well an agent can find its way in, the way aadhar.sh/lens does: llms.txt, AGENTS.md, sitemap, robots policy toward AI crawlers, the A2A agent card, the RFC 9727 api catalog, an MCP server at /mcp, an NLWeb /ask endpoint, Accept: text/markdown negotiation (including the equal-q tie three real agent clients send), DNS-AID, Web Bot Auth, and TDM terms. Use this whenever someone asks "is my site agent-ready", "what am I missing for LLMs / AI crawlers / agents", "audit my site for MCP or llms.txt", "how do agents see my site", or wants to check a competitor or a customer domain, and use it FIRST before any of the other doors skills so the work starts from a measurement rather than a checklist. Runs a zero-dependency node script with controls; falls back to a manual checklist when it cannot run.'
---

# agent-audit

Grade an origin for the doors an agent can walk through, and say which ones are
missing, in that order. The measurement comes first because a checklist applied
to a site nobody has knocked on produces confident to-do items for things that
are already there, and misses the door that is present but locked.

## Run the probe first

```bash
node <plugin-root>/skills/agent-audit/scripts/audit.mjs https://example.com
node <plugin-root>/skills/agent-audit/scripts/audit.mjs https://example.com --json
```

Zero dependencies, node 22 or newer, about 14 requests, one pass. Read the two
control rows before anything else: if the origin refuses both a browser and the
probe, the table below them is not evidence of anything, and the honest report
is "unmeasurable from here", not "has nothing".

Then read the verdicts with the vocabulary in the plugin's
`references/probe-conventions.md`: `yes` and `likely` are open doors, `maybe`
is a shape worth a look, `no` is a to-do only if the controls passed, and
`unknown` is the origin not answering, which is not absence. The reasoning
behind every rule is in `references/verdicts.md`; read it when a verdict
surprises you or the user disputes one.

## Then turn the result into work

Map each `no` to the skill that builds it, and hand off rather than improvise:

| door | skill |
|---|---|
| llms.txt, sitemap, robots | `discovery-files` |
| Markdown negotiation | `markdown-twins` |
| MCP, agent card, api catalog | `mcp-doors` |
| DNS-AID, Web Bot Auth | `mcp-doors` (identity section) |
| h-card, webmentions (not graded here; personal sites) | `indieweb` |

Two things to say plainly in the report. A locked MCP door (401 with a
challenge) is present and counts; the user may not know they have one. And a
`robots.txt` that blocks `GPTBot` and `ClaudeBot` outright is a policy, not a
defect: report what it says, do not recommend changing it unless asked.

## If the script cannot run

No node, no network from here, or the user pasted headers rather than a URL:
walk `references/verdicts.md` by hand. Each row names the request to make and
the answer that counts. Keep the same discipline: fetch `/` as a browser first,
and grade nothing on an origin that refused it.

## What this skill deliberately does not do

It does not wear another bot's user-agent to see what that bot sees. The
reference site has a tier that does (its bot-views table) and documents it as
the one exception to identifying honestly; that exception is not reproduced
here. It also does not grade quality, only presence: whether the `llms.txt` is
any good is a reading job, and the script says so.
