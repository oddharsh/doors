#!/usr/bin/env node
// audit.mjs — grade an origin the way aadhar.sh/lens does. Zero dependencies,
// node 22+ (global fetch). Controls run first; without them every "no" is noise.
//
//   node audit.mjs https://example.com            table for people
//   node audit.mjs https://example.com --json     one document for agents
//   node audit.mjs https://example.com --strict   exit 1 if the control fails
//
// Verdict rules are ported from src/worker/lens.ts in github.com/oddharsh/site
// (lensProbeMcp, lensProbeNlweb, lensProbeMdNego, lensProbeAgentsMd,
// lensProbeDnsAid); see references/verdicts.md for the reasoning behind each.

const UA = "doors-audit/0.1 (+https://github.com/oddharsh/doors)";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const TIMEOUT = 8000;

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const JSON_OUT = args.includes("--json"), STRICT = args.includes("--strict");
if (!target) { console.error("usage: audit.mjs <origin> [--json] [--strict]"); process.exit(2); }
const origin = new URL(target).origin;

async function get(path, { headers = {}, method = "GET", body, ua = UA, bytes = 4096 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(origin + path, { method, body, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": ua, ...headers } });
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    let head = "";
    try { const buf = new Uint8Array(await res.arrayBuffer()); head = new TextDecoder().decode(buf.subarray(0, bytes)); } catch {}
    return { ok: res.ok, status: res.status, ct, head, headers: res.headers, error: null };
  } catch (e) { return { ok: false, status: 0, ct: "", head: "", headers: new Headers(), error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}
const v = (verdict, detail, extra = {}) => ({ verdict, detail, ...extra });
const isHtml = (r) => /html/.test(r.ct) || /^\s*<!doctype html|^\s*<html/i.test(r.head);
const unanswered = (r) => !!r.error || r.status >= 500;

// ── controls ────────────────────────────────────────────────────────────────
async function controls() {
  const [asBrowser, asSelf] = await Promise.all([get("/", { ua: BROWSER_UA, headers: { accept: "text/html" } }), get("/", { headers: { accept: "text/html" } })]);
  return {
    browser: v(asBrowser.ok ? "yes" : "no", `GET / as a browser: HTTP ${asBrowser.status || asBrowser.error}`),
    self: v(asSelf.ok ? "yes" : "no", `GET / as ${UA.split(" ")[0]}: HTTP ${asSelf.status || asSelf.error}`),
    measurable: asBrowser.ok || asSelf.ok,
  };
}

// ── doors ───────────────────────────────────────────────────────────────────
async function llmsTxt() {
  const r = await get("/llms.txt");
  if (r.status === 404) return v("no", "no /llms.txt");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  if (isHtml(r)) return v("no", "answered, but with an HTML page (a catch-all route, not a file)");
  const lines = r.head.split("\n").filter((l) => l.trim()).length;
  return v(lines >= 3 ? "yes" : "maybe", `${lines} non-empty line(s) in the first ${Math.min(4096, r.head.length)} bytes`);
}
async function agentsMd() {
  for (const p of ["/AGENTS.md", "/agents.md"]) {
    const r = await get(p);
    if (r.ok && !isHtml(r)) return v("yes", `${p} answers as Markdown`);
    if (r.ok && isHtml(r)) return v("no", `${p} answers with a catch-all HTML page, not instructions`);
  }
  return v("no", "no /AGENTS.md or /agents.md");
}
async function sitemap() {
  const r = await get("/sitemap.xml");
  if (r.status === 404) return v("no", "no /sitemap.xml");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  return /<(urlset|sitemapindex)\b/i.test(r.head) ? v("yes", /sitemapindex/i.test(r.head) ? "sitemap index" : "urlset") : v("no", "answers, but not a sitemap document");
}
const AI_BOTS = ["GPTBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended", "CCBot", "PerplexityBot", "Bytespider", "Applebot-Extended", "cohere-ai", "OAI-SearchBot"];
async function robots() {
  const r = await get("/robots.txt", { bytes: 65536 });
  if (r.status === 404) return v("no", "no /robots.txt (everything allowed by default)", { named: [] });
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`, { named: [] });
  if (!r.ok || isHtml(r)) return v("no", `HTTP ${r.status}${isHtml(r) ? " HTML" : ""}`, { named: [] });
  const groups = []; let cur = null;
  for (const raw of r.head.split("\n")) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const [, k, val] = m; const key = k.toLowerCase();
    if (key === "user-agent") { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.trim()); }
    else if ((key === "allow" || key === "disallow") && cur) cur.rules.push([key, val.trim()]);
  }
  const named = AI_BOTS.filter((b) => groups.some((g) => g.agents.some((a) => a.toLowerCase() === b.toLowerCase())));
  const blocked = named.filter((b) => groups.some((g) => g.agents.some((a) => a.toLowerCase() === b.toLowerCase()) && g.rules.some(([k, p]) => k === "disallow" && p === "/")));
  return v("yes", `${groups.length} group(s); names ${named.length} AI crawler(s)${blocked.length ? `, blocks ${blocked.join(", ")} entirely` : ""}`, { named, blocked });
}
async function agentCard() {
  const r = await get("/.well-known/agent-card.json", { bytes: 1 << 20 });
  if (r.status === 404) return v("no", "no /.well-known/agent-card.json");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  try { const j = JSON.parse(r.head); return v("yes", `card for ${JSON.stringify(j.name || j.title || "(unnamed)")}${Array.isArray(j.interfaces) ? `, ${j.interfaces.length} interface(s)` : ""}`); }
  catch { return v(isHtml(r) ? "no" : "maybe", isHtml(r) ? "HTML at the card path" : "answers, but does not parse as JSON"); }
}
async function apiCatalog() {
  const r = await get("/.well-known/api-catalog", { headers: { accept: "application/linkset+json, application/json" }, bytes: 1 << 20 });
  if (r.status === 404) return v("no", "no /.well-known/api-catalog");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  if (r.ct === "application/linkset+json") return v("yes", "RFC 9727 linkset");
  return v(/json/.test(r.ct) ? "maybe" : "no", `HTTP 200 ${r.ct || "no content-type"} (RFC 9727 wants application/linkset+json)`);
}
async function mcp() {
  // The real knock: a modern server/discover carrying the header the strict half
  // of the ecosystem requires, and BOTH Accept framings, because a server may
  // answer JSON or SSE at its own discretion (mcp.deepwiki.com refuses JSON-only).
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } } });
  const r = await get("/mcp", { method: "POST", body, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-method": "server/discover" } });
  const www = r.headers.get("www-authenticate") || "";
  if (r.error) return v("unknown", `probe failed: ${r.error}`);
  if (r.ct === "text/event-stream") return v("yes", "SSE stream at /mcp");
  if (/"jsonrpc"/.test(r.head)) {
    const unsupported = /-32022/.test(r.head), legacyOnly = /-32601|-32600/.test(r.head);
    return v("yes", unsupported ? "JSON-RPC at /mcp; refuses 2026-07-28 and names what it supports (a dual-era client would retry)" : legacyOnly ? "JSON-RPC at /mcp (legacy era: server/discover unknown, initialize expected)" : `JSON-RPC answer at /mcp (HTTP ${r.status})`);
  }
  if (r.status === 401 && www) return v("likely", `401 + WWW-Authenticate at /mcp (OAuth-protected server: ${www.split(" ")[0]})`);
  if (r.status === 401) return v("likely", "401 at /mcp with an empty challenge (a locked door, reported as present)");
  if ([400, 405, 406].includes(r.status) && /json/.test(r.ct)) return v("maybe", `HTTP ${r.status} ${r.ct} at /mcp`);
  if (r.status >= 500) return v("unknown", `HTTP ${r.status} at /mcp`);
  return v("no", r.status === 404 ? "no /mcp" : `HTTP ${r.status}${r.ct ? " " + r.ct : ""}`);
}
async function nlweb() {
  // A bare knock: `query` is REQUIRED, so a conforming server must refuse this,
  // and the refusal that names the parameter is the most identifying answer
  // possible. Bot walls (410, 412, 429) refuse the request and never name it.
  const r = await get("/ask", { headers: { accept: "application/json, text/event-stream" } });
  if (r.error) return v("unknown", `probe failed: ${r.error}`);
  if (r.status === 404 || isHtml(r)) return v("no", r.status === 404 ? "no /ask" : "HTML at /ask (a page, not an endpoint)");
  const json = /json/.test(r.ct) || r.head.trimStart().startsWith("{");
  if (r.ct === "text/event-stream" && r.ok) return v("likely", "event stream at /ask (NLWeb streams by default)");
  if (json && r.ok) return v("maybe", `JSON at /ask (HTTP ${r.status}), NLWeb-shaped`);
  if (json && (r.status === 400 || r.status === 422) && /\bquery\b/.test(r.head)) return v("likely", `HTTP ${r.status} at /ask asking for \`query\` by name`);
  const www = r.headers.get("www-authenticate") || "";
  if (json && r.status === 401 && www) return v("likely", "401 + WWW-Authenticate at /ask (auth-gated endpoint)");
  if (r.status >= 500) return v("unknown", `HTTP ${r.status} at /ask`);
  return v("no", `HTTP ${r.status}${r.ct ? " " + r.ct : ""}`);
}
async function markdown() {
  // Two asks, because they disagree in the wild. The first is unambiguous. The
  // second is what Claude Code, Copilot CLI and Microsoft Copilot send: both types
  // at q=1, where a strict-q server passes every checklist and still hands HTML.
  const strict = await get("/", { headers: { accept: "text/markdown, text/html;q=0.9, */*;q=0.8" } });
  const tie = await get("/", { headers: { accept: "text/markdown, text/html, */*" } });
  const ctrl = await get("/", { ua: BROWSER_UA, headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
  const md = (r) => r.ct === "text/markdown";
  if (strict.error || tie.error) return v("unknown", "probe failed");
  if (md(ctrl)) return v("no", "the browser control got Markdown too: the site has one representation and it is Markdown, so nothing is negotiated");
  if (md(strict) && md(tie)) return v("yes", "negotiates, and breaks the q=1 tie in Markdown's favour (Claude Code, Copilot CLI and Microsoft Copilot get Markdown)");
  if (md(strict) && !md(tie)) return v("likely", "negotiates on a ranked Accept, but hands HTML to the three clients that send text/markdown and text/html at equal q");
  return v("no", `no negotiation at / (got ${strict.ct || "nothing"} for text/markdown)`);
}
async function dnsAid() {
  const host = new URL(origin).hostname;
  const name = `_index._agents.${host}`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=SVCB&do=1`, { headers: { accept: "application/dns-json", "user-agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json();
    const answers = (body.Answer || []).filter((a) => a.type === 64 || a.type === 65);
    if (!answers.length) return v("no", `no SVCB at ${name}`);
    return v("yes", `${answers.length} SVCB record(s) at ${name}${body.AD ? ", DNSSEC-validated" : ", NOT DNSSEC-validated"}`);
  } catch (e) { return v("unknown", `DoH lookup failed: ${e.message}`); }
}
async function webBotAuth() {
  const r = await get("/.well-known/http-message-signatures-directory", { bytes: 1 << 20 });
  if (r.status === 404) return v("no", "no signature directory (the site does not publish a signing key for its own crawler)");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  try { const j = JSON.parse(r.head); const n = Array.isArray(j.keys) ? j.keys.length : 0; return v(n ? "yes" : "maybe", n ? `JWKS with ${n} key(s)` : "JSON, but no keys array"); }
  catch { return v("maybe", "answers, but does not parse as JSON"); }
}
async function terms() {
  const r = await get("/.well-known/tdmrep.json", { bytes: 1 << 20 });
  if (r.status === 404) return v("no", "no /.well-known/tdmrep.json (TDM reservation unstated)");
  if (unanswered(r)) return v("unknown", `HTTP ${r.status || r.error}`);
  if (!r.ok) return v("no", `HTTP ${r.status}`);
  try { const j = JSON.parse(r.head); return v("yes", `${Array.isArray(j) ? j.length : 1} TDM policy entr${Array.isArray(j) && j.length !== 1 ? "ies" : "y"}`); } catch { return v("maybe", "answers, but not JSON"); }
}

// ── run ─────────────────────────────────────────────────────────────────────
const c = await controls();
const doors = {};
if (c.measurable) {
  const jobs = { "llms.txt": llmsTxt, "AGENTS.md": agentsMd, "sitemap.xml": sitemap, "robots.txt": robots, "agent-card": agentCard, "api-catalog": apiCatalog, "MCP /mcp": mcp, "NLWeb /ask": nlweb, "Markdown negotiation": markdown, "DNS-AID": dnsAid, "Web Bot Auth": webBotAuth, "TDM terms": terms };
  const results = await Promise.all(Object.values(jobs).map((f) => f()));
  Object.keys(jobs).forEach((k, i) => (doors[k] = results[i]));
}
const open = Object.values(doors).filter((d) => d.verdict === "yes" || d.verdict === "likely").length;
const out = { origin, probe: UA, controls: c, doors, open, of: Object.keys(doors).length, measurable: c.measurable };
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`doors audit: ${origin}\n`);
  console.log(`  control   as a browser  ${c.browser.verdict.padEnd(7)} ${c.browser.detail}`);
  console.log(`  control   as itself     ${c.self.verdict.padEnd(7)} ${c.self.detail}`);
  if (!c.measurable) console.log(`\n  UNMEASURABLE: the origin refused both controls, so nothing below could be read. That is a fact about the wall, not about the doors.`);
  else {
    console.log("");
    for (const [k, d] of Object.entries(doors)) console.log(`  ${k.padEnd(22)} ${d.verdict.padEnd(7)} ${d.detail}`);
    console.log(`\n  ${open} of ${Object.keys(doors).length} doors open or likely. \`yes\` and \`likely\` count; \`maybe\` is a shape worth a look; \`unknown\` is the origin not answering, which is not absence.`);
  }
}
if (STRICT && !c.measurable) process.exit(1);
