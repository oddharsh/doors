#!/usr/bin/env node
// commerce.mjs — the five doors an agent that wants to BUY something looks for,
// read from the wire: UCP (/.well-known/ucp), ACP (/.well-known/acp.json),
// x402 and MPP (both live behind HTTP 402, in different dialects), and AP2
// (an extension declared on the A2A agent card). Plus the commerce signals
// that say whether this origin sells anything at all, so a "no" on a blog is
// reported as not applicable rather than as a gap.
//
//   node commerce.mjs https://store.example
//   node commerce.mjs https://store.example --paths /api/quote,/v1/report   extra routes to knock for a 402
//   node commerce.mjs https://store.example --json
//   node commerce.mjs --control          run every classifier against a local fixture server that speaks all four 402 dialects
//
// Why the 402 half derives its paths from the origin's own catalogs (api-catalog
// linkset anchors, openapi.json operations) rather than guessing /api: a
// scanner that knocks three fixed paths reported a live x402 seller as "not
// detected" on 2026-09-16 because its paid routes were elsewhere. The catalog
// is where the origin said its doors are. Zero dependencies.
import { createServer } from "node:http";
const UA = "doors-agent-commerce/0.1 (+https://github.com/oddharsh/doors)";
const AP2_URI = /github\.com\/google-agentic-commerce\/ap2\//i;
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const extraPaths = (opt("--paths") || "").split(",").map((s) => s.trim()).filter(Boolean);

