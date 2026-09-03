#!/usr/bin/env node
// dcz-check.mjs — is shared-dictionary delivery actually live on this page, and
// would a browser register the dictionary at all?
//
//   node dcz-check.mjs https://example.com/some/page
//   node dcz-check.mjs https://example.com --json
//
// Node 24+ (zstd with a dictionary honoured; 23 and below accept the option and
// silently ignore it, which is one of the traps this exists to catch). It:
//   1. reads the page's dictionary OFFERS: a Link rel=compression-dictionary
//      to a site-wide dictionary, and/or Use-As-Dictionary on the page itself;
//   2. checks whether Chromium would REGISTER what it offers, from cache-control
//      (`no-cache` and `must-revalidate` each veto the offer outright);
//   3. fetches the dictionary, hashes it, and asks for the page again carrying
//      Available-Dictionary, expecting dcz (or dcb) back;
//   4. decodes the delta against the dictionary and compares to the plain body;
//   5. CONTROL: offers a wrong hash and expects plain compression back, because
//      a server that answers dcz to any hash is not matching dictionaries.
import { createHash } from "node:crypto";
import { zstdDecompressSync } from "node:zlib";
const UA = "doors-dcz/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: dcz-check.mjs <url> [--json]"); process.exit(2); }
const url = new URL(target); const origin = url.origin;
async function raw(u, headers = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, ...headers } });
    return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()), enc: (res.headers.get("content-encoding") || "").toLowerCase() }; }
  catch (e) { return { status: 0, headers: new Headers(), body: Buffer.alloc(0), enc: "", error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}
const parseUAD = (h) => { const o = {}; for (const m of (h || "").matchAll(/([a-z-]+)\s*=\s*("([^"]*)"|[^,\s]+)/gi)) o[m[1].toLowerCase()] = m[3] ?? m[2]; return o; };
const registrable = (cc) => { const c = (cc || "").toLowerCase(); const vetoes = ["no-store", "no-cache", "must-revalidate"].filter((v) => c.includes(v)); return { ok: !vetoes.length && (/max-age=\s*[1-9]/.test(c) || /stale-while-revalidate/.test(c)), vetoes, cc: cc || "(none)" }; };
const out = { url: url.href, offers: {}, register: {}, delta: null, control: null, notes: [] };

// 1. the page, as a browser that speaks dcz would first fetch it
const page = await raw(url.href, { accept: "text/html", "accept-encoding": "dcz, dcb, br, gzip" });
if (page.error || page.status !== 200) { out.notes.push(`page: HTTP ${page.status || page.error}`); finish(); }
const link = page.headers.get("link") || "";
const famMatch = link.split(",").map((p) => p.trim()).find((p) => /rel\s*=\s*"?compression-dictionary/i.test(p));
const famUrl = famMatch ? new URL((famMatch.match(/<([^>]+)>/) || [])[1], origin).href : null;
const selfOffer = page.headers.get("use-as-dictionary");
out.offers = { sitewide: famUrl, self: selfOffer ? parseUAD(selfOffer) : null };
out.register.page = registrable(page.headers.get("cache-control"));
if (!famUrl && !selfOffer) { out.notes.push("no dictionary offer on this page: no Link rel=compression-dictionary and no Use-As-Dictionary"); finish(); }

// 2. the dictionary bytes and their own registrability
let dictUrl = famUrl || url.href;
const dict = await raw(dictUrl, { "accept-encoding": "br, gzip" });
if (dict.error || dict.status !== 200) { out.notes.push(`dictionary ${dictUrl}: HTTP ${dict.status || dict.error}`); finish(); }
const dictOffer = parseUAD(dict.headers.get("use-as-dictionary"));
out.register.dictionary = { ...registrable(dict.headers.get("cache-control")), offer: dictOffer, url: dictUrl };
if (!dict.headers.get("use-as-dictionary")) out.notes.push("the dictionary response carries no Use-As-Dictionary header, so a browser stores it as a plain resource and never offers it back");
if (dictOffer["match-dest"] === undefined) out.notes.push("Use-As-Dictionary has no match-dest; RFC 9842 defaults that to EVERY destination, so the browser will offer this dictionary on fetches you cannot answer with a delta");
const hash = createHash("sha256").update(dict.body).digest();
const avail = `:${hash.toString("base64")}:`;

// 3. the delta, with the right hash
const d = await raw(url.href, { accept: "text/html", "accept-encoding": "dcz, dcb, br, gzip", "available-dictionary": avail, "dictionary-id": dictOffer.id ? `"${dictOffer.id}"` : undefined });
if (d.enc === "dcz" || d.enc === "dcb") {
  let decoded = null, verdict = "delta served";
  if (d.enc === "dcz") {
    // A dcz body is a zstd SKIPPABLE frame first (magic 0x184D2A5E little-endian,
    // a 4-byte LE length of 32, then the dictionary's SHA-256) and the compressed
    // frame after it. RFC 9842 puts the hash there so a decoder can refuse the
    // wrong dictionary. Node's zstdDecompressSync stops after the first frame
    // rather than continuing, so it "decodes" the skippable one to zero bytes
    // and reports no error; the frame has to be stepped over by hand. Its hash
    // is also checked against the dictionary we offered, which is the one
    // assertion a plain decode cannot make.
    let body = d.body, frameHash = null;
    if (body.length >= 8 && body.readUInt32LE(0) === 0x184d2a5e) {
      const len = body.readUInt32LE(4);
      frameHash = body.subarray(8, 8 + len);
      body = body.subarray(8 + len);
    }
    try { decoded = zstdDecompressSync(body, { dictionary: dict.body }); }
    catch (e) { verdict = `dcz served but did not decode against the dictionary: ${e.message}`; }
    if (frameHash && !frameHash.equals(hash)) verdict = `the dcz frame names a different dictionary (${frameHash.toString("hex").slice(0, 12)}...) than the one offered (${hash.toString("hex").slice(0, 12)}...)`;
    if (!frameHash) out.notes.push("no skippable frame in front of the dcz body; RFC 9842 requires the dictionary hash there");
  }
  const plain = page.body;
  out.delta = { encoding: d.enc, bytes: d.body.length, plainBytes: plain.length, ratio: plain.length ? +(plain.length / d.body.length).toFixed(1) : null, roundTrip: verdict !== "delta served" ? verdict : decoded ? (decoded.equals(plain) ? "byte-identical to the plain page" : `decoded ${decoded.length} B, plain ${plain.length} B, NOT identical`) : (d.enc === "dcb" ? "dcb not decoded here (node has brotli dictionaries from 26; skipped)" : verdict) };
} else out.delta = { encoding: d.enc || "identity", bytes: d.body.length, verdict: "no delta: the server answered plain compression to a matching Available-Dictionary" };

// 5. control: a wrong hash must NOT get a delta
const wrong = `:${createHash("sha256").update("not the dictionary").digest("base64")}:`;
const c = await raw(url.href, { accept: "text/html", "accept-encoding": "dcz, dcb, br, gzip", "available-dictionary": wrong });
out.control = { encoding: c.enc || "identity", pass: c.enc !== "dcz" && c.enc !== "dcb", detail: c.enc === "dcz" || c.enc === "dcb" ? "a delta came back for a hash of nothing: the server is not matching dictionaries and the client will fail to decode" : `plain ${c.enc || "identity"} for an unknown hash, as it must` };
finish();

function finish() {
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
  console.log(`shared-dictionary check: ${out.url}\n`);
  console.log(`  offer, site-wide   ${out.offers.sitewide || "none"}`);
  console.log(`  offer, self        ${out.offers.self ? JSON.stringify(out.offers.self) : "none"}`);
  if (out.register.page) console.log(`  page cache-control ${out.register.page.ok ? "registrable" : "NOT registrable"}  ${out.register.page.cc}${out.register.page.vetoes.length ? `  (vetoed by ${out.register.page.vetoes.join(", ")})` : ""}`);
  if (out.register.dictionary) console.log(`  dict cache-control ${out.register.dictionary.ok ? "registrable" : "NOT registrable"}  ${out.register.dictionary.cc}${out.register.dictionary.vetoes.length ? `  (vetoed by ${out.register.dictionary.vetoes.join(", ")})` : ""}\n  dict offer         ${JSON.stringify(out.register.dictionary.offer)}`);
  if (out.delta) console.log(`  delta              ${out.delta.encoding} ${out.delta.bytes ?? ""}${out.delta.ratio ? ` B, ${out.delta.ratio}x under the plain ${out.delta.plainBytes} B` : ""}  ${out.delta.roundTrip || out.delta.verdict || ""}`);
  if (out.control) console.log(`  control            ${out.control.pass ? "pass" : "FAIL"}  ${out.control.detail}`);
  for (const n of out.notes) console.log(`  note               ${n}`);
  process.exit(out.control && !out.control.pass ? 1 : 0);
}
