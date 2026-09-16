#!/usr/bin/env node
// verify.mjs — the Agent Skills discovery index at /.well-known/agent-skills/index.json,
// read the way the RFC says a client MUST read it: fetch every artifact and
// compare its SHA-256 with the digest the index promised.
//
//   node verify.mjs https://example.com
//   node verify.mjs https://example.com --json
//
// A scanner that counts entries grades the index; an agent that follows it
// grades the artifacts, and the RFC (cloudflare/agent-skills-discovery-rfc,
// v0.2.0 s"Integrity and Verification") says a mismatch MUST NOT be used. So the
// digest is the door, and the index is the sign on it. Two controls: a
// well-known path that cannot exist must not answer 200 (an SPA catch-all
// mints "present" for everything), and the comparator is run once on bytes it
// is handed with one flipped, to show it can say no. Zero dependencies.
import { createHash } from "node:crypto";
const UA = "doors-skills-index/0.1 (+https://github.com/oddharsh/doors)";
const SCHEMA_020 = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: verify.mjs <origin> [--json]"); process.exit(2); }
const origin = new URL(target).origin;

async function get(u, accept = "application/json, */*;q=0.5") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } });
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers, url: res.url }; }
  catch (e) { return { status: 0, bytes: Buffer.alloc(0), headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}
const sha = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");
const isHtml = (b) => /^\s*<(!doctype|html)/i.test(b.toString("utf8", 0, 300));
// SKILL.md carries YAML frontmatter with `name` and `description`; the index entry's description should be the same sentence.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return null;
  const fm = {}; for (const line of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line); if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, ""); }
  return fm;
}

async function main() {
  const indexUrl = origin + "/.well-known/agent-skills/index.json";
  const [idx, ghost] = await Promise.all([get(indexUrl), get(`${origin}/.well-known/agent-skills/ghost-${Date.now().toString(36)}/SKILL.md`, "text/markdown, */*;q=0.5")]);
  const out = { origin, index: {}, skills: [], controls: {} };
  const catchAll = ghost.status === 200;
  out.controls.ghost = catchAll ? "FAIL: a skill path that cannot exist answered 200; presence below is only counted where the digest verifies" : `pass: an absent skill path answers ${ghost.status || ghost.error}`;
  const probe = Buffer.from("doors control"); const flipped = Buffer.from(probe); flipped[0] ^= 1;
  out.controls.comparator = sha(probe) !== sha(flipped) && sha(probe) === sha(Buffer.from("doors control")) ? "pass: one flipped byte changes the digest; identical bytes agree" : "FAIL: the comparator cannot tell bytes apart";

  let doc = null; try { doc = JSON.parse(idx.bytes.toString("utf8")); } catch {}
  if (idx.status !== 200) { out.index = { verdict: `absent (HTTP ${idx.status || idx.error})` }; return finish(out); }
  if (!doc || isHtml(idx.bytes)) { out.index = { verdict: isHtml(idx.bytes) ? "present but HTML at the path (catch-all)" : "present but not JSON" }; return finish(out); }
  const schema = doc.$schema || null;
  const version = schema === SCHEMA_020 ? "0.2.0" : schema ? "unrecognised" : Array.isArray(doc.skills) && doc.skills.some((s) => s && s.files) ? "0.1.0 (no $schema, legacy files[])" : "0.1.0 (no $schema)";
  const entries = Array.isArray(doc.skills) ? doc.skills : [];
  out.index = { verdict: `present, ${entries.length} skill${entries.length === 1 ? "" : "s"}, schema ${version}`, schema, contentType: idx.headers.get("content-type"), cors: idx.headers.get("access-control-allow-origin"), cacheControl: idx.headers.get("cache-control") };
  if (version === "unrecognised") out.index.warning = `$schema ${schema} is not a known discovery schema; the RFC says a client SHOULD NOT process the index`;

  for (const e of entries.slice(0, 40)) {
    const row = { name: e?.name || null, type: e?.type || null, url: e?.url || null, digest: e?.digest || null, problems: [] };
    if (!e || typeof e !== "object") { row.problems.push("entry is not an object"); out.skills.push(row); continue; }
    if (!e.name) row.problems.push("no name");
    if (!e.description) row.problems.push("no description");
    if (e.type !== "skill-md" && e.type !== "archive") row.problems.push(`type must be skill-md or archive (got ${JSON.stringify(e.type)})`);
    if (!e.url) row.problems.push("no url");
    if (typeof e.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(e.digest)) row.problems.push("digest is not sha256:<64 lowercase hex>");
    if (e.url) {
      let u; try { u = new URL(e.url, indexUrl).href; } catch { row.problems.push("url does not resolve"); }
      if (u) {
        const art = await get(u, e.type === "archive" ? "application/octet-stream, */*;q=0.5" : "text/markdown, text/plain;q=0.9, */*;q=0.5");
        row.resolved = u; row.status = art.status || art.error; row.bytes = art.bytes.length;
        if (art.status !== 200) row.problems.push(`artifact answers HTTP ${art.status || art.error}`);
        else {
          const got = sha(art.bytes); row.computed = got; row.digestMatches = got === e.digest;
          if (!row.digestMatches) row.problems.push(`digest mismatch: index says ${String(e.digest).slice(0, 19)}..., bytes hash to ${got.slice(0, 19)}... (a client MUST NOT use it)`);
          if (e.type === "skill-md") {
            if (isHtml(art.bytes)) row.problems.push("artifact is HTML, not a SKILL.md");
            const fm = frontmatter(art.bytes.toString("utf8")); row.frontmatter = fm ? { name: fm.name || null, description: fm.description ? fm.description.slice(0, 80) : null } : null;
            if (!fm) row.problems.push("SKILL.md has no YAML frontmatter");
            else { if (fm.name && e.name && fm.name !== e.name) row.problems.push(`frontmatter name "${fm.name}" differs from index name "${e.name}"`); if (!fm.description) row.problems.push("frontmatter has no description"); }
          }
        }
      }
    }
    out.skills.push(row);
  }
  const digestBad = out.skills.filter((s) => s.digestMatches === false || s.status !== 200).length; const fmBad = out.skills.filter((s) => s.problems.some((p) => /frontmatter/.test(p))).length; const otherBad = out.skills.filter((s) => s.problems.length).length - fmBad;
  out.index.verified = out.skills.filter((s) => s.digestMatches).length;
  out.index.verdict += !entries.length ? "" : digestBad ? `; ${digestBad} artifact(s) missing or with a digest mismatch` : "; every digest verifies";
  if (fmBad) out.index.verdict += `; ${fmBad} without the frontmatter a loader needs`; else if (otherBad) out.index.verdict += `; ${otherBad} with problems`;
  finish(out);
}
function finish(out) {
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${out.origin}\n`);
  console.log(`  index      ${out.index.verdict}`);
  if (out.index.warning) console.log(`             ! ${out.index.warning}`);
  if (out.index.contentType) console.log(`             content-type ${out.index.contentType}; CORS ${out.index.cors || "(none)"}; cache-control ${out.index.cacheControl || "(none)"}`);
  for (const s of out.skills) {
    console.log(`  ${(s.problems.length ? "!" : "ok").padEnd(3)}${(s.name || "(unnamed)").padEnd(28)} ${s.type || "?"}  ${s.status ?? ""}${s.bytes != null ? ` ${s.bytes} B` : ""}${s.digestMatches ? "  digest verifies" : ""}`);
    for (const p of s.problems) console.log(`               ${p}`);
  }
  console.log(`\n  controls   ghost: ${out.controls.ghost}\n             comparator: ${out.controls.comparator}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
