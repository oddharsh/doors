#!/usr/bin/env node
// check.mjs — the IndieWeb basics a personal site should carry, read the way a
// receiver reads them: from the served HTML, not from templates.
//
//   node check.mjs https://example.com                 homepage: h-card, rel=me, webmention endpoint
//   node check.mjs https://example.com --post /blog/x  also: h-entry on one post
//
// Zero dependencies. Regex over the HTML rather than a parser, which is enough
// for presence checks and deliberately NOT enough to validate microformats; the
// reference for that is indiewebify.me, linked from references/checklist.md.
const UA = "doors-indieweb/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--"));
const post = args.includes("--post") ? args[args.indexOf("--post") + 1] : null; const JSON_OUT = args.includes("--json");
if (!target) { console.error("usage: check.mjs <origin> [--post /path] [--json]"); process.exit(2); }
const origin = new URL(target).origin;
async function get(path) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try { const res = await fetch(origin + path, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } });
    return { status: res.status, html: await res.text(), link: res.headers.get("link") || "" }; }
  catch (e) { return { status: 0, html: "", link: "", error: e.message }; } finally { clearTimeout(t); }
}
// Served HTML is often minified, and minify-html unquotes attribute values, so
// `class=h-card` and `rel=me` are as common on the wire as the quoted forms. The
// reference site's own scanners were fooled by this three times; every matcher
// here accepts both. An unquoted value ends at whitespace or `>`.
const AV = (name, word) => new RegExp(`\\b${name}\\s*=\\s*(?:"[^"]*\\b${word}\\b[^"]*"|'[^']*\\b${word}\\b[^']*'|(?:[^\\s>"']*\\b)?${word}(?=[\\s>]|$))`, "i");
const tagsWith = (html, name, word) => [...html.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]).filter((t) => AV(name, word).test(t));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? (m[2] ?? m[3] ?? m[4]) : null; };
const classes = (tag) => (attr(tag, "class") || "").split(/\s+/).filter(Boolean);
const rels = (tag) => (attr(tag, "rel") || "").split(/\s+/).filter(Boolean);

const home = await get("/");
const v = (ok, detail, extra = {}) => ({ verdict: ok === null ? "unknown" : ok ? "yes" : "no", detail, ...extra });
const out = { origin };
if (home.status !== 200) { out.homepage = v(null, `GET / -> ${home.status || home.error}`); }
else {
  const html = home.html;
  // h-card: an element carrying class h-card, with p-name and u-url inside it somewhere
  const hcards = tagsWith(html, "class", "h-card");
  const hasName = /\bp-name\b/.test(html), hasUrl = /\bu-url\b/.test(html), hasPhoto = /\bu-photo\b/.test(html);
  out["h-card"] = v(hcards.length > 0, hcards.length ? `${hcards.length} h-card root(s); p-name ${hasName ? "yes" : "NO"}, u-url ${hasUrl ? "yes" : "NO"}, u-photo ${hasPhoto ? "yes" : "no"}` : "no element with class h-card on the homepage");
  // rel=me: <a> or <link> whose rel contains "me"
  const me = tagsWith(html, "rel", "me").filter((t) => /^<(a|link)\b/i.test(t)).map((t) => attr(t, "href")).filter(Boolean);
  out["rel=me"] = v(me.length > 0, me.length ? `${me.length} rel=me link(s): ${me.slice(0, 4).map((h) => new URL(h, origin).hostname).join(", ")}${me.length > 4 ? ", ..." : ""}` : "no rel=me links (identity cannot be cross-verified)", { links: me });
  // webmention endpoint: Link header or <link rel=webmention>, per the spec's discovery order
  const linkHdr = home.link.match(/<([^>]+)>\s*;[^,]*rel\s*=\s*"?[^",]*\bwebmention\b/i);
  const linkTag = tagsWith(html, "rel", "webmention").filter((t) => /^<(a|link)\b/i.test(t)).map((t) => attr(t, "href")).filter(Boolean);
  const endpoint = linkHdr ? linkHdr[1] : linkTag[0] || null;
  out.webmention = v(!!endpoint, endpoint ? `endpoint ${new URL(endpoint, origin).href} (via ${linkHdr ? "Link header" : "<link rel=webmention>"})` : "no webmention endpoint advertised on the homepage", { endpoint });
  // authorization endpoint (IndieAuth) is optional; report presence only
  const auth = tagsWith(html, "rel", "authorization_endpoint");
  out.indieauth = v(auth.length > 0, auth.length ? "authorization_endpoint advertised" : "no IndieAuth endpoint (optional; needed only to sign in AS this site elsewhere)");
}
if (post) {
  const p = await get(post);
  if (p.status !== 200) out["h-entry"] = v(null, `GET ${post} -> ${p.status || p.error}`);
  else {
    const h = p.html; const entry = /\bh-entry\b/.test(h);
    out["h-entry"] = v(entry, entry ? `h-entry present; e-content ${/\be-content\b/.test(h) ? "yes" : "NO"}, dt-published ${/\bdt-published\b/.test(h) ? "yes" : "NO"}, p-author/u-author ${/\b[pu]-author\b/.test(h) ? "yes" : "no"}` : `no h-entry on ${post} (a reader cannot tell the post from the chrome)`);
    const linkTag = tagsWith(h, "rel", "webmention");
    out["post webmention"] = v(!!(p.link.match(/webmention/i) || linkTag.length), (p.link.match(/webmention/i) || linkTag.length) ? "the post advertises the endpoint too" : "the post page does not advertise the endpoint (senders discover per-URL, so the homepage alone is not enough)");
  }
}
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else { console.log(`indieweb check: ${origin}\n`); for (const [k, d] of Object.entries(out)) if (k !== "origin") console.log(`  ${k.padEnd(18)} ${d.verdict.padEnd(8)} ${d.detail}`); }
