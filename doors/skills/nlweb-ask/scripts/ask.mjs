#!/usr/bin/env node
// ask.mjs — walk through the /ask door and grade the answer against the NLWeb
// result contract, per field.
//
//   node ask.mjs https://example.com                       asks "what is this site about"
//   node ask.mjs https://example.com --q "coffee booking"  your own question
//   node ask.mjs <origin> --json
//
// A knock on /ask with no query only learns a status code, and a 46-site survey
// promoted four of six origins to agent-native on an /ask that answered 410, 412,
// 429 or 401. This sends ONE real question in the cheapest mode (`mode=list`,
// pinned explicitly, since `generate` is somebody's model call), reads the
// non-streaming JSON, and reports which of the six per-result fields each result
// carries. `schema_object` is the one that makes an answer machine-usable rather
// than a link with prose attached, and a server can score full marks on prose
// and ship none. It then opens the default streaming form once to name the
// framing, and knocks bare once to classify the refusal, because a conforming
// server MUST refuse a missing query and the shape of that refusal is the most
// identifying response the door can give. Three requests. Zero dependencies.
import { fileURLToPath } from "node:url";
const UA = "doors-nlweb-ask/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const q = args.includes("--q") ? args[args.indexOf("--q") + 1] : "what is this site about";
if (!target) { console.error("usage: ask.mjs <origin> [--q question] [--json]"); process.exit(2); }
const origin = new URL(target).origin;
export const FIELDS = ["url", "name", "site", "score", "description", "schema_object"];

async function get(u, accept) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } });
    return { status: res.status, type: res.headers.get("content-type") || "", text: await res.text() }; }
  catch (e) { return { status: 0, type: "", text: "", error: e.message }; } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

// Bare knock, classified the way the reference site's probe classifies it after
// it was caught grading a real NLWeb server as absent: a refusal that NAMES the
// missing parameter, or a stream, is a server that speaks the protocol; a bot
// wall never names a parameter it has no concept of, and never streams.
export function classifyKnock(r) {
  if (r.status === 0) return { verdict: "absent", why: r.error };
  if (/text\/event-stream/i.test(r.type)) return { verdict: "likely", why: `bare knock answered ${r.status} text/event-stream, which is the protocol's streaming default` };
  const j = json(r.text);
  if (j && typeof j === "object" && (j.parameter === "query" || /\bquery\b/i.test(String(j.error || j.message || "")))) return { verdict: "likely", why: `${r.status} refusing a missing query by name` };
  if ([410, 412, 429, 401, 403].includes(r.status)) return { verdict: "absent", why: `${r.status} with no parameter named: a wall refusing the request, not a server refusing a query` };
  if (r.status === 200 && j && Array.isArray(j.results)) return { verdict: "likely", why: "200 with a results array even for an empty query" };
  return { verdict: "absent", why: `${r.status} ${r.type.split(";")[0] || "(no content-type)"}` };
}

async function main() {
  const [listed, streamed, knock] = await Promise.all([
    get(`${origin}/ask?query=${encodeURIComponent(q)}&streaming=0&mode=list`, "application/json"),
    get(`${origin}/ask?query=${encodeURIComponent(q)}&mode=list`, "text/event-stream, application/json"),
    get(`${origin}/ask`, "application/json, text/event-stream"),
  ]);
  const out = { origin, question: q, knock: classifyKnock(knock), list: {}, stream: {} };
  const j = listed.status === 200 ? json(listed.text) : null;
  if (!j) out.list = { verdict: `no JSON answer to the non-streaming form (HTTP ${listed.status || listed.error}, ${listed.type.split(";")[0] || "no content-type"})` };
  else {
    const results = Array.isArray(j.results) ? j.results : Array.isArray(j) ? j : [];
    const coverage = Object.fromEntries(FIELDS.map((f) => [f, results.filter((r) => r && r[f] != null && r[f] !== "").length]));
    const typed = results.filter((r) => r?.schema_object && typeof r.schema_object === "object" && (r.schema_object["@type"] || r.schema_object.type)).length;
    const scores = results.map((r) => Number(r?.score)).filter((n) => Number.isFinite(n));
    out.list = { results: results.length, coverage, schemaTyped: typed, scoreRange: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
      mode: j.mode ?? j._meta?.mode ?? null, version: j._meta?.version ?? j.version ?? null, extractive: j._meta?.description ?? null,
      verdict: results.length === 0 ? "answered with zero results (a real server, or a query it could not match; try --q)" : `${results.length} results; ${typed} carry a typed schema_object; ${FIELDS.filter((f) => coverage[f] === results.length).length} of 6 fields present on every result` };
  }
  // framing and dialect of the streaming default
  if (streamed.status !== 200) out.stream = { verdict: `streaming form answered ${streamed.status || streamed.error}` };
  else if (!/text\/event-stream/i.test(streamed.type)) out.stream = { verdict: `streaming default did NOT stream: ${streamed.type.split(";")[0]} (the spec's default is streaming=true)` };
  else { const named = /^event:\s*\S+/m.test(streamed.text); const legacy = /"message_type"/.test(streamed.text);
    out.stream = { framing: "SSE", dialect: named ? "named events (v0.55: start/result/complete)" : legacy ? "legacy unnamed frames carrying message_type" : "SSE of unknown shape", events: (streamed.text.match(/^event:\s*(\S+)/gm) || []).map((l) => l.replace(/^event:\s*/, "")).filter((v, i, a) => a.indexOf(v) === i), verdict: null };
    out.stream.verdict = `${out.stream.framing}, ${out.stream.dialect}`; }
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${origin}/ask   q="${q}"\n`);
  console.log(`  bare knock     ${out.knock.verdict}: ${out.knock.why}`);
  console.log(`  list mode      ${out.list.verdict}`);
  if (out.list.coverage) { for (const f of FIELDS) console.log(`                 ${f.padEnd(14)} ${out.list.coverage[f]} of ${out.list.results}${f === "schema_object" ? `  (${out.list.schemaTyped} with @type)` : ""}`);
    if (out.list.scoreRange) console.log(`                 score range    ${out.list.scoreRange[0]} to ${out.list.scoreRange[1]}${out.list.scoreRange[1] > 100 ? "  (not 0-100: is it normalised against what the query could score?)" : ""}`);
    if (out.list.extractive) console.log(`                 descriptions   ${out.list.extractive}`); }
  console.log(`  streaming      ${out.stream.verdict}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
