#!/usr/bin/env node
// replay.mjs — what do real agent clients GET from this page?
//
//   node replay.mjs https://example.com/some/page
//   node replay.mjs https://example.com --json
//
// Replays the Accept header seven shipping agent clients actually send, plus a
// browser control, plus the conformance checks acceptmarkdown.com scores against
// and two it does not (an explicit q=0 refusal, and rel=alternate discovery). The
// replay leads and the checklist follows, because the two disagree: three of the
// seven clients send text/markdown and text/html at EQUAL q, and a server that
// ranks strictly by q passes every check on the list and hands those three HTML.
// The reference site was one of them until 2026-08-27.
const UA = "doors-markdown/0.1 (+https://github.com/oddharsh/doors)";
// Verified dates are the observation dates of these strings in the wild, carried
// through rather than restated; a drifted string argues with its own date.
const AGENTS = [
  { key: "claude-code",  label: "Claude Code",       accept: "text/markdown, text/html, */*", verified: "2025-11-13" },
  { key: "copilot-cli",  label: "Copilot CLI",       accept: "text/markdown, text/html, */*", verified: "2026-06-22" },
  { key: "ms-copilot",   label: "Microsoft Copilot", accept: "text/markdown, text/html, */*", verified: "2026-06-22" },
  { key: "copilot-chat", label: "Copilot Chat",      accept: "text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, application/xml;q=0.8, */*;q=0.7", verified: "2026-06-22" },
  { key: "cursor",       label: "Cursor",            accept: "text/markdown, text/plain;q=0.9, */*;q=0.8", verified: "2026-04-18" },
  { key: "openclaw",     label: "OpenClaw",          accept: "text/markdown, text/html;q=0.9, */*;q=0.1", verified: "2026-05-04" },
  { key: "opencode",     label: "OpenCode",          accept: "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1", verified: "2026-05-04" },
];
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: replay.mjs <url> [--json]"); process.exit(2); }
const url = new URL(target).href;
async function get(accept) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } });
    const body = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, ct: (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), vary: res.headers.get("vary") || "", link: res.headers.get("link") || "", bytes: body.length, text: new TextDecoder().decode(body.subarray(0, 65536)) }; }
  catch (e) { return { status: 0, ct: "", vary: "", link: "", bytes: 0, text: "", error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}
// Every distinct Accept fetched once: seven agents cost six requests.
const distinct = [...new Set([BROWSER, ...AGENTS.map((a) => a.accept), "text/html;q=1.0, text/markdown;q=0.5", "text/html, text/markdown;q=0"])];
const results = new Map(); for (const a of distinct) results.set(a, await get(a));
const md = (r) => r.ct === "text/markdown";
const control = results.get(BROWSER);
const rows = AGENTS.map((a) => { const r = results.get(a.accept); return { ...a, got: r.error ? "error" : r.ct || "none", markdown: md(r), status: r.status }; });
const reach = control.error ? null : md(control) ? null : rows.filter((r) => r.markdown).length;
const qRanked = results.get("text/html;q=1.0, text/markdown;q=0.5"), qZero = results.get("text/html, text/markdown;q=0");
const alt = (() => { // rel=alternate to a Markdown representation: Link header first, then <link> in the HTML
  const h = control.link.split(",").find((p) => /rel\s*=\s*"?[^";]*\balternate\b/i.test(p) && /text\/markdown/i.test(p));
  if (h) return { where: "Link header", href: (h.match(/<([^>]+)>/) || [])[1] };
  const t = [...control.text.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel\s*=\s*["']?[^"'>]*\balternate\b/i.test(t) && /text\/markdown/i.test(t));
  if (t) { const m = t.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i); return { where: "<link>", href: m ? (m[2] ?? m[3] ?? m[4]) : null }; }  // minified HTML unquotes attributes
  return null;
})();
const checks = {
  "browser control gets HTML": { pass: !control.error && !md(control), detail: control.error ? control.error : `${control.ct} for a browser Accept` + (md(control) ? " (ONE representation, nothing is negotiated; every row below is meaningless)" : "") },
  "ranked Accept respected": { pass: !qRanked.error && !md(qRanked), detail: `text/html;q=1.0, text/markdown;q=0.5 -> ${qRanked.ct || qRanked.error}` },
  "q=0 refusal respected": { pass: !qZero.error && !md(qZero), detail: `text/markdown;q=0 -> ${qZero.ct || qZero.error}` + (md(qZero) ? " (served Markdown to a client that said it would not take any: a substring match, not a parse)" : "") },
  "Vary names Accept": { pass: /\baccept\b/i.test(control.vary), detail: control.vary ? `Vary: ${control.vary}` : "no Vary header (a shared cache will hand one client the other's representation)" },
  "rel=alternate discovery": { pass: !!alt, detail: alt ? `${alt.where}: ${alt.href}` : "no rel=alternate type=text/markdown; a client that sends no Accept has no path to the twin" },
};
const mdRow = rows.find((r) => r.markdown); const mdBytes = mdRow ? results.get(mdRow.accept).bytes : null;
const delta = mdBytes && control.bytes ? { html: control.bytes, markdown: mdBytes, ratio: +(control.bytes / mdBytes).toFixed(1) } : null;
const out = { url, control: { status: control.status, ct: control.ct }, reach, of: AGENTS.length, agents: rows, checks, delta };
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`markdown replay: ${url}\n`);
  console.log(`  ${"client".padEnd(20)} ${"got".padEnd(16)} accept (verified)`);
  for (const r of rows) console.log(`  ${r.label.padEnd(20)} ${(r.markdown ? "markdown" : r.got).padEnd(16)} ${r.accept.slice(0, 60)}${r.accept.length > 60 ? "..." : ""}  (${r.verified})`);
  console.log(`  ${"browser (control)".padEnd(20)} ${(control.error ? "error" : control.ct).padEnd(16)} ${BROWSER.slice(0, 60)}...`);
  console.log(`\n  reach: ${reach === null ? "n/a (control failed or site has one representation)" : `${reach} of ${AGENTS.length} agent clients receive Markdown`}`);
  for (const [k, c] of Object.entries(checks)) console.log(`  ${(c.pass ? "pass" : "FAIL").padEnd(5)} ${k.padEnd(26)} ${c.detail}`);
  if (delta) console.log(`\n  decoded bytes: HTML ${delta.html.toLocaleString()} vs Markdown ${delta.markdown.toLocaleString()} (${delta.ratio}x); an agent spends context on characters, so this is the number that matters`);
}