async function req(u, { method = "GET", accept = "application/json, */*;q=0.5", body, headers = {} } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { method, body, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept, ...headers } });
    return { status: res.status, text: await res.text(), headers: res.headers, url: res.url }; }
  catch (e) { return { status: 0, text: "", headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const isHtml = (t) => /^\s*<(!doctype|html)/i.test(t.slice(0, 300));
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const b64json = (s) => { try { return JSON.parse(Buffer.from(s, "base64").toString("utf8")); } catch { return null; } };
const sameOrigin = (u, origin) => { try { return new URL(u, origin).origin === origin; } catch { return false; } };
const head = async (u) => { const r = await req(u, { method: "HEAD" }); return r.status === 405 || r.status === 501 ? (await req(u)).status : r.status || r.error; };

// ── the 402 classifier: four protocols answer the same status code, and one response can carry two of them ──
// (a seller that serves x402 and MPP clients from one route sends PAYMENT-REQUIRED and WWW-Authenticate: Payment on the same 402, measured 2026-09-16).
export function classify402(status, headers, text) {
  if (status !== 402) return [];
  const found = [];
  const pr = headers.get("payment-required");
  if (pr) { const d = b64json(pr); if (d && (d.x402Version != null || Array.isArray(d.accepts))) found.push({ protocol: "x402", version: d.x402Version ?? 2, accepts: (d.accepts || []).map(offer), carrier: "PAYMENT-REQUIRED header" }); }
  const wa = headers.get("www-authenticate") || "";
  if (/^\s*Payment\b/i.test(wa)) { const p = {}; for (const m of wa.matchAll(/([a-z]+)="([^"]*)"/gi)) p[m[1].toLowerCase()] = m[2]; const reqObj = p.request ? b64json(p.request.replace(/-/g, "+").replace(/_/g, "/")) : null;
    found.push({ protocol: "mpp", method: p.method || null, intent: p.intent || null, realm: p.realm || null, amount: reqObj?.amount ?? null, currency: reqObj?.currency ?? null, carrier: "WWW-Authenticate: Payment" }); }
  const body = json(text);
  if (!found.some((f) => f.protocol === "x402") && body && (body.x402Version != null || Array.isArray(body.accepts))) found.push({ protocol: "x402", version: body.x402Version ?? 1, accepts: (body.accepts || []).map(offer), carrier: "JSON body" });
  if (headers.get("crawler-price") || headers.get("crawler-charged")) found.push({ protocol: "pay-per-crawl", price: headers.get("crawler-price"), carrier: "crawler-price header" });
  return found.length ? found : [{ protocol: "unknown-402", carrier: headers.get("content-type") || "no content-type" }];
}
const offer = (a) => ({ scheme: a.scheme || null, network: a.network || null, amount: a.amount ?? a.maxAmountRequired ?? null, asset: a.asset || null, payTo: a.payTo || null });

// An MCP endpoint answers JSON-RPC POSTs and often redirects a bare GET to the storefront (Shopify's did, 2026-09-16), so the knock has to match the transport.
async function knockService(transport, endpoint) {
  if (transport === "mcp") { const r = await req(endpoint, { method: "POST", accept: "application/json, text/event-stream", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), headers: { "content-type": "application/json" } }); return r.status || r.error; }
  return head(endpoint);
}

// ── the documents ───────────────────────────────────────────────────────────
async function readUcp(origin) {
  const r = await req(origin + "/.well-known/ucp"); const d = r.status === 200 && !isHtml(r.text) ? json(r.text) : null;
  if (r.status !== 200) return { verdict: "no", detail: `absent (HTTP ${r.status || r.error})` };
  if (!d) return { verdict: "no", detail: "present but not JSON" };
  const u = d.ucp; if (!u || typeof u !== "object") return { verdict: "maybe", detail: "JSON at /.well-known/ucp with no `ucp` member (the profile's required root)" };
  const problems = [];
  if (!isDate(u.version)) problems.push("ucp.version is not YYYY-MM-DD");
  if (!u.services || typeof u.services !== "object") problems.push("ucp.services missing (required, may be empty)");
  if (!u.payment_handlers || typeof u.payment_handlers !== "object") problems.push("ucp.payment_handlers missing (required, may be empty)");
  const services = Object.entries(u.services || {}).flatMap(([name, arr]) => (Array.isArray(arr) ? arr : [arr]).map((s) => ({ name, ...s })));
  const caps = Object.keys(u.capabilities || {}); const handlers = Object.keys(u.payment_handlers || {});
  const checked = await Promise.all(services.slice(0, 4).map(async (s) => {
    const row = { name: s.name, transport: s.transport || null, endpoint: s.endpoint || null, problems: [] };
    if (!["rest", "mcp", "a2a", "embedded"].includes(s.transport)) row.problems.push(`transport ${JSON.stringify(s.transport)} is not rest/mcp/a2a/embedded`);
    if (!isDate(s.version)) row.problems.push("version not YYYY-MM-DD"); if (!s.spec) row.problems.push("no spec url");
    if (["rest", "mcp", "embedded"].includes(s.transport) && !s.schema) row.problems.push(`schema is required for ${s.transport}`);
    if (["rest", "mcp"].includes(s.transport) && !s.endpoint) row.problems.push(`endpoint is required for ${s.transport}`);
    if (s.spec) { row.spec = await head(s.spec); if (row.spec !== 200) row.problems.push(`spec answers ${row.spec}`); }
    if (s.schema) { row.schema = await head(s.schema); if (row.schema !== 200) row.problems.push(`schema answers ${row.schema}`); }
    if (s.endpoint) { row.endpointStatus = await knockService(s.transport, s.endpoint); if (row.endpointStatus === 404 || row.endpointStatus === 0) row.problems.push(`endpoint answers ${row.endpointStatus} to a ${s.transport === "mcp" ? "JSON-RPC POST" : "GET"}`); }
    return row;
  }));
  // Authority binding: a dev.ucp.* capability's schema must be served from a host that reverses to dev.ucp (ucp.dev), or the profile is claiming a standard capability with a private schema.
  const authority = caps.filter((c) => c.startsWith("dev.ucp.")).map((c) => { const arr = Array.isArray(u.capabilities[c]) ? u.capabilities[c] : [u.capabilities[c]]; const bad = arr.filter((x) => { try { const h = new URL(x.schema).hostname.split(".").reverse().join("."); return !(h === "dev.ucp" || h.startsWith("dev.ucp.")); } catch { return true; } }); return bad.length ? `${c}: schema host does not reverse to dev.ucp` : null; }).filter(Boolean);
  problems.push(...authority);
  const detail = `version ${u.version}; ${services.length} service${services.length === 1 ? "" : "s"} (${[...new Set(services.map((s) => s.transport))].join(", ") || "none"}), ${caps.length} capabilit${caps.length === 1 ? "y" : "ies"}, ${handlers.length} payment handler${handlers.length === 1 ? "" : "s"}`;
  const svcProblems = checked.flatMap((c) => c.problems.map((p) => `${c.name}: ${p}`));
  return { verdict: problems.length || svcProblems.length ? "likely" : "yes", detail: detail + (problems.length || svcProblems.length ? `; ${problems.length + svcProblems.length} problem(s)` : ""), version: u.version, capabilities: caps, paymentHandlers: handlers, services: checked, problems: problems.concat(svcProblems), keys: Array.isArray(d.keys) ? d.keys.length : 0, contentType: r.headers.get("content-type"), cacheControl: r.headers.get("cache-control") };
}

async function readAcp(origin) {
  const r = await req(origin + "/.well-known/acp.json"); const d = r.status === 200 && !isHtml(r.text) ? json(r.text) : null;
  if (r.status !== 200) return { verdict: "no", detail: `absent (HTTP ${r.status || r.error})` };
  if (!d) return { verdict: "no", detail: "present but not JSON" };
  const problems = []; const p = d.protocol || {};
  if (p.name !== "acp") problems.push(`protocol.name is ${JSON.stringify(p.name)}, not "acp"`);
  if (!isDate(p.version)) problems.push("protocol.version is not YYYY-MM-DD");
  if (!Array.isArray(p.supported_versions)) problems.push("protocol.supported_versions missing"); else if (p.version && !p.supported_versions.includes(p.version)) problems.push("supported_versions does not include version");
  let base = null; try { base = new URL(d.api_base_url); if (!/^https?:$/.test(base.protocol)) throw 0; } catch { problems.push("api_base_url is not an absolute http(s) URL"); }
  const transports = Array.isArray(d.transports) ? d.transports : []; if (!transports.length) problems.push("transports is empty or missing");
  for (const t of transports) if (!["rest", "mcp"].includes(t)) problems.push(`transport ${JSON.stringify(t)} is not rest or mcp`);
  const services = Array.isArray(d.capabilities?.services) ? d.capabilities.services : []; if (!services.length) problems.push("capabilities.services is empty or missing");
  for (const s of services) if (!["checkout", "orders", "delegate_payment", "carts"].includes(s)) problems.push(`service ${JSON.stringify(s)} is not in the closed enum`);
  const baseStatus = base ? await head(base.href) : null;
  const cc = r.headers.get("cache-control") || ""; const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] || 0);
  if (maxAge < 3600) problems.push(`cache-control ${cc || "(none)"}; the RFC asks for public, max-age>=3600`);
  return { verdict: problems.length ? "likely" : "yes", detail: `version ${p.version}; transports ${transports.join(", ") || "none"}; services ${services.join(", ") || "none"}; api_base_url answers ${baseStatus}${problems.length ? `; ${problems.length} problem(s)` : ""}`, version: p.version || null, transports, services, apiBaseUrl: d.api_base_url || null, apiBaseStatus: baseStatus, extensions: (d.capabilities?.extensions || []).map((e) => e.name), currencies: d.capabilities?.supported_currencies || null, problems, contentType: r.headers.get("content-type") };
}

