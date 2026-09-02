# Where the reference implementation lives

Every skill here was extracted from one working site, [aadhar.sh](https://aadhar.sh),
whose source is public at [github.com/oddharsh/site](https://github.com/oddharsh/site).
The skills cite files by path rather than vendoring copies, because a copy rots
silently and a path that stops resolving fails loudly. Paths are pinned to commit
`3d182c7d4dec1a71634460666d9c6f0fc9e85442` (2026-09-02); a link below is
`https://github.com/oddharsh/site/blob/3d182c7d4dec1a71634460666d9c6f0fc9e85442/<path>`.

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
