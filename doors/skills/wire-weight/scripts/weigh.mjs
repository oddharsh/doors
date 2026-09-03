#!/usr/bin/env node
// weigh.mjs — what a page costs on the wire and who is paying for the
// compression, plus the delivery tricks that only show in headers.
//
//   node weigh.mjs https://example.com/some/page
//   node weigh.mjs <url> --json
//
// It speaks HTTP/2 itself so it can SEE a 103 Early Hints block, which fetch()
// swallows: node's http2 client emits informational header blocks as a
// `headers` event before the response. It reads the body as raw wire bytes,
// decodes them, and recompresses the decoded bytes locally at brotli q11 and q4,
// because those two numbers name who compressed: an origin that ships
// precompressed twins lands within a percent of q11, and an edge compressing on
// the fly lands at q4, about 12 to 24 percent larger for byte-identical content
// (measured on the reference site before it shipped twins). Then the
// content-hashed assets: one is fetched for its immutability, and a sibling that
// cannot exist is fetched as the control, since a 404 that inherits a one-year
// cache is how a stale HTML page's broken asset becomes permanent. Zero deps.
import http2 from "node:http2";
import https from "node:https";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
const UA = "doors-wire-weight/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: weigh.mjs <url> [--json]"); process.exit(2); }
const url = new URL(target);

// Raw GET over h2, falling back to h1 (which cannot show a 103 and says so).
function rawGet(u, extra = {}) {
  return new Promise((resolve) => {
    const out = { status: 0, headers: {}, early: [], body: Buffer.alloc(0), h2: true };
    let client; const done = (o) => { try { client?.close(); } catch {} resolve(o); };
    try { client = http2.connect(u.origin, { timeout: 10000 }); } catch (e) { return h1Get(u, extra).then(resolve); }
    client.on("error", () => h1Get(u, extra).then(resolve));
    client.on("timeout", () => done({ ...out, error: "timeout" }));
    const req = client.request({ ":method": "GET", ":path": u.pathname + u.search, "user-agent": UA, accept: "text/html,*/*;q=0.8", "accept-encoding": "br, gzip, zstd", ...extra });
    const chunks = [];
    req.on("headers", (h) => out.early.push(h));               // 1xx blocks land here
    req.on("response", (h) => { out.status = Number(h[":status"]); for (const [k, v] of Object.entries(h)) if (!k.startsWith(":")) out.headers[k] = Array.isArray(v) ? v.join(", ") : String(v); });
    req.on("data", (c) => chunks.push(c)); req.on("end", () => done({ ...out, body: Buffer.concat(chunks) })); req.on("error", (e) => done({ ...out, error: e.message }));
    req.end();
  });
}
function h1Get(u, extra = {}) {
  return new Promise((resolve) => {
    const req = https.request(u, { method: "GET", headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8", "accept-encoding": "br, gzip, zstd", ...extra }, timeout: 10000 }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, early: [], body: Buffer.concat(chunks), h2: false }));
    });
    req.on("error", (e) => resolve({ status: 0, headers: {}, early: [], body: Buffer.alloc(0), h2: false, error: e.message })); req.on("timeout", () => req.destroy(new Error("timeout"))); req.end();
  });
}
const decode = (body, enc) => { try { if (/\bbr\b/.test(enc)) return zlib.brotliDecompressSync(body); if (/gzip/.test(enc)) return zlib.gunzipSync(body); if (/zstd/.test(enc)) return zlib.zstdDecompressSync(body); return body; } catch { return null; } };
const br = (buf, quality) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
const maxAge = (cc) => Number((/max-age=(\d+)/i.exec(cc || "") || [])[1] ?? -1);