async function readAp2(origin) {
  let r = await req(origin + "/.well-known/agent-card.json"); if (r.status !== 200) r = await req(origin + "/.well-known/agent.json");
  const d = r.status === 200 && !isHtml(r.text) ? json(r.text) : null;
  if (!d) return { verdict: "no", detail: r.status === 200 ? "agent card present but not JSON" : "no A2A agent card, so nothing can declare AP2 (agent-identity builds the card)" };
  const exts = Array.isArray(d.capabilities?.extensions) ? d.capabilities.extensions : [];
  const ap2 = exts.filter((e) => AP2_URI.test(String(e.uri || "")));
  const others = exts.filter((e) => !AP2_URI.test(String(e.uri || ""))).map((e) => e.uri);
  if (!ap2.length) return { verdict: "no", detail: `agent card "${d.name || "(unnamed)"}" declares ${exts.length} extension${exts.length === 1 ? "" : "s"}, none of them AP2`, card: d.name || null, otherExtensions: others };
  return { verdict: "yes", detail: `agent card declares ${ap2[0].uri}${ap2[0].required ? " (required)" : ""}`, card: d.name || null, uri: ap2[0].uri, required: Boolean(ap2[0].required), otherExtensions: others };
}

// Candidate paths for the 402 knock: what the origin itself advertises, then the conventional ones.
async function candidatePaths(origin, openapi) {
  const paths = new Set(["/", "/api", "/api/v1", "/llms-full.txt", ...extraPaths]);
  const cat = await req(origin + "/.well-known/api-catalog", { accept: "application/linkset+json, application/json;q=0.9" }); const ls = cat.status === 200 ? json(cat.text) : null;
  for (const l of ls?.linkset || []) if (l.anchor && sameOrigin(l.anchor, origin)) { try { paths.add(new URL(l.anchor, origin).pathname); } catch {} }
  for (const [p, ops] of Object.entries(openapi?.paths || {})) { const o = Object.values(ops || {}).find((x) => x && typeof x === "object"); if (ops && (Object.values(ops).some((x) => x && x["x-payment-info"]) || Object.values(ops).some((x) => x?.responses?.["402"]))) paths.add(p.replace(/\{[^}]+\}/g, "1")); else if (o && paths.size < 12) paths.add(p.replace(/\{[^}]+\}/g, "1")); }
  return [...paths].slice(0, 16);
}

