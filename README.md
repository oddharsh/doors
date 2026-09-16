# doors

Skills for making a website something an agent can walk into.

Fourteen skills, each a probe that can fail plus a checklist for when it cannot run:

| skill | does |
|---|---|
| `agent-audit` | grades any origin the way [aadhar.sh/lens](https://aadhar.sh/lens) does: llms.txt, agent card, api catalog, MCP, NLWeb, Markdown negotiation, AGENTS.md, robots, DNS-AID, Web Bot Auth, terms. Controls first. |
| `discovery-files` | `llms.txt` at root and per section, `sitemap.xml`, `robots.txt` that allows your own bot, and a sweep that every advertised path answers |
| `markdown-twins` | a `.md` twin for every page, and `Accept: text/markdown` negotiation that three of seven shipping agent clients actually need |
| `mcp-doors` | an MCP server that speaks both eras, generated cards tested against `tools/list`, and the client-side headers a survey of 38 live servers showed are required |
| `shared-dictionaries` | brotli q11 twins, a family dictionary plus per-page snapshots, dcz deltas, and the check that the tier is live in production |
| `indieweb` | h-card, `rel=me`, h-entry on posts, and webmentions in and out |
| `crawler-policy` | what each AI crawler and search bot actually receives, read beside a browser and curl control so a 403 means policy rather than "we never got in"; robots per bot, `Content-Signal`, `tdmrep.json` |
| `agent-identity` | Web Bot Auth signing with a key directory whose `kid` is the JWK thumbprint real verifiers key on, the agent card, and DNS-AID `_agents` records verified over DoH |
| `nlweb-ask` | an NLWeb `/ask` that refuses what it cannot do, graded per result field with one real question, since a knock proves nothing |
| `agent-readiness` | one command for the 0-5 ladder [isitagentready.com](https://isitagentready.com) grades with, computed from the probes below, with the next door to build and the skill that builds it; `--reference` runs Cloudflare's scanner beside it and prints every check where the two disagree, and why |
| `agent-commerce` | the five commerce doors, read from the wire: UCP and ACP profiles validated against their specs, x402 and MPP classified by 402 dialect (one response can carry both), AP2 on the agent card; routes come from the origin's own api-catalog and openapi.json, and a fixture control speaks all four dialects |
| `agent-auth` | the OAuth chain an agent walks from a 401: RFC 9728 protected resource metadata, RFC 8414 / OIDC server metadata with an `issuer` that derives to its path, a token endpoint that answers, and Auth.md with an `agent_auth` block; every hop fetched |
| `skills-index` | an Agent Skills discovery index with a digest per SKILL.md computed from the bytes that ship, a `--check` for CI, and a verifier that hashes every artifact the way the RFC says a client MUST |
| `wire-weight` | who compressed the page (origin q11 or edge q4, from the wire bytes), a 103 seen over h2, `script-src` by hash, speculation rules, and immutable assets with a 404 clamp whose control mirrors the site's own shape |

Extracted from one working site, cited by path at a pinned commit: see
`doors/references/site-paths.md`. The readiness ladder, its 22 checks and the
commerce category fold in [isitagentready.com](https://isitagentready.com)'s
rubric (2026-09-16); `doors/skills/agent-readiness/references/isitagentready.md`
records what it checks and where doors measures differently.

For a store: `node doors/skills/agent-readiness/scripts/ladder.mjs https://store.example --profile commerce --reference`.

`evals/corpus.json` is 29 live origins the probes learned from, each with what
it teaches and a recorded expectation; `node evals/corpus.mjs --expect` runs the
commerce, auth and skills probes over all of them in about ten seconds and exits
1 on drift.

## Install

```
/plugin marketplace add oddharsh/doors
/plugin install doors@doors
```

MIT.
