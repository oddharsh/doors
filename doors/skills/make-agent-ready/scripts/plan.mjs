#!/usr/bin/env node
// plan.mjs: one build brief that makes a site score well on both agent-readiness
// scanners, isitagentready.com (Cloudflare's 0-5 ladder) and is-agentic.com
// (Vercel and Ora's 0-100), limited to what is relevant for the kind of site it
// is. The brief is Markdown written for a coding agent: rules, then the cards in
// the order that recovers the most, each with why, the steps, the commands that
// prove it, and the doors skill to load for the detail.
//
//   node plan.mjs --type content                        the whole plan for a new site of this type (no network)
//   node plan.mjs https://site.example --type content   probe the origin, plan only what is still open
//   node plan.mjs https://site.example                  infer the type from what the probes find
//   node plan.mjs --check                               every check on both scanners has a card; every card's skill exists
//   add --json for the structure instead of the brief
//
// Types: content (personal site, blog, docs read as prose), business, app (an
// API or developer platform), store. Aliases such as personal, api and shop work.
// Probe mode runs agent-score (which runs agent-readiness), so both scanners'
// checks are measured by doors' own probes, controls included. Zero dependencies.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { CARDS, TYPES, ALIASES, RULES, CF_RUNG, CF_RUNG_NEED, IA_ESSENTIAL, IA_CONDITIONAL, IA_POOL } from "./catalog.mjs";
const here = dirname(fileURLToPath(import.meta.url)); const PLUGIN = resolve(here, "../../.."); const SKILLS = join(PLUGIN, "skills");
const SCORE = join(SKILLS, "agent-score/scripts/score.mjs"); const LADDER = join(SKILLS, "agent-readiness/scripts/ladder.mjs");
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--type"); const JSON_OUT = args.includes("--json");
const typeArg = args.includes("--type") ? args[args.indexOf("--type") + 1] : null; const typeGiven = typeArg ? ALIASES[typeArg] || typeArg : null;
if (args.includes("--check")) process.exit(check());
if (typeGiven && !TYPES.includes(typeGiven)) { console.error(`unknown type ${typeArg}: one of ${TYPES.join(", ")} (or ${Object.keys(ALIASES).join(", ")})`); process.exit(2); }
if (!target && !typeGiven) { console.error("usage: plan.mjs [origin] [--type content|business|app|store] [--json] | plan.mjs --check"); process.exit(2); }

// <doors> stays a placeholder: the brief is usually pasted into another session, on another checkout.
const fill = (cmd, origin) => cmd.replaceAll("<plugin-root>", "<doors>").replaceAll("$ORIGIN", origin || "https://your.site");
const round1 = (x) => Math.round(x * 10) / 10;
// What a card is worth before anything is measured: its share of is-agentic's pools for this type, plus weight for every Cloudflare rung it unblocks (a lower rung blocks every level above it).
function estimate(card, type) { const pool = IA_POOL[type];
  const ia = card.ia.reduce((a, id) => a + (IA_CONDITIONAL.has(id) ? 0 : IA_ESSENTIAL.has(id) ? 80 / pool.E : 20 / pool.R), 0);
  const cf = card.cf.reduce((a, id) => a + (CF_RUNG[id] ? 12 - 2 * CF_RUNG[id] : 1), 0);
  return { ia: round1(ia), cf, value: ia + cf }; }

const run = (script, origin) => new Promise((ok) => execFile(process.execPath, [script, origin, "--json"], { maxBuffer: 64 << 20, timeout: 420000 }, (err, stdout) => { try { ok(JSON.parse(stdout)); } catch { ok({ error: err ? err.message.split("\n")[0] : "no JSON from " + script }); } }));