async function readOpenapi(origin) {
  for (const p of ["/openapi.json", "/.well-known/openapi.json", "/openapi.yaml"]) { const r = await req(origin + p, { accept: "application/json, application/yaml;q=0.8, */*;q=0.1" }); if (r.status === 200 && !isHtml(r.text)) { const d = json(r.text); if (d && (d.openapi || d.swagger)) return { path: p, doc: d }; if (/^openapi:/m.test(r.text)) return { path: p, doc: null, yaml: true }; } }
  return null;
}

async function knock402(origin, paths, openapi) {
  const rows = await Promise.all(paths.map(async (p) => {
    const ops = openapi?.doc?.paths?.[p] || {}; const method = ops.get ? "GET" : ops.post ? "POST" : "GET";
    const r = await req(origin + p, { method, accept: "application/json, */*;q=0.5", body: method === "POST" ? "{}" : undefined, headers: method === "POST" ? { "content-type": "application/json" } : {} });
    return { path: p, method, status: r.status || r.error, dialects: classify402(r.status, r.headers, r.text), note: r.headers.get("x-payment-note") || null };
  }));
  return rows;
}

function readMppDiscovery(openapi) {
  if (!openapi) return { advertised: [], problems: ["no /openapi.json (MPP discovery is an OpenAPI 3.1 document with x-payment-info on paid operations)"] };
  if (openapi.yaml) return { advertised: [], problems: [`${openapi.path} is YAML; this probe reads JSON only, and mppx emits JSON`] };
  const advertised = []; const problems = []; const shapes = new Set(); const alsoX402 = new Set();
  for (const [p, ops] of Object.entries(openapi.doc.paths || {})) for (const [m, op] of Object.entries(ops || {})) {
    const info = op && op["x-payment-info"]; if (!info) continue;
    // Three shapes in the wild: canonical offers[], the flat single-offer shorthand, and a multi-protocol form ({price, protocols:[{x402},{mpp:{...}}]}) that some x402+MPP sellers emit. The third is read for what it says and flagged, since a canonical MPP client will not parse it.
    let offers; let shape = "offers";
    if (Array.isArray(info.offers)) { offers = info.offers; if (["amount", "currency", "intent", "method"].some((k) => k in info)) problems.push(`${m.toUpperCase()} ${p}: offers[] cannot be combined with the flat fields`); }
    else if (Array.isArray(info.protocols)) { shape = "protocols"; offers = info.protocols.filter((x) => x && x.mpp).map((x) => ({ ...x.mpp, amount: x.mpp.amount ?? info.price?.amount ?? null, currency: x.mpp.currency ?? info.price?.currency })); if (info.protocols.some((x) => x && "x402" in x)) alsoX402.add(`${m.toUpperCase()} ${p}`); if (!offers.length) continue; }
    else { shape = "flat"; offers = [info]; }
    if (shape !== "offers") shapes.add(shape);
    for (const o of offers) { const bad = []; if (!["charge", "session"].includes(o.intent)) bad.push("intent"); if (typeof o.method !== "string") bad.push("method"); if (!("amount" in o)) bad.push("amount"); if (typeof o.currency !== "string") bad.push("currency"); if (bad.length) problems.push(`${m.toUpperCase()} ${p}: offer missing or malformed ${bad.join(", ")}`); }
    advertised.push({ method: m.toUpperCase(), path: p, offers: offers.map((o) => ({ intent: o.intent, method: o.method, amount: o.amount, currency: o.currency })) });
  }
  if (shapes.has("protocols")) problems.unshift(`x-payment-info uses the multi-protocol {price, protocols[]} shape on ${advertised.length} operation(s) rather than offers[]; a canonical MPP discovery client reads none of them`);
  if (shapes.has("flat")) problems.unshift("x-payment-info uses the flat single-offer shorthand; new documents should write offers[]");
  return { advertised, problems, serviceInfo: openapi.doc["x-service-info"] || null, shapes: [...shapes], alsoX402: [...alsoX402] };
}

