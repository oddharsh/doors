# doors

Skills for making a website something an agent can walk into.

Six skills, each a probe that can fail plus a checklist for when it cannot run:

| skill | does |
|---|---|
| `agent-audit` | grades any origin the way [aadhar.sh/lens](https://aadhar.sh/lens) does: llms.txt, agent card, api catalog, MCP, NLWeb, Markdown negotiation, AGENTS.md, robots, DNS-AID, Web Bot Auth, terms. Controls first. |
| `discovery-files` | `llms.txt` at root and per section, `sitemap.xml`, `robots.txt` that allows your own bot, and a sweep that every advertised path answers |
| `markdown-twins` | a `.md` twin for every page, and `Accept: text/markdown` negotiation that three of seven shipping agent clients actually need |
| `mcp-doors` | an MCP server that speaks both eras, generated cards tested against `tools/list`, and the client-side headers a survey of 38 live servers showed are required |
| `shared-dictionaries` | brotli q11 twins, a family dictionary plus per-page snapshots, dcz deltas, and the check that the tier is live in production |
| `indieweb` | h-card, `rel=me`, h-entry on posts, and webmentions in and out |

Extracted from one working site, cited by path at a pinned commit: see
`doors/references/site-paths.md`.

## Install

```
/plugin marketplace add oddharsh/doors
/plugin install doors@doors
```

MIT.
