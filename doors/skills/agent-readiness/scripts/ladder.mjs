#!/usr/bin/env node
// ladder.mjs — one command for "how agent-ready is this origin, and what is the
// next thing to build". It runs the sibling probes (agent-audit, agent-auth,
// skills-index, agent-commerce), adds five cheap reads of its own, folds the
// lot onto the 22 checks and the 0-5 ladder isitagentready.com grades with, and
// names the doors skill that opens each door still shut.
//
//   node ladder.mjs https://store.example
//   node ladder.mjs https://store.example --profile commerce      commerce doors count, and lead the to-do list
//   node ladder.mjs https://store.example --reference             also ask isitagentready.com and diff the two, check by check
//   node ladder.mjs https://store.example --json
//
// The ladder is theirs (levels, names and thresholds copied from their
// scan-site skill, 2026-09-16), so a merchant can quote one number in both
// places. The verdicts are ours, because every probe here carries a control
// and derives its paths from what the origin advertises. Where the two
// disagree, --reference prints both and says which instrument to believe and
// why. Zero dependencies beyond the sibling scripts.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const UA = "doors-agent-readiness/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "all";
const REFERENCE = args.includes("--reference");
if (!target || !["all", "content", "api", "commerce"].includes(profile)) { console.error("usage: ladder.mjs <origin> [--profile all|content|api|commerce] [--reference] [--json]"); process.exit(2); }
const origin = new URL(target).origin;
const here = dirname(fileURLToPath(import.meta.url));
const SIBLING = { audit: join(here, "../../agent-audit/scripts/audit.mjs"), auth: join(here, "../../agent-auth/scripts/auth.mjs"), skills: join(here, "../../skills-index/scripts/verify.mjs"), commerce: join(here, "../../agent-commerce/scripts/commerce.mjs") };