async function plan() {
  const origin = target ? new URL(target).origin : null;
  let probe = null, type = typeGiven, inferred = false, siteTypeTag = null;
  if (origin) {
    const [score, home] = await Promise.all([run(SCORE, origin), fetch(origin + "/", { headers: { "user-agent": "doors-make-agent-ready/0.1 (+https://github.com/oddharsh/doors)", accept: "text/html" } }).then((r) => r.text()).catch(() => "")]);
    if (score.error) { console.error(`agent-score did not run: ${score.error}`); process.exit(1); }
    probe = score; siteTypeTag = /<meta[^>]+name=["']is-agentic-site-type["'][^>]*content=["']([a-z]+)/i.exec(home)?.[1] || /<meta[^>]+content=["']([a-z]+)["'][^>]*name=["']is-agentic-site-type/i.exec(home)?.[1] || null;
    // The page's own declaration wins; then a storefront (a platform, a cart, a product catalog, a checkout protocol); then API evidence; a priced API with no cart is an app.
    const storefront = (score.ladder?.signals || []).some((s) => /^(platform:|html:cart|path:\/cart|protocol:(ucp|acp)|api:(shopify|woocommerce))/i.test(s));
    if (!type) { inferred = true; type = TYPES.includes(siteTypeTag) ? siteTypeTag : storefront ? "store" : score.gates?.dev ? "app" : ["yes", "likely"].includes(score.ladder?.sells) ? "store" : "content"; }
  }
  const rows = Object.fromEntries((probe?.result?.rows || []).map((r) => [r.id, r])); const cf = probe?.ladder?.checks || {}; const cfNext = new Set(probe?.ladder?.nextLevel || []); // only what the ladder needs for the NEXT level, not its whole to-do
  const cards = CARDS.map((card) => {
    const relevance = card.types[type]; const est = estimate(card, type);
    if (!probe) return { ...card, relevance, state: "todo", value: est.value, iaPoints: est.ia, cfWeight: est.cf, evidence: [] };
    const ia = card.ia.map((id) => rows[id]).filter(Boolean); const cfs = card.cf.map((id) => ({ id, ...(cf[id] || {}) })).filter((c) => c.status);
    const iaOpen = ia.filter((r) => r.status === "failed" || r.status === "partial"); const cfOpen = cfs.filter((c) => c.status === "fail");
    const measured = ia.some((r) => ["pass", "failed", "partial"].includes(r.status)) || cfs.some((c) => ["pass", "fail"].includes(c.status));
    let state = iaOpen.length || cfOpen.length ? "open" : measured ? "done" : "unmeasured";
    if (card.id === "site-type") state = siteTypeTag ? "done" : "open";
    // A door the type would skip, opened anyway, is charged on is-agentic: finish it or close it.
    const charged = relevance === "skip" && iaOpen.some((r) => r.status !== "n/a");
    const iaPoints = round1(iaOpen.reduce((a, r) => a + (r.recoverable || 0), 0)); const cfWeight = cfOpen.reduce((a, c) => a + (cfNext.has(c.id) ? 10 : 2), 0);
    const evidence = [...iaOpen.map((r) => `is-agentic ${r.id}: ${r.status}, ${r.detail}`), ...cfOpen.map((c) => `isitagentready ${c.id}: ${c.detail}`)];
    if (card.id === "site-type" && !siteTypeTag) evidence.push("no is-agentic-site-type meta tag on the homepage");
    return { ...card, relevance, state, charged, value: iaPoints + cfWeight + (state === "open" && card.id === "site-type" ? 1 : 0), iaPoints, cfWeight, evidence, blocksLevel: cfOpen.some((c) => cfNext.has(c.id)) };
  });
  const by = (a, b) => Boolean(b.first) - Boolean(a.first) || b.value - a.value;
  const todo = probe ? cards.filter((c) => c.state === "open") : cards;
  const out = { origin, type, inferred, siteTypeTag,
    today: probe ? { isAgentic: { score: probe.result.score, label: probe.result.label }, isItAgentReady: { level: probe.ladder?.level ?? null, name: probe.ladder?.levelName ?? null } } : null,
    rules: RULES,
    build: todo.filter((c) => c.relevance === "do").sort(by), finishOrClose: todo.filter((c) => c.charged).sort(by), optional: todo.filter((c) => c.relevance === "optional").sort(by),
    skip: cards.filter((c) => c.relevance === "skip" && !c.charged), done: cards.filter((c) => c.state === "done"), unmeasured: cards.filter((c) => c.state === "unmeasured" && c.relevance !== "skip") };
  if (JSON_OUT) { console.log(JSON.stringify(out, (k, v) => (k === "types" ? undefined : v), 2)); return; }
  console.log(brief(out));
}

