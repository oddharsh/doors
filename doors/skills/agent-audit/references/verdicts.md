# Why each door is graded the way it is

Ported from `src/worker/lens.ts` in the reference site (see the plugin's
`references/site-paths.md`). The rules below were each written from a false
positive or a false negative that a real origin produced; the origin is named
where the site's own notes name it.

| door | reads `yes` / `likely` when | the case that shaped the rule |
|---|---|---|
| `llms.txt` | a non-HTML body with a few non-empty lines | a catch-all router that answers every path with the homepage makes `/llms.txt` "present" to a naive check; the HTML test refuses that |
| `AGENTS.md` | either casing answers and the body is not HTML | same catch-all trap |
| `sitemap.xml` | `<urlset>` or `<sitemapindex>` in the body | a 200 with the homepage is not a sitemap |
| `robots.txt` | present; the detail says which AI crawlers it names and which it blocks outright | `robots.txt` is a statement of policy, so absence is `no` with "everything allowed by default" |
| agent card | JSON at `/.well-known/agent-card.json` | the reference site's root card served the WRONG server for weeks (its second MCP server), which is why the card's `name` is printed |
| api catalog | `application/linkset+json` at `/.well-known/api-catalog` | RFC 9727 names the type; a generic JSON there is `maybe` |
| MCP | an SSE stream or a JSON-RPC body at `/mcp`; 401 with a challenge is `likely` (a locked door is a door) | 16 of 38 surveyed servers are auth-gated and refuse in two dialects, an empty 401 (Cloudflare's six) and an OAuth challenge; both are entrances |
| MCP, the request itself | POST `server/discover` with `Mcp-Method` and BOTH `Accept` framings | `mcp.context7.com` and `docs.mcp.cloudflare.com` answer 400 without the header; `mcp.deepwiki.com` refuses a JSON-only Accept with 406 |
| NLWeb | an event stream at `/ask`, or a 400/422 that names `query` | `query` is required by the protocol, so a conforming server MUST refuse a bare knock, and the refusal naming the parameter is the most identifying answer possible. 410, 412 and 429 bot walls refuse the request and never name a parameter, so they stay `no` |
| Markdown negotiation | `text/markdown` for a ranked Accept AND for the equal-q Accept that Claude Code, Copilot CLI and Microsoft Copilot send | the reference site itself passed every checklist and handed those three clients HTML until 2026-08-27, because its tie rule ranked strictly by q. A browser control must come back HTML, or the site has one representation and nothing is negotiated |
| DNS-AID | an SVCB record at `_index._agents.<host>`, looked up over DoH with the DO bit so the AD flag says whether it is signed | macOS `dig` predates the SVCB mnemonic and silently degrades to an A query, which is why this is a DoH JSON lookup |
| Web Bot Auth | a JWKS at `/.well-known/http-message-signatures-directory` | this is the site publishing a key for ITS OWN crawler; absence means it does not sign outbound requests |
| TDM terms | JSON at `/.well-known/tdmrep.json` | terms are a claim, so only presence is graded here; what the policy says is a reading job |

## The controls

`GET /` as a browser and as this probe. Both are printed first. If both fail,
every door below is unmeasurable and the script says so instead of printing a
column of `no`. The reference site measured `medium.com` and `quora.com`
answering 403 to Chrome itself, which made every crawler verdict on those hosts
noise until the control existed.
