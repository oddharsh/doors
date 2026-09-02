#!/usr/bin/env node
// conform.mjs — knock on an MCP server the way a real, strict client does, and
// say which era it speaks, whether its published card matches what it serves,
// and which of its tools claim to write.
//
//   node conform.mjs https://example.com            /mcp, plus the .well-known cards
//   node conform.mjs https://example.com/serendipity/mcp --card /.well-known/mcp/serendipity.json
//   node conform.mjs https://example.com --json
//
// The request shape is the one that survived a survey of 38 live servers (see
// references/survey.md): Mcp-Method on every POST, BOTH Accept framings, and
// MCP-Protocol-Version only as a REPLY to a refusal that names it.
const UA = "doors-mcp/0.1 (+https://github.com/oddharsh/doors)";
const MODERN = "2026-07-28";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const cardArg = args.includes("--card") ? args[args.indexOf("--card") + 1] : null;
if (!target) { console.error("usage: conform.mjs <origin or /mcp url> [--card /path.json] [--json]"); process.exit(2); }
const u = new URL(target); const origin = u.origin; const endpoint = u.pathname === "/" ? "/mcp" : u.pathname;

async function rpc(method, params, extraHeaders = {}) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(origin + endpoint, { method: "POST", body, signal: ctrl.signal, headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-method": method, ...extraHeaders } });
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    const text = await res.text();
    let json = null;
    if (ct === "text/event-stream") { const m = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).find((d) => d.startsWith("{")); if (m) try { json = JSON.parse(m); } catch {} }
    else try { json = JSON.parse(text); } catch {}
    return { status: res.status, ct, www: res.headers.get("www-authenticate") || "", json, text: text.slice(0, 300) };
  } catch (e) { return { status: 0, ct: "", www: "", json: null, text: "", error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}
const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} };
const out = { origin, endpoint, era: null, versions: null, tools: null, card: null, notes: [] };

// 1. modern knock
let r = await rpc("server/discover", { _meta: meta });
if (r.error) { out.era = "unknown"; out.notes.push(`probe failed: ${r.error}`); }
else if (r.status === 401) { out.era = "locked"; out.notes.push(`401${r.www ? " " + r.www.split(" ")[0] : " (empty challenge)"}: a door, and we did not get to look`); }
else if (r.json?.result) {
  out.era = "modern"; out.versions = r.json.result.supportedVersions || r.json.result.protocolVersions || null;
  out.notes.push(`server/discover answered (${r.ct})${r.json.result.resultType ? `, resultType ${r.json.result.resultType}` : ", no resultType (clients read absent as complete)"}`);
} else if (r.json?.error?.code === -32022) {
  out.era = "modern-other-version"; out.versions = r.json.error.data?.supported || null;
  out.notes.push(`-32022: refuses ${MODERN}, supports ${JSON.stringify(out.versions)}; a dual-era client retries with one of those`);
} else if (r.json?.error?.code === -32020) {
  // the strict-header half: retry once carrying the version header, as a reply and only then
  const r2 = await rpc("server/discover", { _meta: meta }, { "mcp-protocol-version": MODERN });
  out.notes.push(`-32020 header mismatch on the first knock; retry with MCP-Protocol-Version -> HTTP ${r2.status}${r2.json?.result ? " result" : r2.json?.error ? ` error ${r2.json.error.code}` : ""}`);
  if (r2.json?.result) { out.era = "modern"; out.versions = r2.json.result.supportedVersions || null; } else out.era = "unknown";
} else if (r.json?.error?.code === -32601 || r.json?.error) {
  // legacy: no server/discover. Do the handshake it expects.
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "doors-mcp", version: "0.1" } });
  if (init.json?.result) { out.era = "legacy"; out.versions = [init.json.result.protocolVersion]; out.notes.push(`legacy handshake: initialize answered protocolVersion ${init.json.result.protocolVersion}`); }
  else { out.era = "unknown"; out.notes.push(`server/discover -> error ${r.json.error.code}; initialize -> HTTP ${init.status}${init.json?.error ? ` error ${init.json.error.code}` : ""}`); }
} else out.notes.push(`HTTP ${r.status} ${r.ct}: ${r.text.slice(0, 120)}`), out.era = r.status === 404 ? "none" : "unknown";

// 2. tools/list, in whichever era answered
if (["modern", "modern-other-version", "legacy"].includes(out.era)) {
  const params = out.era === "legacy" ? {} : { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": out.era === "modern-other-version" && out.versions?.[0] ? out.versions[0] : MODERN } };
  const tl = await rpc("tools/list", params);
  const tools = tl.json?.result?.tools;
  if (Array.isArray(tools)) {
    const writes = tools.filter((t) => t.annotations && t.annotations.readOnlyHint === false);
    const unannotated = tools.filter((t) => !t.annotations);
    out.tools = { count: tools.length, names: tools.map((t) => t.name), writes: writes.map((t) => t.name), unannotated: unannotated.length };
    out.notes.push(`${tools.length} tool(s); ${writes.length} declare readOnlyHint:false; ${unannotated.length} carry no annotations at all (a client must then assume they may write)`);
  } else out.notes.push(`tools/list -> HTTP ${tl.status}${tl.json?.error ? ` error ${tl.json.error.code}` : ""}`);
}

// 3. the published card, deep-compared to the live list by tool NAME set
const cardPath = cardArg || "/.well-known/mcp/server-card.json";
try {
  const res = await fetch(origin + cardPath, { headers: { "user-agent": UA, accept: "application/json" } });
  if (res.status === 404) out.card = { path: cardPath, verdict: "absent" };
  else {
    const j = await res.json();
    const cardTools = (j.tools || j.capabilities?.tools || []).map((t) => t.name).filter(Boolean).sort();
    if (out.tools) {
      const live = [...out.tools.names].sort();
      const same = JSON.stringify(cardTools) === JSON.stringify(live);
      out.card = { path: cardPath, verdict: same ? "matches" : "DRIFTS", cardTools, live, missingFromCard: live.filter((n) => !cardTools.includes(n)), staleInCard: cardTools.filter((n) => !live.includes(n)) };
    } else out.card = { path: cardPath, verdict: "present (live list unavailable to compare)", cardTools };
  }
} catch (e) { out.card = { path: cardPath, verdict: `unreadable: ${e.message}` }; }

if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`mcp conformance: ${origin}${endpoint}\n`);
  console.log(`  era        ${out.era}${out.versions ? "  " + JSON.stringify(out.versions) : ""}`);
  for (const n of out.notes) console.log(`  note       ${n}`);
  if (out.tools) console.log(`  tools      ${out.tools.count}: ${out.tools.names.join(", ")}` + (out.tools.writes.length ? `\n  writes     ${out.tools.writes.join(", ")}` : ""));
  if (out.card) console.log(`  card       ${out.card.path} ${out.card.verdict}` + (out.card.verdict === "DRIFTS" ? `\n             missing from card: ${out.card.missingFromCard.join(", ") || "none"}; stale in card: ${out.card.staleInCard.join(", ") || "none"}` : ""));
}
process.exit(out.card?.verdict === "DRIFTS" ? 1 : 0);