function brief(o) {
  const L = []; const site = o.origin || "a new site"; let n = 0;
  L.push(`# Make ${site} agent-ready (${o.type}${o.inferred ? ", inferred: pass --type to override" : ""})`, "");
  if (o.today) L.push(`Today: is-agentic.com ${o.today.isAgentic.score}/100 (${o.today.isAgentic.label}); isitagentready.com level ${o.today.isItAgentReady.level} (${o.today.isItAgentReady.name}). Measured by doors' own probes; their published numbers can differ (see agent-score and agent-readiness).`, "");
  L.push(`Goal: every card below done, for a ${o.type} site. Doors that do not fit a ${o.type} site are listed at the end and left alone.`, "",
    "Commands that start with `node <doors>/...` run doors' probes; `<doors>` is the `doors/` folder of a checkout of https://github.com/oddharsh/doors" + (PLUGIN ? ` (here: ${PLUGIN})` : "") + ". Point estimates are is-agentic's pool shares for this type; a probe run replaces them with what is actually open.", "", "## Rules", "");
  o.rules.forEach((r, i) => L.push(`${i + 1}. ${r}`));
  const cfLabel = (c) => { if (!c.cf.length) return null; if (c.blocksLevel) return "blocks the next isitagentready level";
    const rungs = [...new Set(c.cf.map((id) => CF_RUNG[id]).filter(Boolean))].sort();
    return rungs.length ? `isitagentready ${rungs.map((r) => CF_RUNG_NEED[r]).join(", ")}` : c.cf.length > 2 ? "isitagentready's commerce checks" : "graded by isitagentready outside the ladder"; };
  const card = (c) => { n++; const worth = [c.iaPoints ? `about +${c.iaPoints} on is-agentic` : null, cfLabel(c)].filter(Boolean).join("; ");
    L.push("", `### ${n}. ${c.title}${worth ? `  (${worth})` : ""}`, "", c.why, "");
    if (c.evidence?.length) { L.push("Found:"); c.evidence.forEach((e) => L.push(`- ${e}`)); L.push(""); }
    L.push("Do:"); c.do.forEach((d) => L.push(`- ${d}`)); L.push("", "Prove it:", "", "```sh", ...c.verify.map((v) => fill(v, o.origin)), "```", "", `Skill: \`${c.skill}\` has the detail.`); };
  if (o.finishOrClose.length) { L.push("", "## Decide first: finish or close", "", `These doors are open on the site but are not part of a ${o.type} plan, and is-agentic charges for them once they exist. Ask the owner which: finish every card below, or remove the door that turned them on (usually /mcp, an OpenAPI document, OAuth metadata or a docs link). Closing is one change and takes all of these off the bill.`); o.finishOrClose.forEach(card); }
  if (o.build.length) { L.push("", "## Build, in order"); o.build.forEach(card); } else L.push("", "## Build", "", "Nothing open on the list for this type.");
  if (o.optional.length) { L.push("", "## Optional, once the list above is done"); o.optional.forEach(card); }
  if (o.skip.length) { L.push("", `## Not for a ${o.type} site`, ""); o.skip.forEach((c) => L.push(`- ${c.title} (\`${c.skill}\`)`)); }
  if (o.done.length) { L.push("", "## Already done", ""); o.done.forEach((c) => L.push(`- ${c.title}`)); }
  if (o.unmeasured.length) { L.push("", "## Not measured on this run", ""); o.unmeasured.forEach((c) => L.push(`- ${c.title}: no check ran (search checks need a search engine; some doors only show in a browser)`)); }
  L.push("", "## When the list is done", "", "```sh", `node <doors>/skills/make-agent-ready/scripts/plan.mjs ${o.origin || "https://your.site"} --type ${o.type}`, "```", "", "Then rescan on https://is-agentic.com/ (reports refresh only when older than 6 hours, so use Rescan) and https://isitagentready.com/, and compare with `agent-score --reference` and `agent-readiness --reference`.");
  return L.join("\n");
}

// Coverage: every check either scanner grades has a card, every card names a skill that exists and can be proven.
function check() {
  const problems = [];
  const iaIds = [...readFileSync(SCORE, "utf8").matchAll(/^\s*\["([a-z0-9-]+)", "(essential|recommended)"/gm)].map((m) => m[1]);
  const cfIds = [...readFileSync(LADDER, "utf8").matchAll(/\["(discoverability|content|botAccess|discovery|commerce)", "(\w+)"/g)].map((m) => m[2]);
  if (iaIds.length !== 36) problems.push(`expected 36 is-agentic ids in score.mjs, read ${iaIds.length}`);
  if (cfIds.length !== 22) problems.push(`expected 22 isitagentready ids in ladder.mjs, read ${cfIds.length}`);
  const cardIa = new Set(CARDS.flatMap((c) => c.ia)), cardCf = new Set(CARDS.flatMap((c) => c.cf));
  for (const id of iaIds) if (!cardIa.has(id)) problems.push(`is-agentic ${id} has no card`);
  for (const id of cfIds) if (!cardCf.has(id)) problems.push(`isitagentready ${id} has no card`);
  for (const id of cardIa) if (!iaIds.includes(id)) problems.push(`a card names is-agentic ${id}, which score.mjs does not grade`);
  for (const id of cardCf) if (!cfIds.includes(id)) problems.push(`a card names isitagentready ${id}, which ladder.mjs does not grade`);
  const seen = new Set();
  for (const c of CARDS) {
    if (seen.has(c.id)) problems.push(`duplicate card ${c.id}`); seen.add(c.id);
    if (!existsSync(join(SKILLS, c.skill, "SKILL.md"))) problems.push(`${c.id}: skill ${c.skill} does not exist`);
    for (const t of TYPES) if (!["do", "optional", "skip"].includes(c.types?.[t])) problems.push(`${c.id}: no relevance for ${t}`);
    if (!c.do?.length || !c.verify?.length || !c.why) problems.push(`${c.id}: needs why, do and verify`);
    for (const v of c.verify) { const s = v.match(/<plugin-root>\/skills\/([\w-]+\/scripts\/[\w.-]+)/); if (s && !existsSync(join(SKILLS, s[1]))) problems.push(`${c.id}: verify names ${s[1]}, which does not exist`); }
  }
  if (JSON_OUT) console.log(JSON.stringify({ cards: CARDS.length, isAgentic: iaIds.length, isItAgentReady: cfIds.length, problems }, null, 2));
  else { console.log(`  ${CARDS.length} cards cover ${iaIds.length} is-agentic checks and ${cfIds.length} isitagentready checks`); for (const p of problems) console.log(`  FAIL  ${p}`); console.log(problems.length ? `\n  ${problems.length} problem(s)` : "  every check has a card, every card a skill and a proof"); }
  return problems.length ? 1 : 0;
}

plan().catch((e) => { console.error(e); process.exit(1); });
