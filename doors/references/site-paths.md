# Where the reference implementation lives

Every skill here was extracted from one working site, [aadhar.sh](https://aadhar.sh),
whose source is public at [github.com/oddharsh/site](https://github.com/oddharsh/site).
The skills cite files by path rather than vendoring copies, because a copy rots
silently and a path that stops resolving fails loudly. Paths are pinned to commit
`3d182c7d4dec1a71634460666d9c6f0fc9e85442` (2026-09-02); a link below is
`https://github.com/oddharsh/site/blob/3d182c7d4dec1a71634460666d9c6f0fc9e85442/<path>`.
Rows added with batch two (2026-09-03) resolve at the same commit; where a later
site PR changed the file, the row says so. Rows added with batch three
(2026-09-16: `agent-auth`, `skills-index`, `agent-commerce`, `agent-readiness`)
resolve at `961ca31f988e30d319040085a0822ec5e87f6fb0`, which is where the
`.well-known/` documents and `agent.ts` were read.

| concern | path | what it is |
|---|---|---|
| the audit rubric | `src/worker/lens.ts` (`lensProbe*` functions) | the probes `/lens` grades any origin with, verdict rules included |
| the MCP client half | `src/worker/lib/doors.ts` | `foreignMcpTools()`: headers and Accept framings a real MCP client needs, from a survey of 38 live servers |
| MCP wire rules | `src/worker/lib/mcp-protocol.ts`, `src/worker/mcp.ts` | one module speaking 2026-07-28 and the three legacy revisions, shared by two servers |
| MCP cards | `tools/gen-mcp-cards.ts`, `public/.well-known/mcp/server-card.json`, `public/.well-known/agent-card.json` | generated from `tools/list`, deep-equal-tested against it |
| NLWeb `/ask` | `src/worker/nlweb.ts` | streaming default, dialect by request shape, refused modes |
| Markdown twins | `tools/gen-md-twins.ts`, `tools/lib/html-to-md.ts`, `src/content/md/` | build-output twins, hand twins for rendered pages |
| Accept negotiation | `src/worker/lib/http.ts` (`wantsMarkdown`) | the first-listed tie rule and why `*/*` cannot break a tie |
| precompression + dictionaries | `tools/build.ts` (search `dcz`), `src/worker/lib/assets.ts`, `tools/roll-shell-dictionary.ts`, `tools/check-dictionary-support.ts` | q11 twins, family and per-page dictionaries, deltas, the roll, the production check |
| discovery files | `public/llms.txt`, `public/sitemap.xml`, `public/robots.txt`, `public/.well-known/api-catalog` | what ships, and the per-section `llms.txt` the build generates |
| DNS-AID | `config/infra.json` (`dns`) | the `_index._agents` SVCB record, declared and drift-checked |
| Web Bot Auth | `public/.well-known/http-message-signatures-directory`, the `BOT_NAME` code in `src/worker/` | signing your own crawler per RFC 9421 |
| IndieWeb | `src/worker/webmention.ts`, `src/worker/webmention-send.ts`, `src/worker/inbox.ts`, `src/pages/index.html` (h-card), `src/worker/writing.ts` (h-entry) | receiving, sending, and moderating webmentions; the microformats on the pages |
| the long-form record | `CLAUDE.md` (numbered gotchas), `src/pages/garage/*.html` | every measurement and every trap, in prose |
| the bot-views tier | `src/worker/lens.ts` (`LENS_BOT_VIEWS`, `lensFetchAsBot`), `src/worker/lib/robots.ts` | ten identities with two controls, and the robots parser (`crawler-policy`) |
| the Web Bot Auth signer | `src/worker/lib/botauth.ts` | RFC 9421 signing of every outbound crawl; `keyid` derivation is what the first `agent-identity` run found wrong; fixed in [oddharsh/site#716](https://github.com/oddharsh/site/pull/716) |
| identity files | `public/.well-known/http-message-signatures-directory`, `public/.well-known/agent-card.json` | the key directory and the agent card |
| DNS-AID | `config/infra.json` (`dns`), `bun run infra:check` | the `_index._agents` SVCB record declared and diffed against the zone |
| NLWeb | `src/worker/nlweb.ts`, `src/worker/lens-nlweb.ts` | the `/ask` endpoint and the per-field grader (`nlweb-ask`) |
| delivery | `src/worker/lib/assets.ts`, `src/worker/lib/shell-assets.ts`, `tools/photos/shell-data.ts`, `tools/build.ts` | q11 twins, the 404 clamp, preload Links, speculation rules, CSP hashes (`wire-weight`) |
| the wire series | `tools/perf-snapshot.ts`, `.github/workflows/perf-diff.yml`, `.github/workflows/perf-history.yml`, `src/worker/dyno.ts` | per-PR wire diff that gates nothing, and the nightly row `/garage/dyno` charts |
| the OAuth chain | `public/.well-known/oauth-authorization-server`, `public/.well-known/oauth-protected-resource`, `src/content/auth.md`, `src/worker/agent.ts` | RFC 8414 + RFC 9728 metadata with the Auth.md `agent_auth` block, and the anonymous registration handler at `/agent/auth` (`agent-auth`) |
| the skills index | `public/.well-known/agent-skills/index.json`, `public/.well-known/agent-skills/serendipity-events/SKILL.md` | one site skill with a verified digest (`skills-index`) |
| the x402 gate | `src/worker/x402.ts` | the `/llms-full.txt` paywall: v1 `accepts` envelope, facilitator verify-and-settle, and the `x-payment-note` degrade while the wallet is unset (`agent-commerce`) |
| the readiness frame | `src/worker/agent-ready.ts` | the `agent_ready` MCP tool and `/terminal` frame: five doors counted, never scored, with "could not check" as a third state (`agent-readiness`) |
| ARD | `public/.well-known/ard.json`, `public/.well-known/ai-catalog.json` | the manifest and its byte-identical alias, `urn:air:` entries with representative queries (`agent-readiness`) |