function run(script, extra = []) {
  return new Promise((resolve) => execFile(process.execPath, [script, origin, "--json", ...extra], { maxBuffer: 16 << 20, timeout: 180000 }, (err, stdout) => {
    try { resolve(JSON.parse(stdout)); } catch { resolve({ error: err ? err.message : "no JSON from " + script }); }
  }));
}
async function get(u, accept = "application/json, */*;q=0.5") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } }); return { status: res.status, text: await res.text(), headers: res.headers }; }
  catch (e) { return { status: 0, text: "", headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const isHtml = (t) => /^\s*<(!doctype|html)/i.test(t.slice(0, 300));
const V = (verdict) => verdict === "yes" || verdict === "likely"; // a door verdict, as the ladder counts it

// The 22 checks, in their five categories, with the skill that opens each. `neutral` is their word for "not counted" (commerce on a non-commerce origin, Web Bot Auth on a site with no crawler).
const CHECKS = [
  ["discoverability", "robotsTxt", "robots.txt", "discovery-files"], ["discoverability", "sitemap", "sitemap.xml", "discovery-files"], ["discoverability", "linkHeaders", "Link headers with agent relations", "agent-readiness"], ["discoverability", "dnsAid", "DNS-AID _agents SVCB", "agent-identity"],
  ["content", "markdownNegotiation", "Accept: text/markdown negotiation", "markdown-twins"],
  ["botAccess", "robotsTxtAiRules", "AI crawler rules in robots.txt", "crawler-policy"], ["botAccess", "contentSignals", "Content-Signal in robots.txt", "crawler-policy"], ["botAccess", "webBotAuth", "Web Bot Auth key directory", "agent-identity"],
  ["discovery", "apiCatalog", "RFC 9727 api-catalog", "discovery-files"], ["discovery", "oauthDiscovery", "OAuth / OIDC AS metadata", "agent-auth"], ["discovery", "oauthProtectedResource", "RFC 9728 protected resource metadata", "agent-auth"], ["discovery", "authMd", "auth.md agent registration", "agent-auth"],
  ["discovery", "mcpServerCard", "MCP server card", "mcp-doors"], ["discovery", "a2aAgentCard", "A2A agent card", "agent-identity"], ["discovery", "agentSkills", "Agent Skills index", "skills-index"], ["discovery", "webMcp", "WebMCP tools in the page", "mcp-doors"], ["discovery", "ard", "ARD manifest", "agent-readiness"],
  ["commerce", "ucp", "UCP profile", "agent-commerce"], ["commerce", "acp", "ACP discovery", "agent-commerce"], ["commerce", "x402", "x402 402 route", "agent-commerce"], ["commerce", "mpp", "MPP challenge + discovery", "agent-commerce"], ["commerce", "ap2", "AP2 on the agent card", "agent-commerce"],
];
const RECIPE = {
  robotsTxt: "serve /robots.txt (RFC 9309) with a group per policy and a Sitemap: line", sitemap: "serve /sitemap.xml and name it from robots.txt", linkHeaders: 'send Link: </.well-known/api-catalog>; rel="api-catalog" (and service-desc / alternate) on /', dnsAid: "publish _index._agents.<host> SVCB 1 <host>. alpn=h2,h3 port=443, DNSSEC-signed",
  markdownNegotiation: "answer Accept: text/markdown with text/markdown and break the q=1 tie in Markdown's favour", robotsTxtAiRules: "name GPTBot, ClaudeBot, Google-Extended, PerplexityBot and friends in robots.txt with the policy you mean", contentSignals: "add Content-Signal: ai-train=..., search=..., ai-input=... to robots.txt", webBotAuth: "publish a JWK Set at /.well-known/http-message-signatures-directory with kid = RFC 7638 thumbprint",
  apiCatalog: "serve /.well-known/api-catalog as application/linkset+json naming each API's service-desc and service-doc", oauthDiscovery: "serve /.well-known/oauth-authorization-server (issuer = this origin, token_endpoint, grant_types_supported)", oauthProtectedResource: "serve /.well-known/oauth-protected-resource (resource, authorization_servers, scopes_supported) and name it from 401 challenges", authMd: "serve /auth.md and an agent_auth block (register_uri, identity_types_supported) on the AS metadata",
  mcpServerCard: "generate /.well-known/mcp/server-card.json from tools/list and test them equal", a2aAgentCard: "serve /.well-known/agent-card.json with name, provider, interfaces and skills, every URL answering", agentSkills: "publish /.well-known/agent-skills/index.json with a sha256 digest per SKILL.md (index-skills.mjs writes it)", webMcp: "register tools with navigator.modelContext (WebMCP) from a first-party script", ard: "serve /.well-known/ard.json (and the ai-catalog.json alias) with urn:air entries and 2-5 representativeQueries each, CORS *",
  ucp: "serve /.well-known/ucp with ucp.version, ucp.services (a rest or mcp shopping service), ucp.capabilities and ucp.payment_handlers", acp: "serve /.well-known/acp.json with protocol{name:acp,version,supported_versions}, api_base_url, transports, capabilities.services", x402: "answer 402 with PAYMENT-REQUIRED (x402 v2) on paid routes and list them in api-catalog or openapi.json", mpp: "answer 402 with WWW-Authenticate: Payment and serve /openapi.json with x-payment-info.offers[]", ap2: "declare https://github.com/google-agentic-commerce/ap2/v1 under capabilities.extensions on the agent card",
};

// ── the five reads this script does itself (each is one request) ─────────
async function ownReads() {
  const [home, robots, full, ard, aic, card, bareMd] = await Promise.all([get(origin + "/", "text/html, */*;q=0.5"), get(origin + "/robots.txt", "text/plain, */*;q=0.5"), get(origin + "/llms-full.txt", "text/plain, text/markdown;q=0.9, */*;q=0.5"), get(origin + "/.well-known/ard.json"), get(origin + "/.well-known/ai-catalog.json"), get(origin + "/.well-known/mcp/server-card.json"), get(origin + "/", "text/markdown")]);
  const links = [...(home.headers.get("link") || "").matchAll(/<([^>]+)>\s*;([^,]*)/g)].map((m) => ({ href: m[1], rel: /rel="?([^";,]+)/.exec(m[2])?.[1] || null }));
  const agentRels = links.filter((l) => ["api-catalog", "service-desc", "service-doc", "alternate", "ard", "ai-catalog", "http-message-signatures-directory"].includes(l.rel));
  const signal = /^\s*content-signal\s*:\s*(.+)$/im.exec(robots.text || "")?.[1]?.trim() || null;
  const ardDoc = ard.status === 200 && !isHtml(ard.text) ? json(ard.text) : aic.status === 200 && !isHtml(aic.text) ? json(aic.text) : null;
  const entries = Array.isArray(ardDoc?.entries) ? ardDoc.entries : [];
  const ardProblems = entries.filter((e) => !/^urn:air:/.test(String(e.identifier || e.id || e.urn || "")) || !(Array.isArray(e.representativeQueries) && e.representativeQueries.length >= 2 && e.representativeQueries.length <= 5)).length;
  const cardDoc = card.status === 200 && !isHtml(card.text) ? json(card.text) : null;
  // WebMCP cannot be read without a browser; a static read of the page and its first-party scripts finds the registration call and says "likely".
  let webmcp = { verdict: "no", detail: "no navigator.modelContext / document.modelContext registration in the page or its first-party scripts" };
  if (home.status === 200) {
    // Every script the page loads, first-party or not: a platform registers its storefront tools from its own CDN (Shopify's standard-actions.js, 2026-09-16).
    const srcs = [...new Set([...home.text.matchAll(/<script[^>]+src=["']?([^"' >]+)/gi)].map((m) => { try { return new URL(m[1], origin).href; } catch { return null; } }).filter(Boolean))].slice(0, 24);
    const hop1 = await Promise.all(srcs.map(async (s) => (await get(s, "*/*")).text));
    // One more hop: a shell script that loads the registration module on idle names it as a string (the reference site does exactly that from nav.js), and a <script src> walk never sees it.
    const hop2names = [...new Set(hop1.flatMap((b) => [...b.matchAll(/["'`](\/[\w./-]+\.m?js)["'`]/g)].map((m) => m[1])))].filter((n) => !srcs.includes(n)).slice(0, 12);
    const hop2 = await Promise.all(hop2names.map(async (n) => (await get(origin + n, "*/*")).text));
    const names = ["the page", ...srcs, ...hop2names]; const bodies = [home.text, ...hop1, ...hop2];
    const hit = bodies.findIndex((b) => /(navigator|document|window)\??\.modelContext/.test(b) && /(registerTool|provideContext)/.test(b));
    if (hit >= 0) webmcp = { verdict: "likely", detail: `registration call found in ${names[hit].replace(origin, "")} (static read${hit > srcs.length ? ", one hop past the page's own script tags" : ""}; a browser run settles what registers)` };
  }
  return {
    linkHeaders: { verdict: agentRels.length ? "yes" : links.length ? "no" : "no", detail: agentRels.length ? `${agentRels.length} agent relation(s) on /: ${[...new Set(agentRels.map((l) => l.rel))].join(", ")}` : links.length ? `${links.length} Link value(s) on /, none with an agent relation` : "no Link header on /" },
    contentSignals: { verdict: signal ? "yes" : "no", detail: signal ? `Content-Signal: ${signal}` : robots.status === 200 ? "robots.txt carries no Content-Signal line" : `no robots.txt (HTTP ${robots.status})` },
    llmsFull: { verdict: full.status === 200 && !isHtml(full.text) ? "yes" : "no", detail: full.status === 200 ? `${full.text.length} bytes${full.headers.get("x-payment-note") ? ` (${full.headers.get("x-payment-note")})` : ""}` : `HTTP ${full.status || full.error}` },
    ard: { verdict: entries.length ? (ardProblems ? "likely" : "yes") : ardDoc ? "likely" : "no", detail: entries.length ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"} at ${ard.status === 200 ? "/.well-known/ard.json" : "/.well-known/ai-catalog.json"}${ardProblems ? `, ${ardProblems} without a urn:air id or 2-5 representativeQueries` : ""}; CORS ${(ard.status === 200 ? ard : aic).headers.get("access-control-allow-origin") || "(none)"}` : ardDoc ? "JSON with no entries[]" : "no ard.json or ai-catalog.json" },
    bareMarkdown: bareMd.status === 200 && /^text\/markdown/.test(bareMd.headers.get("content-type") || ""),
    mcpServerCard: { verdict: cardDoc && (cardDoc.serverInfo || cardDoc.name) ? "yes" : cardDoc ? "likely" : "no", detail: cardDoc ? `${cardDoc.serverInfo?.name || cardDoc.name || "(unnamed)"}${Array.isArray(cardDoc.tools) ? `, ${cardDoc.tools.length} tools listed` : ""}` : `HTTP ${card.status || card.error}` },
    webmcp,
  };
}

// ── fold everything onto the 22 checks ──────────────────────────────────────
function fold(audit, auth, skills, commerce, own) {
  const d = audit.doors || {}; const door = (k) => d[k] || { verdict: "unknown", detail: "not probed" };
  const row = (verdict, detail) => ({ status: verdict === "unknown" ? "unknown" : V(verdict) ? "pass" : "fail", verdict, detail });
  const r = {};
  r.robotsTxt = row(door("robots.txt").verdict, door("robots.txt").detail);
  r.sitemap = row(door("sitemap.xml").verdict, door("sitemap.xml").detail);
  r.linkHeaders = row(own.linkHeaders.verdict, own.linkHeaders.detail);
  r.dnsAid = row(door("DNS-AID").verdict, door("DNS-AID").detail);
  // A bare `Accept: text/markdown` is what their scanner sends and what no shipping agent client sends; an origin that answers it and hands HTML to every Accept carrying */* passes there and reaches nobody.
  const mdDoor = door("Markdown negotiation"); r.markdownNegotiation = row(mdDoor.verdict, mdDoor.verdict === "no" && own.bareMarkdown ? "answers a bare Accept: text/markdown with Markdown and HTML to a ranked Accept; 0 of the 7 shipping agent clients get Markdown (their scanner sends the bare header and passes this)" : mdDoor.detail);
  // Their rule counts a wildcard group as "rules apply to AI bots too"; the detail says whether any AI crawler is NAMED, which is the stricter and more useful reading.
  const named = door("robots.txt").named || []; r.robotsTxtAiRules = row(door("robots.txt").verdict === "yes" ? "yes" : "no", named.length ? `${named.length} AI crawler(s) named: ${named.slice(0, 6).join(", ")}${named.length > 6 ? "..." : ""}` : door("robots.txt").verdict === "yes" ? "no AI crawler named; only wildcard rules (their scanner passes this, a policy reader cannot tell what you meant)" : door("robots.txt").detail);
  r.contentSignals = row(own.contentSignals.verdict, own.contentSignals.detail);
  r.webBotAuth = row(door("Web Bot Auth").verdict, door("Web Bot Auth").detail);
  r.apiCatalog = row(door("api-catalog").verdict, door("api-catalog").detail);
  const as = auth.authorizationServer || {}; const prm = auth.protectedResource || {}; const md = auth.authMd || {};
  r.oauthDiscovery = row(as.issuer ? "yes" : "no", as.verdict || auth.error || "not probed"); r.oauthProtectedResource = row(prm.resource ? "yes" : "no", prm.verdict || auth.error || "not probed"); r.authMd = row(md.markers ? (as.agentAuth ? "yes" : "likely") : "no", (md.verdict || auth.error || "not probed") + (md.markers && !as.agentAuth ? "; no agent_auth block on the AS metadata" : ""));
  if (auth.chain?.length) r.oauthProtectedResource.detail += `; chain: ${auth.chain.length} broken hop(s)`;
  r.mcpServerCard = row(own.mcpServerCard.verdict, own.mcpServerCard.detail);
  r.a2aAgentCard = row(door("agent-card").verdict, door("agent-card").detail);
  const si = skills.index || {}; r.agentSkills = row(si.verified > 0 ? "yes" : si.verdict?.startsWith("present") ? "likely" : "no", si.verdict || skills.error || "not probed");
  r.webMcp = row(own.webmcp.verdict, own.webmcp.detail);
  r.ard = row(own.ard.verdict, own.ard.detail);
  const cd = commerce.doors || {}; const sells = commerce.commerce?.verdict === "yes" || commerce.commerce?.verdict === "likely";
  // The commerce probe can be walled while the audit's browser control got in (a retailer that refuses unknown user-agents); its doors are unknown then, never "no commerce".
  const walled = commerce.measurable === false;
  for (const k of ["ucp", "acp", "x402", "mpp", "ap2"]) { const c = cd[k] || { verdict: "unknown", detail: commerce.error || "not probed" }; r[k] = row(walled ? "unknown" : c.verdict, c.detail); if (!walled && !sells && r[k].status === "fail" && profile !== "commerce") r[k].status = "neutral"; }
  if (r.webBotAuth.status === "fail") r.webBotAuth.status = "neutral"; // their scanner: informational only, since it grades the site's OWN crawler
  return r;
}

// ── their ladder, verbatim from scan-site (2026-09-16) ───────────────────────
const LEVELS = ["Not Ready", "Basic Web Presence", "Bot-Aware", "Agent-Readable", "Agent-Integrated", "Agent-Native"];
function ladder(r) {
  const ok = (k) => r[k].status === "pass";
  const l1 = ["robotsTxt", "sitemap", "linkHeaders"].filter(ok).length >= 2;
  const l2 = l1 && ok("robotsTxtAiRules") && ok("contentSignals");
  const l3 = l2 && ok("markdownNegotiation");
  const integrations = ["mcpServerCard", "a2aAgentCard", "agentSkills", "apiCatalog"]; const l4 = l3 && integrations.some(ok);
  const native = [ok("webBotAuth") || r.webBotAuth.verdict === "yes", integrations.every(ok), ok("oauthDiscovery") || ok("authMd")].filter(Boolean).length >= 2; const l5 = l4 && native;
  const level = l5 ? 5 : l4 ? 4 : l3 ? 3 : l2 ? 2 : l1 ? 1 : 0;
  const next = [];
  if (level === 0) next.push(...["robotsTxt", "sitemap", "linkHeaders"].filter((k) => !ok(k)));
  else if (level === 1) next.push(...["robotsTxtAiRules", "contentSignals"].filter((k) => !ok(k)));
  else if (level === 2) next.push("markdownNegotiation");
  else if (level === 3) next.push(...integrations.filter((k) => !ok(k)));
  else if (level === 4) { if (!(ok("webBotAuth") || r.webBotAuth.verdict === "yes")) next.push("webBotAuth"); next.push(...integrations.filter((k) => !ok(k))); if (!(ok("oauthDiscovery") || ok("authMd"))) next.push("oauthDiscovery"); }
  return { level, name: LEVELS[level], next: [...new Set(next)] };
}
// The commerce rungs are ours: a merchant is Transactable when an agent can reach a checkout (UCP or ACP), Payable when a route can be paid over HTTP (x402 or MPP), Delegable when the card declares AP2.
function commerceRungs(r) {
  const ok = (k) => r[k].status === "pass";
  return { transactable: ok("ucp") || ok("acp"), payable: ok("x402") || ok("mpp"), delegable: ok("ap2"), next: [!(ok("ucp") || ok("acp")) && "ucp", !(ok("x402") || ok("mpp")) && "mpp", !ok("ap2") && "ap2"].filter(Boolean) };
}

async function reference() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 120000);
  try { const res = await fetch("https://isitagentready.com/api/scan", { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ url: origin }) }); const d = await res.json();
    if (d.siteError) return { error: `their scanner could not read the origin (${d.siteError.errorClass}: HTTP ${d.siteError.httpStatus})` };
    const checks = {}; for (const cat of Object.values(d.checks || {})) for (const [k, v] of Object.entries(cat)) checks[k] = { status: v.status, message: v.message };
    return { level: d.level, name: d.levelName, isCommerce: d.isCommerce, signals: d.commerceSignals, checks }; }
  catch (e) { return { error: e.message }; } finally { clearTimeout(t); }
}

async function main() {
  const [audit, auth, skills, commerce, own, ref] = await Promise.all([run(SIBLING.audit), run(SIBLING.auth), run(SIBLING.skills), run(SIBLING.commerce), ownReads(), REFERENCE ? reference() : null]);
  const measurable = audit.controls ? audit.controls.measurable !== false : !audit.error;
  // A 404 on / is an API host with no homepage (api.exa.ai), which the audit declines and Cloudflare's scanner refuses outright (siteError not_found); the other probes still ran and their rows are real.
  const noHomepage = !measurable && /HTTP 404/.test(audit.controls?.browser?.detail || "") && /HTTP 404/.test(audit.controls?.self?.detail || "");
  const checks = fold(audit, auth, skills, commerce, own);
  const lad = ladder(checks); const rungs = commerceRungs(checks);
  const counted = CHECKS.filter(([cat]) => (profile === "content" ? cat === "discoverability" || cat === "content" || cat === "botAccess" : profile === "api" ? cat !== "commerce" : true)).filter(([, k]) => checks[k].status !== "neutral" && checks[k].status !== "unknown");
  const passed = counted.filter(([, k]) => checks[k].status === "pass").length;
  const offLadder = CHECKS.map(([, k]) => k).filter((k) => checks[k].status === "fail" && !lad.next.includes(k) && !rungs.next.includes(k) && !["ucp", "acp", "x402", "mpp", "ap2"].includes(k));
  const todo = [...new Set(profile === "commerce" ? [...rungs.next, ...lad.next, ...offLadder] : [...lad.next, ...(commerce.commerce?.verdict === "yes" ? rungs.next : []), ...offLadder])].map((k) => ({ check: k, recipe: RECIPE[k], skill: CHECKS.find((c) => c[1] === k)?.[3] }));
  const diff = ref && !ref.error ? Object.keys(ref.checks).filter((k) => checks[k] && ref.checks[k].status !== checks[k].status && !(ref.checks[k].status === "neutral" && checks[k].status === "neutral")).map((k) => ({ check: k, theirs: ref.checks[k].status, theirMessage: ref.checks[k].message, ours: checks[k].status, ourDetail: checks[k].detail })) : null;
  const out = { origin, profile, measurable, controls: { audit: audit.controls || audit.error || null, commerce: commerce.controls || commerce.error || null, skills: skills.controls || null, auth: auth.control || null }, sells: commerce.commerce?.verdict || null, signals: commerce.commerce?.signals || [], level: lad.level, levelName: lad.name, score: `${passed}/${counted.length}`, commerce: rungs, checks, next: todo, reference: ref, disagreements: diff, llmsFull: own.llmsFull };
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }

  console.log(`${origin}   profile ${profile}\n`);
  if (noHomepage) console.log(`  ! GET / answers 404: an API host with no homepage. The audit declined, so its doors read as unknown; the auth, skills and commerce rows below ran and are real.\n`);
  else if (!measurable) console.log(`  ! the audit's controls failed (${JSON.stringify(audit.controls || audit.error)}): this origin refuses the instrument, so every "no" below is uninterpretable\n`);
  if (commerce.measurable === false) console.log(`  ! the commerce probe was refused (${commerce.doors?.ucp?.detail}); its five rows read as unknown\n`);
  console.log(`  level ${lad.level} of 5   ${lad.name}          ${passed} of ${counted.length} counted checks pass`);
  console.log(`  commerce       ${out.sells === "yes" ? "sells" : out.sells === "likely" ? "probably sells" : out.sells === "unknown" ? "unknown (probe refused)" : "no commerce signal"}${out.signals.length ? ` (${out.signals.join(", ")})` : ""}: ${rungs.transactable ? "transactable" : "not transactable"}, ${rungs.payable ? "payable" : "not payable"}, ${rungs.delegable ? "delegable" : "not delegable"}\n`);
  let cat = ""; for (const [c, k, label] of CHECKS) { if (c !== cat) { cat = c; console.log(`  ${c}`); } const ck = checks[k]; console.log(`    ${(ck.status === "pass" ? "open" : ck.status === "neutral" ? "n/a " : ck.status === "unknown" ? "?   " : "shut").padEnd(5)} ${label.padEnd(38)} ${ck.detail}`); }
  console.log(`\n  next (in order)`);
  if (!todo.length) console.log(`    nothing: every counted door is open`);
  for (const t of todo) console.log(`    ${t.check.padEnd(24)} ${t.recipe}\n    ${"".padEnd(24)} skill: ${t.skill}`);
  if (ref) {
    console.log(`\n  isitagentready.com   ${ref.error ? ref.error : `level ${ref.level} ${ref.name}; isCommerce ${ref.isCommerce}${ref.signals?.length ? ` (${ref.signals.join(", ")})` : ""}`}`);
    if (diff) { if (!diff.length) console.log(`    the two instruments agree on every check`); for (const d of diff) console.log(`    ${d.check.padEnd(24)} theirs ${d.theirs.padEnd(8)} ${d.theirMessage}\n    ${"".padEnd(24)} ours   ${d.ours.padEnd(8)} ${d.ourDetail}`); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