// Commerce signals: is there anything here to buy? Bounded and cheap; a signal is evidence, never a verdict on its own.
async function commerceSignals(origin, home) {
  const s = new Set(); const h = home.headers; const t = home.text.slice(0, 400000);
  if (h.get("x-shopify-stage") || h.get("x-shopid") || h.get("x-sorting-hat-shopid") || /cdn\.shopify\.com|Shopify\.theme/.test(t)) s.add("platform:shopify");
  if (/wp-content\/plugins\/woocommerce|woocommerce/i.test(t)) s.add("platform:woocommerce");
  if (/bigcommerce\.com|cdn11\.bigcommerce/i.test(t) || h.get("x-bc-storefront")) s.add("platform:bigcommerce");
  if (/Magento|mage\/cookies|static\/frontend\/Magento/i.test(t)) s.add("platform:magento");
  if (/squarespace-commerce|sqs-cart|commerce\.squarespace/i.test(t)) s.add("platform:squarespace");
  if (/"@type"\s*:\s*"(Product|Offer|AggregateOffer|ProductGroup)"/.test(t)) s.add("schema:product");
  if (/priceCurrency|"price"\s*:/.test(t)) s.add("schema:price");
  if (/href="\/?(cart|checkout|basket)\b/i.test(t) || /add[-_ ]to[-_ ]cart/i.test(t)) s.add("html:cart");
  if (/apple-pay|ApplePaySession/i.test(t)) s.add("payment:apple-pay"); if (/paypal/i.test(t)) s.add("payment:paypal"); if (/js\.stripe\.com|stripe\.js/i.test(t)) s.add("payment:stripe"); if (/pay\.google\.com|google-pay/i.test(t)) s.add("payment:google-pay");
  const [apple, products, wc] = await Promise.all([head(origin + "/.well-known/apple-developer-merchantid-domain-association"), req(origin + "/products.json"), req(origin + "/wp-json/wc/store/v1/products")]);
  if (apple === 200) s.add("file:apple-pay-merchant-association");
  if (products.status === 200 && json(products.text)?.products) s.add("api:shopify-products.json");
  if (wc.status === 200 && Array.isArray(json(wc.text))) s.add("api:woocommerce-store");
  const strong = [...s].filter((x) => /^(platform|api|file):/.test(x)).length; const soft = s.size - strong;
  return { signals: [...s], verdict: strong ? "yes" : soft >= 2 ? "likely" : soft ? "maybe" : "no" };
}

async function scan(origin) {
  const [home, ghost, openapi] = await Promise.all([req(origin + "/", { accept: "text/html, */*;q=0.5" }), req(`${origin}/.well-known/commerce-ghost-${Date.now().toString(36)}`), readOpenapi(origin)]);
  const catchAll = ghost.status === 200 && isHtml(ghost.text);
  const [commerce, ucp, acp, ap2, paths] = await Promise.all([commerceSignals(origin, home), readUcp(origin), readAcp(origin), readAp2(origin), candidatePaths(origin, openapi?.doc)]);
  const knocks = await knock402(origin, paths, openapi);
  const rowsFor = (proto) => knocks.filter((k) => k.dialects.some((d) => d.protocol === proto)).map((k) => ({ ...k, dialect: k.dialects.find((d) => d.protocol === proto) }));
  const x402Rows = rowsFor("x402"); const mppRows = rowsFor("mpp"); const ppc = rowsFor("pay-per-crawl"); const odd = rowsFor("unknown-402");
  const dormant = knocks.filter((k) => k.note);
  const mppDisc = readMppDiscovery(openapi);
  // Discovery is advisory and the Challenge is authoritative (mpp.dev/advanced/discovery), so an advertised price whose route answers 200 without payment is a document describing a gate that is not there.
  const advertisedButOpen = mppDisc.advertised.filter((a) => { const k = knocks.find((r) => r.path === a.path.replace(/\{[^}]+\}/g, "1")); return k && k.status === 200; }).map((a) => `${a.method} ${a.path}`);
  const x402 = x402Rows.length ? { verdict: "yes", detail: `${x402Rows.length} route${x402Rows.length === 1 ? "" : "s"} answer 402 in x402 v${x402Rows[0].dialect.version} (${x402Rows[0].dialect.carrier}): ${x402Rows.map((r) => r.path).join(", ")}`, routes: x402Rows.map((r) => ({ path: r.path, version: r.dialect.version, accepts: r.dialect.accepts })) }
    : dormant.length ? { verdict: "maybe", detail: `${dormant[0].path} carries x-payment-note "${dormant[0].note}": a gate exists and is not configured`, routes: [] }
    : { verdict: "no", detail: `no 402 in an x402 dialect on ${knocks.length} candidate route${knocks.length === 1 ? "" : "s"}`, routes: [] };
  const mpp = mppRows.length || mppDisc.advertised.length ? { verdict: mppRows.length ? "yes" : "likely", detail: `${mppRows.length} route${mppRows.length === 1 ? "" : "s"} challenge with WWW-Authenticate: Payment${mppDisc.advertised.length ? `; ${openapi.path} advertises ${mppDisc.advertised.length} paid operation${mppDisc.advertised.length === 1 ? "" : "s"}` : "; no discovery document"}${advertisedButOpen.length ? `; ${advertisedButOpen.length} advertised route(s) answer 200 without payment` : ""}${mppDisc.problems.length ? `; ${mppDisc.problems.length} discovery problem(s)` : ""}`, challenges: mppRows.map((r) => ({ path: r.path, ...r.dialect })), advertised: mppDisc.advertised, advertisedButOpen, problems: mppDisc.problems, serviceInfo: mppDisc.serviceInfo }
    : { verdict: "no", detail: `no Payment challenge and no x-payment-info in ${openapi ? openapi.path : "an openapi.json (absent)"}`, challenges: [], advertised: [], problems: mppDisc.problems };
  // A seller of API calls has no cart and no product schema; an open x402 or MPP door is itself the commerce signal.
  if (x402.verdict === "yes") commerce.signals.push("protocol:x402"); if (mpp.verdict === "yes") commerce.signals.push("protocol:mpp"); if (ucp.verdict !== "no") commerce.signals.push("protocol:ucp"); if (acp.verdict !== "no") commerce.signals.push("protocol:acp");
  if (commerce.signals.some((x) => x.startsWith("protocol:"))) commerce.verdict = "yes";
  const out = { origin, probe: UA, controls: { ghost: catchAll ? "FAIL: a well-known path that cannot exist answered 200 HTML; only JSON that parses is counted" : `pass: an absent well-known path answers ${ghost.status || ghost.error}` }, commerce, doors: { ucp, acp, x402, mpp, ap2 }, knocked: knocks.map((k) => ({ path: k.path, method: k.method, status: k.status, dialects: k.dialects.map((d) => d.protocol) })), payPerCrawl: ppc.map((r) => ({ path: r.path, price: r.dialect.price })), unknown402: odd.map((r) => r.path), openapi: openapi ? openapi.path : null };
  const open = Object.values(out.doors).filter((d) => d.verdict === "yes").length; out.open = open; out.of = 5;
  return out;
}

