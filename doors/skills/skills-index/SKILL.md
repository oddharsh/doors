---
name: skills-index
description: Publish the skills your site wants agents to load, as an Agent Skills discovery index at /.well-known/agent-skills/index.json (Cloudflare's discovery RFC v0.2.0) with a SHA-256 digest per SKILL.md that the generator here computes from the bytes that ship. Use this when someone wants to "publish a skill", "expose SKILL.md files on my site", "agent-skills index", "agentskills.io discovery", asks how Claude Code or another agent would find a site-specific skill, or has an index that a client refuses: the probe fetches every artifact and verifies its digest, which is what the RFC says a client MUST do and what a scanner that counts entries never does.
---

# skills-index

A skill is a `SKILL.md` an agent loads when a task matches its description. The
discovery index is the sign at the door: one JSON file naming each skill, where
its bytes are, and their SHA-256. The digest is the part that carries weight.
The RFC says a client MUST verify the artifact against it and MUST NOT use a
mismatch, so an index whose digests are stale is an index that installs nothing.

## Run the probe first

```bash
node scripts/verify.mjs https://example.com
node scripts/verify.mjs https://example.com --json
```

It fetches the index, checks `$schema` is one it knows, then fetches every
artifact and hashes it. For `skill-md` entries it also reads the YAML
frontmatter, because agentskills.io requires `name` and `description` there
and a loader refuses a file without them. Two controls: a skill path that cannot
exist must not answer 200 (an SPA catch-all mints "present" for everything),
and the comparator is run on bytes with one flipped to show it can say no.

**Field note, 2026-09-16.** isitagentready.com publishes 24 skills at its own
index and every digest verifies. None of the 24 files carries frontmatter, so
an agent that follows the index gets 24 documents a skill loader will not load.
The index check passed on their scanner; the artifact check is where it shows.

## Publish one

```bash
node scripts/index-skills.mjs skills/ --base https://example.com --out public/.well-known/agent-skills/index.json
node scripts/index-skills.mjs skills/ --check public/.well-known/agent-skills/index.json   # CI: exit 1 on drift
```

`skills/` holds one directory per skill with a `SKILL.md` inside. The entry's
`name` is the directory name and `description` is the frontmatter's, so there is
one place to edit either. `--check` is the shape to run in CI: a SKILL.md edited
without regenerating the index is exactly the mismatch a client is told to
refuse, and it is silent until an agent reports "skill failed to install".

Serve the index as `application/json` with `Access-Control-Allow-Origin: *`
(browser-side agents read it) and a short cache (the reference uses
`max-age=0, must-revalidate`, since the digests are the freshness signal).
Serve each `SKILL.md` as `text/markdown`.

## What goes in a site skill

The reference site publishes one: `serendipity-events`, which tells an agent how
to query a public MCP server on the site (the endpoint, the tools, what each
returns, what it will not do). That is the shape worth copying. A site skill
is a bounded contract for one door, and its description is what the agent
matches a task against, so write the description as the sentence a user would
say.

## Traps

- `type` is `skill-md` or `archive`, nothing else; `url` may be relative to the
  index. `digest` is `sha256:` plus 64 LOWERCASE hex characters.
- Rewriting a file at deploy (minifiers, line-ending normalisation, a CDN that
  adds a BOM) changes the bytes after the digest was taken. Compute the digest
  from the bytes that ship, which is why the generator reads the file rather
  than the source of it, and run `--check` against the served copy if a
  pipeline sits in between.
- An index with no `$schema` is read as v0.1.0. Publishing v0.2.0 entries
  without the `$schema` line makes a strict client treat `digest` as unknown.

## Reference implementation

`public/.well-known/agent-skills/index.json` and
`public/.well-known/agent-skills/serendipity-events/SKILL.md` on the reference
site. The RFC: github.com/cloudflare/agent-skills-discovery-rfc. Paths in
`../../references/site-paths.md`.
