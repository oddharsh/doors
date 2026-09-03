---
name: crawler-policy
description: Find out what a site actually hands each AI crawler and search bot, and make its crawler policy deliberate. Use this whenever someone asks whether their site blocks or allows GPTBot, ClaudeBot, CCBot, Googlebot, PerplexityBot or "AI scrapers", wants to write or check robots.txt rules per bot, asks about ai.txt, TDM reservation (tdmrep.json) or Content-Signal, wonders why a crawler sees a 403 their browser does not, or says "block AI training but keep search". Also use it before believing any tool's claim that a site "blocks all AI crawlers": run the probe, read the two control rows first.
---

# crawler-policy

What a site hands each crawler is decided in three places that can disagree: the
robots.txt rules a polite bot reads first, the server's response to the bot's
user-agent, and the machine-readable reservation files (`ai.txt`,
`/.well-known/tdmrep.json`, `Content-Signal`) that say what a bot may DO with the
bytes once it has them. Most sites have set one of the three, by accident, and
believe they have a policy.

## Run the probe first

```bash
node scripts/bot-views.mjs https://example.com            # the homepage
node scripts/bot-views.mjs https://example.com/blog/post  # robots rules are per path
node scripts/bot-views.mjs https://example.com --json
```

It fetches the URL as ten identities and reads robots.txt, ai.txt and tdmrep.json
once each. Eight identities are crawlers (Googlebot, GPTBot, ClaudeBot, CCBot,
Google-Extended, PerplexityBot, ChatGPT-User, Claude-User), and two are CONTROLS,
a Chrome user-agent and curl.

**Read the `instrument` line before any row.** A crawler row answering 403 has
two explanations that look identical from one sample: the origin refuses that
NAME, or it refuses THIS INSTRUMENT (a datacenter address, a TLS fingerprint, a
missing cookie) and would refuse anything. medium.com and quora.com answer 403 to
Chrome as well, so every AI-crawler row on those hosts says nothing about crawler
policy. If no control got in, the verdict is `unmeasurable`, and that is the
honest answer rather than a failure of the probe. One control getting in is
enough: linkedin.com answers 999 to curl unconditionally and serves Chrome fine.

Controls are displayed and never scored. `sampled bots` counts crawlers only,
because counting a browser as a bot identity that got an unblocked response
would reward exactly the site that serves humans and refuses every machine.

## Reading the table

| column | meaning |
|---|---|
| `wire` | the status that user-agent received on this path |
| `robots` | what robots.txt says about that bot on this path: `allow`, `block`, `n/a` for a control (robots.txt does not govern a browser) |
| `rule` | the longest matching rule, so you can find the line |

The line to act on is the disagreement: a bot `allow`ed by robots.txt and refused
on the wire is a policy that lives only in the server, invisible to a bot that
reads robots first and honours it. A bot `block`ed by robots.txt and served 200
on the wire is normal (robots is advisory) and is the reason reservation files
exist: they travel WITH the bytes.

## Writing the policy

Decide the three questions separately, then write each in its own place:

1. **Who may fetch.** robots.txt, one group per decision. The matcher is
   longest-token-wins on the user-agent and longest-path-wins on the rule, with
   `Allow` beating `Disallow` at equal length and an empty `Disallow:` meaning no
   rule at all. `references/checklist.md` has the parser these rules come from
   and the traps (a `*` group silently covering a bot you meant to name).
2. **What they may do with it.** `Content-Signal: search=yes, ai-train=no,
   ai-input=yes` inside the robots group states the use, not the fetch, so a
   search engine and a training crawler can both fetch while only one may train.
   `tdmrep.json` is the TDM Reservation Protocol form of the same statement, per
   path prefix, read by European text-and-data-mining tooling.
3. **Whether the server agrees.** If you block at the edge (a WAF rule, a bot
   fight mode), say so in robots.txt too, or a polite crawler reads `Allow: /`,
   fetches, and gets a 403 it has no way to interpret.

The reference site allows every identity on every path and states the use in
`Content-Signal`; that is a deliberate policy, not the absence of one, and the
probe prints it as `blocks 0 of 8` with the signal present.

## Own crawler

If your site runs a crawler of its own, `robots.txt` should allow it by name and
the crawler should identify honestly and verifiably. That half is the
`agent-identity` skill.

## Reference implementation

The roster, the control rule and the robots parser are the reference site's
`/lens` bot-views tier: `src/worker/lens.ts` (`LENS_BOT_VIEWS`, `lensFetchAsBot`,
the `sampledBots` gate) and `src/worker/lib/robots.ts`. Paths in
`../../references/site-paths.md`.
