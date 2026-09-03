#!/usr/bin/env node
// identity.mjs — the three places a site says who it is to agents, and who its
// own crawler is to everyone else: the Web Bot Auth key directory, the agent
// card, and the DNS-AID service records.
//
//   node identity.mjs https://example.com
//   node identity.mjs https://example.com --json
//
// Presence is the cheap half. The directory check computes each key's RFC 7638
// thumbprint and compares it with the `kid` the key carries, because the Web
// Bot Auth draft binds `keyid` in a signature to that thumbprint: a directory
// whose kids are arbitrary strings passes every existence check and fails the
// first real verifier. DNS goes through DNS-over-HTTPS with the DO bit set, so
// the resolver's AD flag says whether the answer was DNSSEC-validated, and a
// NXDOMAIN control on a name that cannot exist proves the resolver path can say
// no. Zero dependencies.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const UA = "doors-agent-identity/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: identity.mjs <origin> [--json]"); process.exit(2); }
const origin = new URL(target).origin; const host = new URL(origin).hostname;

async function get(u, accept = "application/json, */*;q=0.5") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } });
    return { status: res.status, text: await res.text(), headers: res.headers, url: res.url }; }
  catch (e) { return { status: 0, text: "", headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const b64u = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// RFC 7638: hash the JSON of the REQUIRED members only, in lexicographic order, no whitespace.
export function thumbprint(jwk) {
  const req = { OKP: ["crv", "kty", "x"], EC: ["crv", "kty", "x", "y"], RSA: ["e", "kty", "n"], oct: ["k", "kty"] }[jwk.kty];
  if (!req || req.some((k) => jwk[k] == null)) return null;
  const canon = "{" + req.map((k) => JSON.stringify(k) + ":" + JSON.stringify(jwk[k])).join(",") + "}";
  return b64u(createHash("sha256").update(canon).digest());
}
async function doh(name, type) {
  const r = await get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}&do=1`, "application/dns-json");
  const d = json(r.text); if (!d) return { error: r.error || `resolver answered ${r.status}` };
  return { status: d.Status, ad: Boolean(d.AD), answers: (d.Answer || []).filter((a) => a.type === 64 || a.type === 65).map((a) => a.data) };
}

async function main() {
  const [dir, card, idx, a2a, mcp, ctl] = await Promise.all([
    get(origin + "/.well-known/http-message-signatures-directory"),
    get(origin + "/.well-known/agent-card.json"),
    doh(`_index._agents.${host}`, "SVCB"), doh(`_a2a._agents.${host}`, "SVCB"), doh(`_mcp._agents.${host}`, "SVCB"),
    doh(`_index._agents.this-name-cannot-exist-${Date.now()}.example`, "SVCB"),
  ]);
  const out = { origin, directory: {}, card: {}, dns: {}, control: {} };

  // Web Bot Auth directory
  const d = dir.status === 200 ? json(dir.text) : null;
  if (dir.status !== 200) out.directory = { verdict: `absent (HTTP ${dir.status || dir.error})` };
  else if (!d || !Array.isArray(d.keys)) out.directory = { verdict: "present but not a JWK Set (no `keys` array)" };
  else {
    const keys = d.keys.map((k) => { const tp = thumbprint(k); return { kty: k.kty, crv: k.crv || null, alg: k.alg || null, use: k.use || null, kid: k.kid || null, thumbprint: tp, kidIsThumbprint: tp !== null && k.kid === tp }; });
    const bad = keys.filter((k) => !k.kidIsThumbprint);
    out.directory = {
      verdict: keys.length === 0 ? "present but empty" : bad.length === 0 ? `${keys.length} key${keys.length === 1 ? "" : "s"}, every kid is its RFC 7638 thumbprint` : `${keys.length} key${keys.length === 1 ? "" : "s"}, ${bad.length} whose kid is NOT its thumbprint (a verifier keyed on keyid will not find them)`,
      contentType: dir.headers.get("content-type"), cacheControl: dir.headers.get("cache-control"),
      signed: Boolean(dir.headers.get("signature") && dir.headers.get("signature-input")), keys,
    };
  }
  // Agent card
  const c = card.status === 200 ? json(card.text) : null;
  if (card.status !== 200) out.card = { verdict: `absent (HTTP ${card.status || card.error})` };
  else if (!c) out.card = { verdict: "present but not JSON" };
  else {
    const ifaces = c.supportedInterfaces || c.additionalInterfaces || (c.url ? [{ url: c.url }] : []);
    const reach = await Promise.all(ifaces.slice(0, 4).map(async (i) => { const r = await get(i.url, "application/json, text/event-stream"); return { url: i.url, protocol: i.protocolBinding || i.protocol || i.transport || null, status: r.status }; }));
    out.card = { verdict: `present: ${c.name || "(unnamed)"}, ${ifaces.length} interface${ifaces.length === 1 ? "" : "s"}, ${Array.isArray(c.skills) ? c.skills.length : 0} skills`, provider: c.provider?.organization || c.provider?.name || null, interfaces: reach,
      unreachable: reach.filter((r) => r.status === 0 || r.status === 404).map((r) => r.url) };
  }
  // DNS-AID
  const rec = (r) => r.error ? `resolver error: ${r.error}` : r.status === 3 ? "NXDOMAIN" : r.status !== 0 ? `rcode ${r.status}` : r.answers.length ? `${r.answers.join(" | ")}${r.ad ? "  (DNSSEC validated)" : "  (NOT DNSSEC validated)"}` : "NOERROR but no SVCB answer";
  out.dns = { index: rec(idx), a2a: rec(a2a), mcp: rec(mcp) };
  const published = [idx, a2a, mcp].filter((r) => !r.error && r.answers.length).length;
  out.dns.verdict = published ? `${published} of 3 _agents records published${idx.ad ? ", validated" : ""}` : "no _agents SVCB records";
  // Dangling pointer check: an _a2a or _mcp record that names a host whose door 404s is worse than none.
  out.dns.danglingWarning = (a2a.answers?.length && !(c && JSON.stringify(c).includes("a2a"))) ? "_a2a is published but the agent card names no A2A interface; check the door exists" : null;
  out.control = { nxdomain: ctl.status === 3 ? "pass: the resolver says NXDOMAIN for a name that cannot exist" : `FAIL: control answered rcode ${ctl.status ?? ctl.error}, so the DNS tier above cannot be trusted` };

  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${origin}\n`);
  console.log(`  key directory  ${out.directory.verdict}`);
  if (out.directory.keys) { for (const k of out.directory.keys) console.log(`                 ${k.kty}/${k.crv || k.alg}  kid=${k.kid}  ${k.kidIsThumbprint ? "= thumbprint" : `thumbprint would be ${k.thumbprint}`}`);
    console.log(`                 content-type ${out.directory.contentType}; ${out.directory.signed ? "response is signed" : "response carries no Signature of its own"}`); }
  console.log(`  agent card     ${out.card.verdict}${out.card.provider ? ` (${out.card.provider})` : ""}`);
  for (const i of out.card.interfaces || []) console.log(`                 ${i.url}  ${i.status === 0 ? "unreachable" : `HTTP ${i.status}`}${i.status === 404 ? "  <- the card points at a door that is not there" : ""}`);
  console.log(`  DNS-AID        ${out.dns.verdict}`);
  for (const k of ["index", "a2a", "mcp"]) console.log(`                 _${k}._agents  ${out.dns[k]}`);
  if (out.dns.danglingWarning) console.log(`                 ! ${out.dns.danglingWarning}`);
  console.log(`  control        ${out.control.nxdomain}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