async function main() {
  const page = await rawGet(url);
  if (!page.status) { console.error(`could not fetch ${url}: ${page.error}`); process.exit(1); }
  const enc = page.headers["content-encoding"] || "identity";
  const decoded = decode(page.body, enc);
  const out = { url: url.href, http2: page.h2, status: page.status, encoding: enc, wireBytes: page.body.length, decodedBytes: decoded?.length ?? null, compression: {}, earlyHints: {}, csp: {}, speculation: {}, assets: {} };
  // who compressed
  if (!decoded) out.compression.verdict = `body did not decode as ${enc}`;
  else if (enc === "identity") out.compression.verdict = `not compressed at all: ${page.body.length} B on the wire; brotli q11 would be ${br(decoded, 11)} B`;
  else if (!/\bbr\b/.test(enc)) out.compression.verdict = `${enc} on the wire (${page.body.length} B); brotli q11 of the same bytes is ${br(decoded, 11)} B`;
  else { const q11 = br(decoded, 11), q4 = br(decoded, 4); const w = page.body.length; const near = (a, b) => Math.abs(a - b) / b <= 0.02;
    out.compression = { q11, q4, verdict: near(w, q11) ? `origin precompressed: wire ${w} B matches brotli q11 (${q11} B); edge q4 would have been ${q4} B` : near(w, q4) ? `edge compressing on the fly: wire ${w} B matches brotli q4 (${q4} B); a q11 twin would be ${q11} B, ${((1 - q11 / w) * 100).toFixed(1)}% less` : `wire ${w} B is neither q11 (${q11}) nor q4 (${q4}) within 2%: a different encoder or level` }; }
  // Early Hints: a 103 seen on the wire, or at least the Link the edge would replay
  const link = page.headers.link || ""; const preloads = (link.match(/<[^>]+>[^,]*rel=("?)preload\1/gi) || []).length;
  const e103 = page.early.find((h) => Number(h[":status"]) === 103);
  out.earlyHints = { seen103: Boolean(e103), preloadLinksOn200: preloads, hints: e103 ? String(e103.link || "").split(",").map((s) => s.trim()).filter(Boolean) : [],
    verdict: e103 ? `103 received over h2 with ${String(e103.link || "").split(",").filter(Boolean).length} hint${preloads ? "" : " (the 200 carries no preload Link of its own)"}` : preloads ? `no 103 on this connection; the 200 carries ${preloads} preload Link${preloads === 1 ? "" : "s"} an edge could replay${page.h2 ? "" : " (h1 fallback: a 103 cannot be seen here)"}` : "no 103 and no preload Link on the 200" };
  // CSP
  const csp = page.headers["content-security-policy"] || ""; const scriptSrc = (/(?:^|;)\s*script-src([^;]*)/i.exec(csp) || [])[1] || "";
  out.csp = { present: Boolean(csp), scriptSrc: scriptSrc.trim() || null, hashes: (scriptSrc.match(/'sha(?:256|384|512)-/g) || []).length, nonce: /'nonce-/.test(scriptSrc), unsafeInline: /'unsafe-inline'/.test(scriptSrc), reportOnly: Boolean(page.headers["content-security-policy-report-only"]) };
  out.csp.verdict = !csp ? "no Content-Security-Policy" : !scriptSrc ? "CSP present but no script-src" : out.csp.unsafeInline ? `script-src allows 'unsafe-inline'${out.csp.hashes ? ` alongside ${out.csp.hashes} hashes, which a hash-aware browser ignores in favour of the hashes` : ""}` : `script-src by ${out.csp.hashes ? `${out.csp.hashes} hash${out.csp.hashes === 1 ? "" : "es"}` : ""}${out.csp.nonce ? (out.csp.hashes ? " + nonce" : "nonce") : ""}${!out.csp.hashes && !out.csp.nonce ? "sources only" : ""}, no unsafe-inline`;
  const html = decoded ? decoded.toString("utf8") : "";
  // speculation rules
  const spec = attrs(html, /<script[^>]*\btype\s*=\s*(?:"speculationrules"|'speculationrules'|speculationrules)[^>]*>([\s\S]*?)<\/script>/gi);
  out.speculation = { blocks: spec.length, prerender: spec.some((s) => /"prerender"/.test(s)), prefetch: spec.some((s) => /"prefetch"/.test(s)), eagerness: [...new Set(spec.flatMap((s) => (s.match(/"eagerness"\s*:\s*"(\w+)"/g) || []).map((m) => m.replace(/.*"(\w+)"$/, "$1"))))] };
  out.speculation.verdict = spec.length ? `${spec.length} block${spec.length === 1 ? "" : "s"}: ${[out.speculation.prerender && "prerender", out.speculation.prefetch && "prefetch"].filter(Boolean).join(" + ")}${out.speculation.eagerness.length ? `, eagerness ${out.speculation.eagerness.join("/")}` : ""}` : "no speculation rules";
  // content-hashed assets + the 404 control
  const refs = attrs(html, /(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/gi).filter((h) => /\.[0-9a-f]{8,}\.(?:css|js|mjs)(?:\?|$)/i.test(h) && !/^https?:\/\/(?!${url.host})/.test(h));
  if (!refs.length) out.assets.verdict = "no content-hashed CSS or JS referenced (nothing here can be immutable)";
  else { const first = new URL(refs[0], url); const a = await rawGet(first, { accept: "*/*" });
    const cc = a.headers["cache-control"] || ""; const immutable = /immutable/i.test(cc) && maxAge(cc) >= 31536000;
    // The ghost keeps the SAME hash length and character class as the real ref,
    // because a clamp is usually keyed on the exact shape the site emits: the
    // reference site clamps /a/<name>.<8 hex>.<ext> and hands anything else to
    // the asset layer, whose one-year rule then decorates the 404. A ten-digit
    // ghost tested that layer and reported a clamp gap the site does not have.
    const ghost = new URL(first.href.replace(/\.([0-9a-f]{8,})\./i, (_, h) => "." + h.replace(/[0-9a-f]/g, (c) => (c === "e" ? "f" : "e")) + ".")); const g = await rawGet(ghost, { accept: "*/*" });
    const gcc = g.headers["cache-control"] || ""; const clamped = g.status === 404 && (/no-store|no-cache/i.test(gcc) || maxAge(gcc) <= 300);
    out.assets = { hashedRefs: refs.length, sample: first.pathname, sampleCacheControl: cc || null, immutable, control: { path: ghost.pathname, status: g.status, cacheControl: gcc || null, clamped },
      verdict: `${refs.length} hashed asset ref${refs.length === 1 ? "" : "s"}; sample ${immutable ? "is immutable for a year" : `is NOT immutable (${cc || "no cache-control"})`}; a hashed path that cannot exist answered ${g.status}${g.status === 404 ? (clamped ? " with a short or no-store cache, so a miss cannot be cached as if it were bytes" : ` with "${gcc}", which lets a 404 inherit the immutable rule`) : g.status === 200 ? " with 200, so the hash is decorative" : ""}` }; }
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${url.href}  (HTTP ${out.status}, ${out.http2 ? "h2" : "h1"}, ${enc})\n`);
  console.log(`  compression    ${out.compression.verdict}`);
  console.log(`  early hints    ${out.earlyHints.verdict}`); for (const h of out.earlyHints.hints.slice(0, 4)) console.log(`                 ${h}`);
  console.log(`  csp            ${out.csp.verdict}`);
  console.log(`  speculation    ${out.speculation.verdict}`);
  console.log(`  hashed assets  ${out.assets.verdict}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