function print(out) {
  console.log(`${out.origin}\n`);
  console.log(`  control     ${out.controls.ghost}`);
  console.log(`  commerce    ${out.commerce.verdict}${out.commerce.signals.length ? `: ${out.commerce.signals.join(", ")}` : " (no platform, catalog, cart or payment signal on the homepage)"}\n`);
  for (const [name, d] of Object.entries(out.doors)) { console.log(`  ${name.padEnd(6)} ${d.verdict.padEnd(7)} ${d.detail}`); const ps = [...new Set(d.problems || [])]; for (const p of ps.slice(0, 6)) console.log(`                 ! ${p}`); if (ps.length > 6) console.log(`                 ! ... and ${ps.length - 6} more (--json lists them)`); }
  console.log(`\n  knocked     ${out.knocked.map((k) => `${k.path} ${k.status}${k.dialects.length ? ` ${k.dialects.join("+")}` : ""}`).join("; ")}`);
  if (out.payPerCrawl.length) console.log(`  pay-per-crawl  ${out.payPerCrawl.map((p) => `${p.path} (${p.price || "no price named"})`).join(", ")}: the EDGE is charging crawlers; that is not a merchant door`);
  if (out.unknown402.length) console.log(`  unknown 402 ${out.unknown402.join(", ")}: a 402 in no dialect this probe reads; go look`);
  console.log(`\n  ${out.open} of ${out.of} commerce doors open${out.open === 0 && out.commerce.verdict === "no" ? " (nothing here sells; read the zero as not applicable)" : ""}`);
}

