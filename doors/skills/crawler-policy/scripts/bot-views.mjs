#!/usr/bin/env node
// bot-views.mjs — what your site actually hands each crawler, with the two
// controls that make the table readable.
//
//   node bot-views.mjs https://example.com            fetch / as 10 identities, read robots.txt, ai.txt, tdmrep
//   node bot-views.mjs https://example.com/blog/x     a specific path (robots rules are per path)
//   node bot-views.mjs <url> --json
//
// A crawler row answering 403 has two explanations that look identical from one
// sample: the origin refuses that NAME, or it refuses THIS INSTRUMENT (our
// address, our TLS fingerprint, our missing cookie) and would refuse anything.
// So two identities here are controls, a browser and curl. If neither gets in,
// every bot row is uninterpretable and the verdict says so instead of reporting
// a confident "blocks all AI crawlers". ONE control getting in is enough:
// linkedin.com answers 999 to curl unconditionally while serving Chrome fine.
// Controls are displayed and never scored. Zero dependencies.
import { fileURLToPath } from "node:url";
const UA_SELF = "doors-crawler-policy/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: bot-views.mjs <url> [--json]"); process.exit(2); }
const url = new URL(target); const origin = url.origin; const path = url.pathname + url.search;

// The roster the reference site's /lens uses. `role` is what the operator of the
// bot does with the page; robots.txt does not govern a browser, so controls read n/a there.
export const IDENTITIES = [
  { key: "Chrome", role: "control", owner: "a browser", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" },
  { key: "curl", role: "control", owner: "a plain HTTP client", ua: "curl/8.7.1" },
  { key: "Googlebot", role: "search", owner: "Google", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { key: "GPTBot", role: "train", owner: "OpenAI", ua: "GPTBot/1.0" },
  { key: "ClaudeBot", role: "train", owner: "Anthropic", ua: "ClaudeBot/1.0" },
  { key: "CCBot", role: "train", owner: "Common Crawl", ua: "CCBot/2.0" },
  { key: "Google-Extended", role: "train", owner: "Google", ua: "Google-Extended" },
  { key: "PerplexityBot", role: "answers", owner: "Perplexity", ua: "PerplexityBot/1.0" },
  { key: "ChatGPT-User", role: "answers", owner: "OpenAI", ua: "ChatGPT-User/1.0" },
  { key: "Claude-User", role: "answers", owner: "Anthropic", ua: "Claude-User/1.0" },
];

async function get(u, headers, { text = true } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers });
    const body = text ? await res.text() : ""; return { status: res.status, body, headers: res.headers }; }
  catch (e) { return { status: 0, body: "", headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}

// robots.txt, read the way the reference site reads it: groups of user-agent
// lines, longest matching agent token wins, then longest matching path rule,
// Allow beating Disallow at equal length, an empty Disallow being no rule at all.
export function parseRobots(txt) {
  const groups = [], sitemaps = []; let cur = null, inAgents = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
    if (key === "user-agent") { if (!inAgents) { cur = { agents: [], rules: [], signal: null }; groups.push(cur); } cur.agents.push(val.toLowerCase()); inAgents = true; continue; }
    inAgents = false;
    if (key === "sitemap") { sitemaps.push(val); continue; }
    if (!cur) continue;
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", pattern: val });
    else if (key === "content-signal") cur.signal = val;
  }
  return { groups, sitemaps };
}
const pathMatch = (pattern, p) => { const anchored = pattern.endsWith("$"); const body = anchored ? pattern.slice(0, -1) : pattern;
  const rx = "^" + body.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "");
  try { return new RegExp(rx).test(p); } catch { return p.startsWith(body.split("*")[0]); } };
export function robotsVerdict(parsed, botToken, p) {
  const token = botToken.toLowerCase(); let bestUa = null;
  for (const g of parsed.groups) for (const ua of g.agents) if (ua !== "*" && token.startsWith(ua) && (bestUa === null || ua.length > bestUa.length)) bestUa = ua;
  const matched = bestUa ?? (parsed.groups.some((g) => g.agents.includes("*")) ? "*" : null);
  if (matched === null) return { verdict: "allow", matchedUa: null, rule: null, signal: null };
  const chosen = parsed.groups.filter((g) => g.agents.includes(matched)); let best = null;
  for (const g of chosen) for (const r of g.rules) { if (!r.pattern || !pathMatch(r.pattern, p)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow && !best.allow)) best = r; }
  return { verdict: best && !best.allow ? "block" : "allow", matchedUa: matched, rule: best ? (best.allow ? "Allow: " : "Disallow: ") + best.pattern : null, signal: chosen.map((g) => g.signal).find(Boolean) || null };
}

