# crawler-policy checklist

## robots.txt matching, as crawlers actually do it

- Groups start at a run of `User-agent:` lines and end at the next one. Rules
  before any `User-agent:` line belong to nobody.
- A bot picks the group whose agent token is the LONGEST prefix of its own name,
  case-insensitively; `*` only applies when no named group matches. So a
  `User-agent: *` group with `Disallow: /` and a `User-agent: GPTBot` group with
  nothing in it ALLOWS GPTBot everything, because the named group wins and is
  empty.
- Within the chosen group the LONGEST matching path pattern wins. `Allow` beats
  `Disallow` at equal length. `*` is a wildcard, `$` anchors the end. An empty
  `Disallow:` is no rule.
- `Sitemap:` lines are global, not per group.
- `Content-Signal:` is a group directive (an extension, not RFC 9309): a
  comma-separated list of `use=yes|no` pairs. The reference site uses
  `search`, `ai-input` and `ai-train`.
- robots.txt is advisory. A bot that ignores it sees whatever the server sends,
  which is what the wire column measures.

## The reservation files

- `/ai.txt`: a plain-text policy in the robots.txt idiom, read by a few AI
  crawlers. Presence is all the probe asserts; there is no single spec to grade
  against.
- `/.well-known/tdmrep.json`: an array of `{ "location": "/path/*",
  "tdm-reservation": 0|1, "tdm-policy": "<url>" }` rules. `1` reserves the
  right (no mining without a licence), `0` waives it. The probe reports how many
  rules and how many reserve.
- `X-Robots-Tag` response header and `<meta name="robots">`: per-response
  indexing directives (`noindex`, `noai`, `noimageai`). The probe prints the
  header when present.

## Traps the probe is built around

- **No control, no conclusion.** A table of 403s with no browser row is a table
  about your IP address. The reference site's lens rendered "blocks all AI
  crawlers" for every hard-walled origin until the controls were added.
- **One sample is not a policy.** Bot walls rate-limit and challenge
  intermittently; stackoverflow.com joins the unmeasurable set only after a few
  samples. Re-run before writing a verdict down.
- **The user-agent is the whole disguise here.** The probe sends a bare bot UA
  from your machine, not the bot's IP range, so a site that verifies crawlers by
  reverse DNS (Google) or by Web Bot Auth signature will refuse the bot row and
  admit the controls. That is a correct refusal of an impostor, not a block on
  the bot. Read `sampled bots` with that in mind on origins that verify.
- **Per path.** A homepage that allows everything says nothing about `/api/` or
  `/members/`. Run the paths you care about.

## Where the reference does it

- roster and control rule: `src/worker/lens.ts`, `LENS_BOT_VIEWS` and the
  comment above `lensFieldEvidence`'s `sampledBots`
- parser: `src/worker/lib/robots.ts` (`lensParseRobots`, `lensRobotsVerdict`,
  `lensPathMatch`)
- the site's own robots.txt with `Content-Signal`: `public/robots.txt`
