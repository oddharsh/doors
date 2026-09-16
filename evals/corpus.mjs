#!/usr/bin/env node
// corpus.mjs — run the probes over the live origins in corpus.json and print one
// table per probe; with --expect, compare each row against its recorded
// expectation and exit 1 on drift.
//
//   node evals/corpus.mjs                       every probe, every origin (about a minute)
//   node evals/corpus.mjs --only commerce
//   node evals/corpus.mjs --expect               the regression form
//
// The corpus is a set of real sites chosen because each one taught the probes
// something (the `teaches` field says what). It is fixtures with a pulse: a row
// that drifts is the site changing or the probe regressing, and the table shows
// which by naming the detail beside the verdict.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const args = process.argv.slice(2); const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null; const EXPECT = args.includes("--expect");
const SCRIPT = { commerce: "../doors/skills/agent-commerce/scripts/commerce.mjs", auth: "../doors/skills/agent-auth/scripts/auth.mjs", skills: "../doors/skills/skills-index/scripts/verify.mjs" };

const run = (script, origin) => new Promise((resolve) => execFile(process.execPath, [join(here, script), origin, "--json"], { maxBuffer: 16 << 20, timeout: 180000 }, (err, stdout) => { try { resolve(JSON.parse(stdout)); } catch { resolve({ error: err ? err.message.split("\n")[0] : "no JSON" }); } }));
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; };
const short = (o) => o.replace(/^https:\/\/(www\.)?/, "");
const okIn = (got, want) => (Array.isArray(want) ? want.includes(got) : got === want);

// One flat view per probe, so expectations are a few words and the table is one line per origin.
const VIEW = {
  commerce: (d) => d.error ? { error: d.error } : { measurable: d.measurable !== false, sells: d.commerce?.verdict, ucp: d.doors?.ucp?.verdict, acp: d.doors?.acp?.verdict, x402: d.doors?.x402?.verdict, mpp: d.doors?.mpp?.verdict, ap2: d.doors?.ap2?.verdict, note: d.measurable === false ? d.doors.ucp.detail : d.knocking || "" },
  auth: (d) => d.error ? { error: d.error } : { chain: d.chain?.length ?? null, prmAt: d.protectedResource?.at || null, challenge401: d.challenge?.status === 401, issuerNote: Boolean(d.authorizationServer?.issuerNote), asAbsent: /^absent/.test(d.authorizationServer?.verdict || ""), authMdMarkers: d.authMd?.markers ? Object.values(d.authMd.markers).filter(Boolean).length : 0, note: (d.chain || [])[0] || d.authorizationServer?.verdict || "" },
  skills: (d) => d.error ? { error: d.error } : { absent: /^absent/.test(d.index?.verdict || ""), skills: d.skills?.length ?? 0, verified: d.index?.verified ?? 0, ghost: d.controls?.ghost?.startsWith("pass") ? "pass" : "fail", note: d.index?.verdict || "" },
};
const COLS = { commerce: ["measurable", "sells", "ucp", "acp", "x402", "mpp", "ap2"], auth: ["chain", "prmAt", "challenge401", "issuerNote", "authMdMarkers"], skills: ["skills", "verified", "ghost", "absent"] };

let drift = 0;
for (const probe of Object.keys(SCRIPT)) {
  if (only && only !== probe) continue;
  const rows = corpus[probe]; const results = await pool(rows, 6, (r) => run(SCRIPT[probe], r.origin));
  console.log(`\n${probe}\n  ${"origin".padEnd(26)} ${COLS[probe].map((c) => c.padEnd(c === "prmAt" ? 40 : 9)).join(" ")} ${EXPECT ? "expect " : ""}note`);
  rows.forEach((r, i) => {
    const v = VIEW[probe](results[i]); const cells = COLS[probe].map((c) => String(v[c] ?? "").padEnd(c === "prmAt" ? 40 : 9)).join(" ");
    let verdict = "";
    if (EXPECT) { const bad = Object.entries(r.expect).filter(([k, want]) => !okIn(v[k], want)).map(([k, want]) => `${k}: got ${JSON.stringify(v[k])}, expected ${JSON.stringify(want)}`); if (bad.length) drift++; verdict = bad.length ? `DRIFT   ` : `ok      `; if (bad.length) v.note = bad.join("; "); }
    console.log(`  ${short(r.origin).padEnd(26)} ${cells} ${verdict}${String(v.error || v.note || "").slice(0, 90)}`);
  });
}
if (EXPECT) { console.log(drift ? `\n${drift} row(s) drifted; read the note on each before deciding whether the site or the probe moved` : "\nevery row matches its recorded expectation"); process.exit(drift ? 1 : 0); }
