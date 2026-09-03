# doors

Skills for making a website something an agent can walk into.

Ten skills, each a probe that can fail plus a checklist for when it cannot run:

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
| `wire-weight` | who compressed the page (origin q11 or edge q4, from the wire bytes), a 103 seen over h2, `script-src` by hash, speculation rules, and immutable assets with a 404 clamp whose control mirrors the site's own shape |

Extracted from one working site, cited by path at a pinned commit: see
`doors/references/site-paths.md`.

## Install

```
/plugin marketplace add oddharsh/doors
/plugin install doors@doors
```

MIT.