// ── the control: a fixture origin that speaks every dialect, so the instrument is shown to read each one ──
async function control() {
  const ucpDoc = { ucp: { version: "2026-08-25", services: { "dev.ucp.shopping": [{ version: "2026-08-25", spec: "https://ucp.dev/2026-08-25/specification/overview/", transport: "rest", endpoint: "http://127.0.0.1/ucp/v1", schema: "https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json" }] }, capabilities: { "dev.ucp.shopping.checkout": [{ version: "2026-08-25", spec: "https://ucp.dev/x", schema: "https://ucp.dev/2026-08-25/services/shopping/checkout.json" }] }, payment_handlers: {} } };
  const acpDoc = { protocol: { name: "acp", version: "2025-09-29", supported_versions: ["2025-09-29"] }, api_base_url: "http://127.0.0.1/api", transports: ["rest"], capabilities: { services: ["checkout"] } };
  const card = { name: "Fixture Merchant", capabilities: { extensions: [{ uri: "https://github.com/google-agentic-commerce/ap2/v1", description: "AP2", required: true }] } };
  const openapi = { openapi: "3.1.0", info: { title: "fixture", version: "1" }, paths: { "/v1/report": { get: { "x-payment-info": { offers: [{ amount: "100", currency: "usd", intent: "charge", method: "stripe", description: "report" }] }, responses: { 402: { description: "pay" } } } } } };
  const v2 = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", payTo: "0x0", asset: "0x1" }] })).toString("base64");
  const srv = createServer((rq, rs) => {
    const p = rq.url.split("?")[0]; const j = (o, s = 200, h = {}) => { rs.writeHead(s, { "content-type": "application/json", ...h }); rs.end(JSON.stringify(o)); };
    if (p === "/") { rs.writeHead(200, { "content-type": "text/html" }); rs.end('<!doctype html><script src="https://cdn.shopify.com/x.js"></script><a href="/cart">cart</a>'); }
    else if (p === "/.well-known/ucp") j(ucpDoc); else if (p === "/.well-known/acp.json") j(acpDoc, 200, { "cache-control": "public, max-age=3600" });
    else if (p === "/.well-known/agent-card.json") j(card); else if (p === "/openapi.json") j(openapi);
    else if (p === "/x402v1") j({ x402Version: 1, accepts: [{ scheme: "exact", network: "base", maxAmountRequired: "10000", payTo: "0x0", asset: "0x1" }] }, 402);
    else if (p === "/x402v2") { rs.writeHead(402, { "payment-required": v2, "content-type": "application/json" }); rs.end("{}"); }
    else if (p === "/v1/report") { rs.writeHead(402, { "www-authenticate": 'Payment id="abc", realm="fixture", method="stripe", intent="charge", request="eyJhbW91bnQiOiIxMDAiLCJjdXJyZW5jeSI6InVzZCJ9"' }); rs.end(); }
    else if (p === "/crawl") { rs.writeHead(402, { "crawler-price": "USD 0.01" }); rs.end(); }
    else { rs.writeHead(404); rs.end(); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const origin = `http://127.0.0.1:${srv.address().port}`;
  extraPaths.push("/x402v1", "/x402v2", "/crawl");
  const out = await scan(origin); srv.close();
  const expect = { "x402 v1 body read": out.doors.x402.routes.some((r) => r.path === "/x402v1" && r.version === 1), "x402 v2 header read": out.doors.x402.routes.some((r) => r.path === "/x402v2" && r.version === 2 && r.accepts[0]?.network === "eip155:8453"),
    "MPP challenge read": out.doors.mpp.challenges.some((c) => c.path === "/v1/report" && c.method === "stripe" && c.amount === "100"), "MPP discovery read": out.doors.mpp.advertised.length === 1 && out.doors.mpp.problems.length === 0,
    "pay-per-crawl told apart": out.payPerCrawl.some((p) => p.path === "/crawl"), "UCP read": out.doors.ucp.verdict !== "no" && out.doors.ucp.capabilities.includes("dev.ucp.shopping.checkout"), "ACP read": out.doors.acp.verdict === "yes",
    "AP2 read": out.doors.ap2.verdict === "yes", "commerce signals read": out.commerce.signals.includes("platform:shopify"), "ghost control passes": out.controls.ghost.startsWith("pass") };
  const failed = Object.entries(expect).filter(([, ok]) => !ok).map(([k]) => k);
  if (JSON_OUT) { console.log(JSON.stringify({ fixture: origin, expect, failed }, null, 2)); } else { for (const [k, ok] of Object.entries(expect)) console.log(`  ${ok ? "pass" : "FAIL"}  ${k}`); console.log(failed.length ? `\n  ${failed.length} classifier(s) cannot read their dialect; do not trust a "no" from this probe until they pass` : "\n  every dialect is read; a \"no\" from this probe is a measurement"); }
  process.exit(failed.length ? 1 : 0);
}

if (args.includes("--control")) control().catch((e) => { console.error(e); process.exit(1); });
else if (!target) { console.error("usage: commerce.mjs <origin> [--paths /a,/b] [--json] | --control"); process.exit(2); }
else scan(new URL(target).origin).then((out) => (JSON_OUT ? console.log(JSON.stringify(out, null, 2)) : print(out))).catch((e) => { console.error(e); process.exit(1); });
