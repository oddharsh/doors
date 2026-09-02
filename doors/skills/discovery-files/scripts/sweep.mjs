#!/usr/bin/env node
// sweep.mjs — does every path a site ADVERTISES to agents actually answer?
// Reads /llms.txt, every per-section llms.txt it links, and /sitemap.xml
// (following a sitemap index), then fetches each same-origin URL once.
//
//   node sweep.mjs https://example.com          table
//   node sweep.mjs https://example.com --json
//
// A discovery file is a promise. The reference site's rule is that it never
// advertises a door it does not serve (it publishes _index._agents in DNS and
// deliberately not _a2a, because there is no A2A server behind it). This script
// is that rule applied to the two files most crawlers read first.
const UA = "doors-sweep/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: sweep.mjs <origin> [--json]"); process.exit(2); }
const origin = new URL(target).origin;
const TIMEOUT = 8000, LIMIT = 300;
async function get(url, method = "GET") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try { const res = await fetch(url, { method, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA } });
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim(); const body = method === "GET" ? await res.text() : "";
    return { status: res.status, ct, body, location: res.headers.get("location") }; }
  catch (e) { return { status: 0, ct: "", body: "", error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}
const same = (u) => { try { const x = new URL(u, origin); return x.origin === origin ? x.href : null; } catch { return null; } };
const advertised = new Map(); // url -> [sources]
const note = (url, src) => { const u = same(url); if (!u) return; if (!advertised.has(u)) advertised.set(u, []); advertised.get(u).push(src); };

// llms.txt: markdown links, plus bare URLs and root-relative paths on their own line
const llms = await get(origin + "/llms.txt");
const llmsFiles = [];
if (llms.status === 200 && !/html/i.test(llms.ct)) {
  llmsFiles.push("/llms.txt");
  for (const m of llms.body.matchAll(/\]\(([^)\s]+)\)/g)) note(m[1], "/llms.txt");
  for (const m of llms.body.matchAll(/^(https?:\/\/\S+|\/\S+)\s*$/gm)) note(m[1], "/llms.txt");
  // per-section llms.txt the root one points at
  for (const [u] of [...advertised]) if (/\/llms\.txt$/.test(u) && u !== origin + "/llms.txt") {
    const s = await get(u); if (s.status === 200 && !/html/i.test(s.ct)) { llmsFiles.push(new URL(u).pathname); for (const m of s.body.matchAll(/\]\(([^)\s]+)\)/g)) note(m[1], new URL(u).pathname); }
  }
}
// sitemap.xml, one level of index
const sm = await get(origin + "/sitemap.xml"); let sitemapUrls = 0;
if (sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.body)) {
  const locs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  if (/<sitemapindex/i.test(sm.body)) { for (const child of locs.slice(0, 20)) { const c = await get(child); for (const m of c.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) { note(m[1], "sitemap"); sitemapUrls++; } } }
  else for (const l of locs) { note(l, "sitemap"); sitemapUrls++; }
}
const robots = await get(origin + "/robots.txt");
const urls = [...advertised.keys()].slice(0, LIMIT);
const results = [];
for (let i = 0; i < urls.length; i += 8) {
  const batch = urls.slice(i, i + 8);
  const rs = await Promise.all(batch.map((u) => get(u, "HEAD")));
  rs.forEach((r, j) => results.push({ url: batch[j], status: r.status || r.error, redirect: r.location || null, sources: advertised.get(batch[j]) }));
}
// An endpoint that wants input answers a bare HEAD with 400/405/415/422. That is
// the door being there and asking for a key, which is not a broken promise:
// llms.txt is allowed to advertise /mcp and /ask. Broken is a path the origin
// does not have (404, 410, 451), cannot serve (5xx), or does not answer at all.
const isEndpoint = (r) => typeof r.status === "number" && [400, 405, 415, 422].includes(r.status);
const bad = results.filter((r) => typeof r.status !== "number" || (r.status >= 400 && !isEndpoint(r)));
const endpoints = results.filter(isEndpoint);
const redirected = results.filter((r) => typeof r.status === "number" && r.status >= 300 && r.status < 400);
const out = { origin, llms: llms.status === 200 && !/html/i.test(llms.ct) ? { files: llmsFiles } : null, sitemap: sm.status === 200 ? { urls: sitemapUrls } : null, robots: robots.status === 200 ? "present" : "absent", advertised: results.length, truncated: advertised.size > LIMIT, broken: bad, endpoints, redirected };
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`discovery sweep: ${origin}\n`);
  console.log(`  llms.txt     ${out.llms ? `${llmsFiles.length} file(s): ${llmsFiles.join(", ")}` : "absent or HTML"}`);
  console.log(`  sitemap.xml  ${out.sitemap ? `${sitemapUrls} URL(s)` : "absent or not a sitemap"}`);
  console.log(`  robots.txt   ${out.robots}`);
  console.log(`\n  ${results.length} advertised same-origin URL(s) checked${out.truncated ? ` (first ${LIMIT})` : ""}: ${results.length - bad.length - redirected.length - endpoints.length} answer, ${endpoints.length} endpoint(s) wanting input, ${redirected.length} redirect, ${bad.length} broken`);
  for (const r of endpoints) console.log(`    endpoint ${r.status}  ${r.url}   (answers, wants a query or a POST)`);
  for (const r of bad) console.log(`    BROKEN  ${r.status}  ${r.url}   <- ${[...new Set(r.sources)].join(", ")}`);
  for (const r of redirected.slice(0, 10)) console.log(`    redirect ${r.status} ${r.url} -> ${r.redirect}`);
  if (redirected.length > 10) console.log(`    ... ${redirected.length - 10} more redirects`);
  if (bad.length) console.log(`\n  A broken advertised path is a promise the site made to every crawler that read the file. Fix the path or drop the line.`);
}
process.exit(bad.length ? 1 : 0);
