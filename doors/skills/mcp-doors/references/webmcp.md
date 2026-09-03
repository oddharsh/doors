# WebMCP: the browser as an MCP client, measured

WebMCP is the browser-side catalog: a page registers tools into
`document.modelContext` and a page-driven agent (a browser extension, an
assistant built into the browser) calls them. It is not a separate server. The
right source of truth is the same `tools/list` the HTTP door serves, so the
reference site's `src/client/webmcp.js` reads `/mcp` once and registers what it
finds; a second hand-written list drifted three ways within a month before it
was replaced.

This is a reference rather than a skill because nothing about it can be probed
without a browser: the registration happens in page JavaScript against an API
that only Chromium ships.

## The API as it actually behaves (Chrome 151 and 152, measured 2026-08)

- `document.modelContext.registerTool({ name, description, inputSchema, execute })`
  and `getTools()` are ASYNC. There is no unregister; a page that wants to change
  a tool re-registers under the same name.
- `inputSchema` is a JSON Schema OBJECT in; the browser hands `execute` a parsed
  object and expects a STRING back. Return JSON as a string.
- Of MCP's five tool annotations the browser keeps `readOnlyHint` ALONE.
  `destructiveHint` and `idempotentHint` are dropped, so a page cannot tell an
  agent which tools write through the annotation. Restate it in the description
  and gate a writing tool behind a confirmation dialog.
- Frames aggregate SAME-ORIGIN only. A cross-origin iframe's tools are not
  visible to the top document's agent.
- A HIDDEN tab looks like a permanently hung registration: nothing resolves until
  the tab is visible. Every agent-driven browser backgrounds its tabs, so a probe
  that "sees no tools" from an automated browser has measured visibility.
- Registration from a page served as a shared-dictionary DELTA works when the
  script is first-party. The one thing that did NOT work was an EDGE-INJECTED
  bridge (`HTMLRewriter` at the CDN), because a dcz delta cannot be rewritten:
  the injection silently skipped the busiest page. That is the reason the
  reference site retired Cloudflare's injected bridge for a first-party module,
  and a general warning about any edge feature that rewrites HTML.

## Shape that keeps it honest

```js
// load on idle from your shell script; never block first paint on it
if ("modelContext" in document) {
  const r = await fetch("/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-method": "tools/list", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", _meta: { protocolVersion: "2026-07-28", clientCapabilities: {} } }) });
  const { result } = await r.json();
  for (const t of result.tools) {
    await document.modelContext.registerTool({
      name: t.name,
      description: t.annotations?.readOnlyHint === false ? `${t.description} (WRITES: asks before running)` : t.description,
      inputSchema: t.inputSchema,
      async execute(args) {
        if (t.annotations?.readOnlyHint === false && !confirm(`Run ${t.name}?`)) return JSON.stringify({ refused: true });
        const c = await fetch("/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-method": "tools/call", "mcp-name": t.name, accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: t.name, arguments: args }, _meta: { protocolVersion: "2026-07-28", clientCapabilities: {} } }) });
        return JSON.stringify((await c.json()).result);
      },
    });
  }
}
```

Disclose it. The reference site names the module on `/whoareyou` and `/security`
and pins that mention in a test, so the page cannot describe a script that is
gone.

## Where the reference does it

- `src/client/webmcp.js`: the registrar
- `src/worker/lib/tools.ts`: the one tool registry both servers and the browser read
- the measurements above: the site's CLAUDE.md, design-system section, and the
  `webmcp-live-in-chrome-151` note