async function main() {
  const [robotsRes, aiTxt, tdmrep] = await Promise.all([
    get(origin + "/robots.txt", { "user-agent": UA_SELF }),
    get(origin + "/ai.txt", { "user-agent": UA_SELF }),
    get(origin + "/.well-known/tdmrep.json", { "user-agent": UA_SELF, accept: "application/json" }),
  ]);
  const robots = robotsRes.status === 200 ? parseRobots(robotsRes.body) : null;
  const rows = await Promise.all(IDENTITIES.map(async (id) => {
    const r = await get(origin + path, { "user-agent": id.ua, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7", "accept-language": "en-US,en;q=0.9" });
    const rb = id.role === "control" ? { verdict: "n/a", rule: null, signal: null } : robots ? robotsVerdict(robots, id.key, path) : { verdict: "no robots.txt", rule: null, signal: null };
    return { ...id, status: r.status, bytes: Buffer.byteLength(r.body), xRobots: r.headers.get("x-robots-tag"), robots: rb, error: r.error };
  }));
  const controls = rows.filter((r) => r.role === "control"), bots = rows.filter((r) => r.role !== "control");
  const admitted = controls.filter((r) => r.status >= 200 && r.status < 300);
  const served = bots.filter((r) => r.status >= 200 && r.status < 300);
  const out = {
    target: origin + path,
    robots: robots ? { groups: robots.groups.length, sitemaps: robots.sitemaps.length, contentSignal: robots.groups.some((g) => g.signal) } : { status: robotsRes.status },
    aiTxt: aiTxt.status === 200 && !/<html/i.test(aiTxt.body.slice(0, 500)) ? "present" : "absent",
    tdmrep: (() => { if (tdmrep.status !== 200) return { verdict: "absent" }; try { const j = JSON.parse(tdmrep.body); const n = Array.isArray(j) ? j.length : 0;
      return { verdict: n ? `present, ${n} location rule${n === 1 ? "" : "s"}` : "present but not an array of rules", reserved: Array.isArray(j) ? j.filter((x) => x["tdm-reservation"] === 1).length : null }; } catch { return { verdict: "present but not JSON" }; } })(),
    rows,
    instrument: admitted.length ? `${admitted.map((r) => r.key).join(" and ")} got in, so the bot rows measure policy` : "NO control was admitted: the origin refuses this instrument, and every bot row below says nothing about crawler policy",
    sampledBots: admitted.length ? `${served.length} of ${bots.length} bot identities served a 2xx` : null,
    verdict: null,
  };
  const blockedByRobots = bots.filter((r) => r.robots.verdict === "block"), blockedOnWire = admitted.length ? bots.filter((r) => r.status >= 400 || r.status === 0) : [];
  const disagree = bots.filter((r) => r.robots.verdict === "allow" && r.status >= 400 && admitted.length);
  out.verdict = !admitted.length ? "unmeasurable" : `robots.txt blocks ${blockedByRobots.length} of ${bots.length} on this path; the wire refused ${blockedOnWire.length}${disagree.length ? `; ${disagree.length} allowed by robots yet refused on the wire (${disagree.map((r) => r.key).join(", ")}), which is a policy expressed only in the server, invisible to a bot that reads robots first` : ""}`;
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${out.target}\n`);
  console.log(`  instrument     ${out.instrument}`);
  console.log(`  robots.txt     ${robots ? `${out.robots.groups} groups, ${out.robots.sitemaps} sitemap lines${out.robots.contentSignal ? ", Content-Signal present" : ""}` : `status ${robotsRes.status}`}`);
  console.log(`  ai.txt         ${out.aiTxt}`);
  console.log(`  tdmrep.json    ${out.tdmrep.verdict}${out.tdmrep.reserved != null ? `, ${out.tdmrep.reserved} reserved` : ""}\n`);
  const pad = (s, n) => String(s ?? "").padEnd(n);
  console.log(`  ${pad("identity", 17)}${pad("role", 9)}${pad("wire", 7)}${pad("bytes", 8)}${pad("robots", 8)}rule`);
  for (const r of rows) console.log(`  ${pad(r.key, 17)}${pad(r.role, 9)}${pad(r.status || r.error?.slice(0, 5) || "ERR", 7)}${pad(r.bytes, 8)}${pad(r.robots.verdict, 8)}${r.robots.rule ?? ""}${r.xRobots ? `  X-Robots-Tag: ${r.xRobots}` : ""}`);
  console.log(`\n  sampled bots   ${out.sampledBots ?? "null (no control admitted)"}`);
  console.log(`  verdict        ${out.verdict}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
