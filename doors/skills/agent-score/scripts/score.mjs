#!/usr/bin/env node
// score.mjs: the 0-100 number is-agentic.com (Vercel's scanner, scored by Ora)
// gives a public site, computed from probes that carry controls, with every
// check that is still open, how many points it is worth, and the doors skill
// that closes it.
//
//   node score.mjs --control                      first: every check read green on one fixture origin and red on another
//   node score.mjs https://example.com
//   node score.mjs https://example.com --reference   also read their latest completed report and diff the two, check by check
//   node score.mjs https://example.com --json
//
// The rubric is theirs (36 check ids, Essential 80 / Recommended 20 / Bonus 5,
// partial credit, not-applicable excluded), recovered from 41 published
// reports on 2026-10-16; references/is-agentic.md keeps the roster and the
// arithmetic, which reproduces their published score on every one of the 41.
// The verdicts are ours. It runs three siblings (agent-readiness, which fans
// out to agent-audit, agent-auth, skills-index and agent-commerce;
// crawler-policy's bot views; mcp-doors' conformance knock) and reads the page,
// its 404, its sitemap sample and its OpenAPI document itself. Zero dependencies.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const UA = "doors-agent-score/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const REFERENCE = args.includes("--reference"); const CONTROL = args.includes("--control");
const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (MAIN && !target && !CONTROL) { console.error("usage: score.mjs <origin> [--reference] [--json] | score.mjs --control"); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const SIBLING = { ladder: join(here, "../../agent-readiness/scripts/ladder.mjs"), bots: join(here, "../../crawler-policy/scripts/bot-views.mjs"), mcp: join(here, "../../mcp-doors/scripts/conform.mjs") };

const run = (script, origin) => new Promise((resolve) => execFile(process.execPath, [script, origin, "--json"], { maxBuffer: 32 << 20, timeout: 240000 }, (err, stdout) => { try { resolve(JSON.parse(stdout)); } catch { resolve({ error: err ? err.message.split("\n")[0] : "no JSON from " + script }); } }));
async function get(u, { accept = "text/html, */*;q=0.5", method = "GET", body, headers = {}, redirect = "follow" } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { method, body, redirect, signal: ctrl.signal, headers: { "user-agent": UA, accept, ...headers } }); const text = await res.text();
    return { status: res.status, text, headers: res.headers, url: res.url || u, ct: (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() }; }
  catch (e) { return { status: 0, text: "", headers: new Headers(), url: u, ct: "", error: e.name === "AbortError" ? "timeout" : e.message }; } finally { clearTimeout(t); }
}
// Hop by hop, so a chain is counted rather than hidden inside fetch.
async function follow(u, accept) { const hops = []; let cur = u;
  for (let i = 0; i < 8; i++) { const r = await get(cur, { accept, redirect: "manual" }); const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { hops.push(`${r.status} ${cur}`); cur = new URL(loc, cur).href; continue; } return { ...r, url: cur, hops }; }
  return { status: 0, text: "", headers: new Headers(), url: cur, ct: "", hops, error: "more than 8 redirects" }; }
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const isHtml = (t) => /^\s*<(!doctype|html)/i.test(String(t).slice(0, 300));
const text = (html) => String(html).replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const hrefs = (html, base) => [...new Set([...String(html).matchAll(/<a\b[^>]*?href=["']?([^"' >]+)/gi)].map((m) => { try { return new URL(m[1], base).href; } catch { return null; } }).filter(Boolean))];
const tag = (html, rx) => rx.test(html);
const metaRefresh = (html) => /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=/i.test(html);
const jsStub = (html) => text(html).length < 200 && /(window\.|document\.|top\.)?location(\.href)?\s*=\s*["'`]|location\.(replace|assign)\(/.test(html);
const loginWall = (r) => r.status === 401 || r.status === 403 || (/type=["']?password/i.test(r.text) && text(r.text).length < 3000);
const share = (n, d) => (d ? n / d : 0);
const round1 = (x) => Math.round(x * 10) / 10;
const RATE = ["ratelimit", "ratelimit-policy", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after"];
const rateHeaders = (r) => RATE.filter((h) => r?.headers?.get?.(h) != null);

// ── the rubric: id, tier, the evidence that makes it count, their name, the doors skill that closes it, one-line recipe ──
// Gates: `always`; `dev` (an API, OpenAPI, GraphQL, MCP, OAuth or developer docs is in evidence); `oauth` (any OAuth evidence, even a word);
// `mcpResources` (the handshake advertises resources); `mcpApp` (a tool names a ui:// view); `priced` (dev, or the origin sells). Not counted otherwise.
const CHECKS = [
  ["content-no-js", "essential", "always", "Content without JavaScript", "agent-score", "server-render 500+ characters of real text with one H1 first and headings that step down one level at a time"],
  ["agent-friendly-404", "essential", "always", "Agent-friendly 404s", "markdown-twins", "answer unknown paths 404 (never 200 with the app shell), and with Accept: text/markdown a short Markdown body linking sitemap, llms.txt, docs"],
  ["markdown-negotiation-vary", "essential", "always", "Markdown content negotiation (acceptmarkdown.com)", "markdown-twins", "answer Accept: text/markdown on / with text/markdown and Vary: Accept; keep HTML for Accept: text/html"],
  ["agent-crawler-reachability", "essential", "always", "Not blocked by bot detection", "crawler-policy", "let ChatGPT-User, Claude-User, PerplexityBot and the training crawlers reach / at the WAF; say no in robots.txt if you mean no"],
  ["redirect-hygiene", "essential", "always", "Redirect hygiene", "agent-score", "replace meta-refresh and JavaScript redirects with HTTP 301/308, and keep chains to one or two hops"],
  ["docs-auth-gate", "essential", "always", "Content behind auth", "agent-score", "serve content pages without a login wall; publish an ungated summary of anything that must stay gated"],
  ["openapi-spec", "essential", "dev", "OpenAPI spec published", "agent-score", "serve /openapi.json and name it from the api-catalog as service-desc"],
  ["scoped-permissions", "essential", "dev", "Scoped permissions", "agent-auth", "name OAuth scopes in the OpenAPI security scheme, or scopes_supported in RFC 9728 protected-resource metadata"],
  ["json-error-responses", "essential", "dev", "JSON error responses", "agent-score", "answer API errors (404 included) with application/problem+json: type, title, status, detail"],
  ["oauth-support", "essential", "oauth", "OAuth 2.0 support", "agent-auth", "serve /.well-known/oauth-authorization-server with an issuer equal to this origin and a token_endpoint that answers"],
  ["mcp-resource-listing", "essential", "mcpResources", "MCP resources exposed", "mcp-doors", "make resources/list return at least one resource, or drop the resources capability from the handshake"],
  ["mcp-view-domain", "essential", "mcpApp", "MCP App view reachable", "mcp-doors", "serve the ui:// view as HTML from resources/read, with no login form"],
  ["mcp-view-csp", "essential", "mcpApp", "MCP App view CSP", "mcp-doors", "declare _meta.ui.csp on the view (connectDomains, resourceDomains) with named origins, not *"],
  ["json-ld", "recommended", "always", "JSON-LD structured data", "agent-score", "add one JSON-LD block of the identity type the site is (Organization, SoftwareApplication, Person, Article) with name, url, description"],
  ["org-schema-completeness", "recommended", "always", "Organization schema completeness", "agent-score", "give the Organization JSON-LD a contactPoint (email or phone, contactType) and an address (PostalAddress)"],
  ["metadata-completeness", "recommended", "always", "Metadata completeness", "agent-score", "put <link rel=canonical>, <html lang>, og:image and og:type on the homepage"],
  ["sitemap", "recommended", "always", "Sitemap exists", "discovery-files", "serve /sitemap.xml with lastmod and name it from robots.txt"],
  ["trust-anchors", "recommended", "always", "Trust anchor pages", "agent-score", "publish /about, /contact and /privacy with 500+ characters each, linked from the homepage"],
  ["agent-instruction", "recommended", "always", "Agent instruction / when-to-use", "discovery-files", "add a \"## When to use\" section to llms.txt naming the jobs you are right for and how an agent should call you"],
  ["content-efficiency", "recommended", "always", "Content efficiency", "wire-weight", "make readable text at least 5% of the homepage HTML: drop hydration blobs and inline styles, flatten wrappers"],
  ["page-token-budget", "recommended", "always", "Page token budget", "markdown-twins", "keep each page's extracted text under 100K characters (~25K tokens); split long references and index them"],
  ["brand-search-accuracy", "recommended", "always", "Brand name discoverability", "agent-score", "describe the main product in the homepage title and H1 so a search for brand + product finds this domain first"],
  ["pricing-info", "recommended", "priced", "Pricing info accessible", "agent-score", "link a /pricing page from the homepage, or carry schema.org Offer with a price"],
  ["public-api-docs", "recommended", "dev", "Public API/docs linked from homepage", "agent-score", "link /docs (or /developers, /api) from the homepage, with auth, endpoints and examples"],
  ["developer-portal", "recommended", "dev", "Developer portal", "agent-score", "serve /developers (or a docs. host) with keys, quickstart and sandbox, linked from the homepage"],
  ["public-api", "recommended", "dev", "Public API with reachable endpoints", "agent-score", "expose at least one GET in the OpenAPI document an agent can call (2xx JSON, or a 401 that challenges)"],
  ["api-schema-analysis", "recommended", "dev", "API schema complexity analysis", "agent-score", "give every operation an operationId, a description, typed parameters and a typed request body"],
  ["function-calling-compat", "recommended", "dev", "Function calling compatibility", "agent-score", "make operationIds unique and tool-name safe (^[A-Za-z0-9_-]{1,64}$), each with a description"],
  ["response-schema-coverage", "recommended", "dev", "REST response schema coverage", "agent-score", "give every operation a typed 2xx response schema"],
  ["api-error-model", "recommended", "dev", "REST typed error model", "agent-score", "give 4xx/5xx responses one typed error schema (or application/problem+json) across the spec"],
  ["api-versioning-policy", "recommended", "dev", "REST versioning / deprecation policy", "agent-score", "version the API in the path (/v1) and mark retirements in the spec (deprecated: true, a Sunset header)"],
  ["rate-limit-headers", "recommended", "dev", "Rate limit response headers", "agent-score", "send RateLimit / RateLimit-Policy on API responses and Retry-After on 429, and document them in the spec"],
  ["mcp-server", "recommended", "dev", "MCP server / manifest", "mcp-doors", "serve Streamable HTTP MCP at /mcp with a public tools/list and a server card generated from it"],
  ["cli-tool", "recommended", "dev", "CLI tool available", "agent-score", "publish a CLI on npm, PyPI or Homebrew and name the install command in llms.txt"],
  ["onboarding-friction", "recommended", "dev", "Agent onboarding friction", "agent-score", "offer a free tier, self-serve API keys and a sandbox, and say so in llms.txt; one zero-auth endpoint proves it"],
  ["agentic-search-specific", "recommended", "dev", "Developer resource discoverability", "agent-score", "put the product name in the titles of docs, OpenAPI and MCP pages and list them in llms.txt"],
];
// Two checks run a web search for the brand. doors has no search engine it can name, so they read as unmeasured, sit outside our pool, and --reference shows theirs.
const SEARCH = new Set(["brand-search-accuracy", "agentic-search-specific"]);
const LABELS = [[85, "Strong technical baseline"], [70, "Ready with a few material gaps"], [50, "Important blockers remain"], [0, "Agents are likely to struggle"]];
// The bonus is "emerging formats", capped at five and never a penalty. Their signal weights are unpublished; ~0.23 points a signal fits their 41 reports to within half a point.
const BONUS_PER_SIGNAL = 0.23;

// ── reads: everything this script fetches itself, once ──────────────────────
async function measure(origin) {
  const rand = Math.random().toString(36).slice(2, 10);
  const [ladder, bots, mcp, home, homeMd, nf, nfMd, llms, agentTxt, agentsMd, catalog, graphql] = await Promise.all([
    run(SIBLING.ladder, origin), run(SIBLING.bots, origin), run(SIBLING.mcp, origin),
    follow(origin + "/", "text/html, */*;q=0.5"), get(origin + "/", { accept: "text/markdown" }),
    get(`${origin}/__doors-404-probe-${rand}`), get(`${origin}/__doors-404-probe-${rand}`, { accept: "text/markdown" }),
    get(origin + "/llms.txt", { accept: "text/plain, text/markdown, */*;q=0.5" }), get(origin + "/agent.txt", { accept: "text/plain, */*;q=0.5" }), get(origin + "/AGENTS.md", { accept: "text/markdown, text/plain, */*;q=0.5" }),
    get(origin + "/.well-known/api-catalog", { accept: "application/linkset+json, application/json" }),
    get(origin + "/graphql", { method: "POST", accept: "application/json", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }) }),
  ]);
  const homeOk = home.status === 200; const html = homeOk ? home.text : ""; const base = home.url || origin + "/";
  const catchAll = nf.status === 200; const nfText = catchAll ? text(nf.text) : null;
  const realPage = (r) => r.status === 200 && isHtml(r.text) && !(catchAll && text(r.text) === nfText); // a catch-all 200 is not a page
  const files = [llms, agentTxt, agentsMd].filter((r) => r.status === 200 && !isHtml(r.text));
  const corpus = [text(html), ...files.map((r) => r.text)].join("\n");
  const links = hrefs(html, base); const host = new URL(origin).hostname.replace(/^www\./, "");
  const sameSite = (u) => { try { const h = new URL(u).hostname; return h === host || h.endsWith("." + host); } catch { return false; } };
  const pathOf = (u) => { try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } };
  const find = (rx) => links.find((u) => sameSite(u) && rx.test(pathOf(u)));
  const docsLink = links.find((u) => sameSite(u) && (/^(docs|developers?|api|reference)\./.test(new URL(u).hostname) || /^\/(docs|developers?|api|reference)(\/|$)/.test(pathOf(u))));
  const portalLink = links.find((u) => sameSite(u) && (/^(developers?|docs)\./.test(new URL(u).hostname) || /^\/developers?(\/|$)/.test(pathOf(u))));

  // sitemap: robots' Sitemap line first, then the conventional path; one level of index followed; up to six pages, spread across the list
  const robots = await get(origin + "/robots.txt", { accept: "text/plain, */*;q=0.5" });
  const smUrl = /^\s*sitemap\s*:\s*(\S+)/im.exec(robots.status === 200 ? robots.text : "")?.[1] || origin + "/sitemap.xml";
  let sm = await get(smUrl, { accept: "application/xml, text/xml, */*;q=0.5" }); const smOk = sm.status === 200 && /<(urlset|sitemapindex)\b/i.test(sm.text);
  if (smOk && /<sitemapindex\b/i.test(sm.text)) { const child = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(sm.text)?.[1]; if (child) sm = await get(child, { accept: "application/xml, text/xml, */*;q=0.5" }); }
  const locs = smOk ? [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((u) => sameSite(u) && u.replace(/\/$/, "") !== origin) : [];
  const pick = locs.length <= 6 ? locs : Array.from({ length: 6 }, (_, i) => locs[Math.floor((i * locs.length) / 6)]);

  // trust anchors: the homepage's own links first, then the conventional paths
  const anchorUrl = (k, rx) => find(rx) || `${origin}/${k}`;
  const anchors = { about: anchorUrl("about", /^\/(about|company)(-us)?\/?$/), contact: anchorUrl("contact", /^\/contact(-us)?\/?$/), privacy: anchorUrl("privacy", /privacy/) };
  const pricingUrl = find(/^\/(pricing|plans)\/?$/) || origin + "/pricing";

  // OpenAPI: what the catalog and Link header advertise, then the usual paths; the first that parses wins
  const linkset = catalog.status === 200 ? json(catalog.text) : null;
  const advertised = [...(linkset?.linkset || []).flatMap((l) => (l["service-desc"] || []).map((d) => d.href)), ...[...(home.headers.get("link") || "").matchAll(/<([^>]+)>\s*;[^,]*rel="?service-desc/g)].map((m) => m[1])].map((h) => { try { return new URL(h, origin).href; } catch { return null; } }).filter(Boolean);
  const specUrls = [...new Set([...advertised, ...["/openapi.json", "/api/openapi.json", "/.well-known/openapi.json", "/swagger.json", "/openapi.yaml", "/api/openapi.yaml"].map((p) => origin + p)])].slice(0, 8);
  const [pages, anchorPages, pricing, docsPage, portalPage, ...specs] = await Promise.all([
    Promise.all(pick.map((u) => follow(u, "text/html, */*;q=0.5"))), Promise.all(Object.values(anchors).map((u) => get(u))), get(pricingUrl), get(docsLink || origin + "/docs"), get(portalLink || origin + "/developers"),
    ...specUrls.map((u) => get(u, { accept: "application/json, application/yaml, text/yaml, */*;q=0.5" })),
  ]);
  let spec = null, specAt = null, specYaml = false;
  for (let i = 0; i < specs.length; i++) { const r = specs[i]; if (r.status !== 200 || isHtml(r.text)) continue; const d = json(r.text); if (d && (d.openapi || d.swagger) && d.paths) { spec = d; specAt = specUrls[i]; break; } if (!specAt && /^\s*(openapi|swagger)\s*:/m.test(r.text)) { specAt = specUrls[i]; specYaml = true; } }

  // the API itself: a knock for the error shape, and up to three parameterless GETs from the spec for liveness and rate-limit headers
  const server = (() => { const s = spec?.servers?.[0]?.url || (spec?.host ? `https://${spec.host}${spec.basePath || ""}` : null); try { return s ? new URL(s, origin).href.replace(/\/$/, "") : null; } catch { return null; } })();
  const apiBase = server || (linkset?.linkset?.[0]?.anchor ? new URL(linkset.linkset[0].anchor, origin).href.replace(/\/$/, "") : origin + "/api");
  const ops = spec ? Object.entries(spec.paths || {}).flatMap(([p, item]) => ["get", "post", "put", "patch", "delete"].filter((m) => item?.[m]).map((m) => ({ path: p, method: m, op: item[m], params: [...(item.parameters || []), ...(item[m].parameters || [])] }))) : [];
  const callable = ops.filter((o) => o.method === "get" && !/\{/.test(o.path) && !o.params.some((p) => p.required)).slice(0, 3);
  const [errKnock, ...live] = await Promise.all([get(`${apiBase}/__doors-probe-${rand}`, { accept: "application/json" }), ...callable.map((o) => get(apiBase + o.path, { accept: "application/json" }))]);

  // a CLI named in prose is a claim; npm and PyPI can confirm a name in one request
  const install = /\b(npx\s+(?:-y\s+)?|npm\s+i(?:nstall)?\s+(?:-g\s+)?|pnpm\s+dlx\s+|bunx\s+)(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)|\b(brew|pipx?|uv\s+tool|cargo|go)\s+install\s+([\w./@-]+)/i.exec(corpus);
  let cliVerified = null; if (install?.[2]) { const r = await get(`https://registry.npmjs.org/${install[2].replace("/", "%2F")}`, { accept: "application/json" }); cliVerified = r.status === 200 ? "npm" : null; }
  else if (install && /^pip/.test(install[3])) { const r = await get(`https://pypi.org/pypi/${install[4]}/json`, { accept: "application/json" }); cliVerified = r.status === 200 ? "PyPI" : null; }

  return { origin, ladder, bots, mcp, home, homeMd, nf, nfMd, files, corpus, links, docsLink, portalLink, catchAll, realPage, robots, smOk, smUrl, pages, anchors, anchorPages, pricing, pricingUrl, docsPage, portalPage, spec, specAt, specYaml, apiBase, ops, errKnock, live, graphql, install, cliVerified, homeOk, html };
}

// ── grading: each check returns a credit in [0, 1], null (not applicable) or "unmeasured", with the evidence ──
function grade(m) {
  const g = {}; const set = (id, credit, detail) => (g[id] = { credit, detail });
  const html = m.html; const t = text(html); const hs = [...html.matchAll(/<h([1-6])\b/gi)].map((x) => +x[1]);
  const ratio = share(t.length, html.length);
  const audit = m.ladder.probes?.audit || {}; const auth = m.ladder.probes?.auth || {}; const sells = ["yes", "likely"].includes(m.ladder.sells);
  const ok = (r) => r && r.status >= 200 && r.status < 300;
  const asIssuer = auth.authorizationServer?.issuer; const prmOk = Boolean(auth.protectedResource?.resource);
  const mcpLive = ["modern", "legacy", "modern-other-version"].includes(m.mcp.era) && m.mcp.tools?.count > 0; const mcpLocked = m.mcp.era === "locked";
  const graphqlOk = ok(m.graphql) && json(m.graphql.text)?.data != null;
  const liveOk = m.live.find((r) => ok(r) && json(r.text) != null); const liveLocked = m.live.find((r) => (r.status === 401 || r.status === 403) && r.headers.get("www-authenticate"));
  const gates = {
    always: true,
    dev: Boolean(m.spec || m.specAt || graphqlOk || ["yes", "likely"].includes(audit["api-catalog"]?.verdict) || mcpLive || mcpLocked || ["yes", "likely"].includes(audit["MCP /mcp"]?.verdict) || asIssuer || prmOk || m.docsLink || m.portalLink),
    oauth: Boolean(asIssuer || prmOk || /\boauth\b/i.test(m.corpus)),
    mcpResources: Boolean(m.mcp.capabilities?.resources),
    mcpApp: Boolean(m.mcp.app || m.mcp.tools?.views?.length),
  };
  gates.priced = gates.dev || sells;

  // essential, always
  if (!m.homeOk) set("content-no-js", 0, `GET / answered HTTP ${m.home.status || m.home.error}`);
  else if (t.length < 500) set("content-no-js", 0, `${t.length} characters of text in the raw HTML; an agent that does not run JavaScript sees almost nothing`);
  else { const issues = []; if (!hs.includes(1)) issues.push("no H1"); else if (hs[0] !== 1) issues.push(`first heading is H${hs[0]}, not H1`);
    if (hs.some((h, i) => i && h > hs[i - 1] + 1)) issues.push("heading levels skip"); if (new Set(hs).size < 2) issues.push("flat heading structure"); if (ratio < 0.05) issues.push(`${(ratio * 100).toFixed(1)}% content ratio, under 5%`);
    set("content-no-js", Math.max(0.25, 1 - 0.25 * issues.length - (issues.includes("no H1") ? 0.25 : 0)), `${t.length} characters${issues.length ? `; ${issues.join("; ")}` : ", H1 first, headings step down"}`); }
  const nfMdOk = [404, 410].includes(m.nfMd.status) && m.nfMd.ct === "text/markdown" && m.nfMd.text.trim().length >= 20;
  set("agent-friendly-404", m.catchAll ? 0 : [404, 410].includes(m.nf.status) ? (nfMdOk ? 1 : 0.5) : m.nf.status ? 0.25 : "unmeasured",
    m.catchAll ? "an unknown path answers 200 (soft 404): an agent probing for a resource concludes every path exists" : [404, 410].includes(m.nf.status) ? `unknown path answers ${m.nf.status}${nfMdOk ? ", and Markdown when asked for it" : `; with Accept: text/markdown it answers ${m.nfMd.status} ${m.nfMd.ct || "(no type)"}, not a Markdown body`}` : `unknown path answers ${m.nf.status || m.nf.error}`);
  const vary = (m.homeMd.headers.get("vary") || "").toLowerCase(); const varies = vary.split(",").map((x) => x.trim()).some((x) => x === "accept" || x === "*"); const md = m.homeMd.status === 200 && m.homeMd.ct === "text/markdown" && m.homeMd.text.trim().length > 0;
  const realClients = audit["Markdown negotiation"]?.detail;
  set("markdown-negotiation-vary", m.home.ct === "text/markdown" ? 0 : md ? (varies ? 1 : 0.5) : 0, m.home.ct === "text/markdown" ? "the HTML request got Markdown too: one representation, nothing negotiated" : md ? `bare Accept: text/markdown gets Markdown${varies ? ", Vary carries Accept" : `, but Vary is "${vary || "absent"}": a shared cache can hand the wrong variant`}${realClients ? ` (real clients: ${realClients})` : ""}` : `bare Accept: text/markdown gets ${m.homeMd.ct || m.homeMd.status || m.homeMd.error}`);
  const agentRows = (m.bots.rows || []).filter((r) => ["ChatGPT-User", "Claude-User", "PerplexityBot", "ClaudeBot", "GPTBot", "Google-Extended"].includes(r.key));
  if (m.bots.error || m.bots.verdict === "unmeasurable" || !agentRows.length) set("agent-crawler-reachability", "unmeasured", m.bots.error || m.bots.instrument || "bot views did not run");
  else { const refused = agentRows.filter((r) => !(r.status >= 200 && r.status < 300)); set("agent-crawler-reachability", 1 - share(refused.length, agentRows.length), refused.length ? `refused on the wire: ${refused.map((r) => `${r.key} ${r.status || r.error}`).join(", ")} (a browser control got in, so this is policy)` : `${agentRows.length} agent identities reach / (${m.bots.instrument})`); }
  const refreshes = [m.home, ...m.pages].filter((r) => metaRefresh(r.text) || jsStub(r.text)); const longest = Math.max(m.home.hops?.length || 0, ...m.pages.map((r) => r.hops?.length || 0));
  set("redirect-hygiene", refreshes.length ? 0 : longest > 2 ? 0.5 : 1, refreshes.length ? `${refreshes.length} page(s) redirect in the document a non-JS agent never executes: ${refreshes.slice(0, 3).map((r) => r.url.replace(m.origin, "") || "/").join(", ")}` : longest > 2 ? `a ${longest}-hop redirect chain: ${(m.home.hops.length > 2 ? m.home.hops : m.pages.find((r) => r.hops?.length === longest).hops).join(" -> ")}` : `HTTP redirects only, longest chain ${longest} hop(s), across / and ${m.pages.length} sitemap page(s)`);
  const sample = [m.home, ...m.pages, ...(m.docsLink ? [m.docsPage] : [])].filter((r) => r.status); const gated = sample.filter(loginWall);
  set("docs-auth-gate", !gated.length ? 1 : gated.length <= sample.length / 2 ? 0.5 : 0, gated.length ? `${gated.length} of ${sample.length} sampled page(s) behind a login: ${gated.slice(0, 3).map((r) => `${r.url.replace(m.origin, "") || "/"} (${r.status})`).join(", ")}` : `${sample.length} sampled page(s), none behind a login`);

  // essential, gated
  const schemes = m.spec?.components?.securitySchemes || m.spec?.securityDefinitions || {};
  const scoped = Object.values(schemes).some((s) => s.type === "openIdConnect" || Object.values(s.flows || {}).some((f) => Object.keys(f.scopes || {}).length) || Object.keys(s.scopes || {}).length);
  const metaScopes = auth.protectedResource?.scopes?.length || auth.authorizationServer?.scopes?.length;
  set("openapi-spec", m.spec ? 1 : m.specAt ? 1 : 0, m.spec ? `${m.specAt.replace(m.origin, "")}: ${m.ops.length} operation(s), ${m.spec.openapi ? "OpenAPI " + m.spec.openapi : "Swagger " + m.spec.swagger}` : m.specAt ? `${m.specAt.replace(m.origin, "")} (YAML; doors parses JSON, so the five schema checks below read as unmeasured)` : `no OpenAPI document at ${m.specAt || "the catalog's service-desc or six conventional paths"}`);
  set("scoped-permissions", scoped || metaScopes ? 1 : Object.keys(schemes).length ? 0.5 : 0, scoped ? "named OAuth scopes in the OpenAPI security schemes" : metaScopes ? `scopes_supported in the ${auth.protectedResource?.scopes?.length ? "protected-resource" : "authorization-server"} metadata` : Object.keys(schemes).length ? `security scheme(s) ${Object.keys(schemes).join(", ")} with no named scopes: all-or-nothing access` : "no security schemes, no scopes_supported");
  const errJson = m.errKnock.status >= 400 && m.errKnock.status < 500 && (/json/.test(m.errKnock.ct) || json(m.errKnock.text) != null);
  set("json-error-responses", errJson ? 1 : 0, `GET ${m.apiBase.replace(m.origin, "")}/<unknown> answered ${m.errKnock.status || m.errKnock.error} ${m.errKnock.ct || ""}${errJson ? (m.errKnock.ct === "application/problem+json" ? " (RFC 9457)" : "") : isHtml(m.errKnock.text) ? ": an HTML page an agent cannot parse" : ""}`.trim());
  set("oauth-support", asIssuer ? 1 : prmOk ? 0.75 : 0.5, asIssuer ? `authorization server metadata, issuer ${asIssuer}${auth.chain?.length ? `; ${auth.chain.length} broken hop(s) in the chain (agent-auth names them)` : ""}` : prmOk ? "protected-resource metadata, but no authorization server metadata at this origin" : "OAuth named in the page or llms.txt, no standard metadata endpoint");
  set("mcp-resource-listing", m.mcp.resources?.count > 0 ? 1 : 0, m.mcp.resources?.count > 0 ? `resources/list returned ${m.mcp.resources.count}` : `advertises resources; ${m.mcp.resources?.error || "resources/list returned none"}`);
  const app = m.mcp.app; const csp = app?.csp; const wild = csp && JSON.stringify(csp).includes('"*"');
  set("mcp-view-domain", app?.read && app.html && !app.loginForm ? 1 : 0, !app ? `a tool names ${m.mcp.tools?.views?.[0]} but the view was not read` : !app.read ? `resources/read refused ${app.view}` : app.loginForm ? `${app.view} renders a login form` : app.html ? `${app.view} reads as HTML` : `${app.view} is not HTML`);
  set("mcp-view-csp", csp && (csp.connectDomains || csp.resourceDomains) ? (wild ? 0.5 : 1) : 0, csp ? `_meta.ui.csp: ${Object.keys(csp).join(", ")}${wild ? ' (with "*")' : ""}` : "no _meta.ui.csp on the view");

  // recommended, always
  const blocks = [...html.matchAll(/<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => json(x[1].trim()));
  const nodes = blocks.filter(Boolean).flatMap((b) => (Array.isArray(b) ? b : [b])).flatMap((n) => (n["@graph"] ? n["@graph"] : [n])); const types = nodes.flatMap((n) => [].concat(n["@type"] || []));
  set("json-ld", types.length ? 1 : blocks.length ? 0.5 : 0, types.length ? `JSON-LD types: ${[...new Set(types)].slice(0, 6).join(", ")}` : blocks.length ? `${blocks.length} JSON-LD block(s), ${blocks.filter((b) => !b).length} unparseable, no @type` : "no JSON-LD on the homepage");
  const org = nodes.find((n) => [].concat(n["@type"] || []).some((x) => /Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|NGO|^Store$/.test(x)));
  set("org-schema-completeness", org ? (1 + Boolean(org.contactPoint) + Boolean(org.address)) / 3 : 0, org ? (org.contactPoint && org.address ? "Organization with contactPoint and address" : `Organization missing ${[!org.contactPoint && "contactPoint", !org.address && "address"].filter(Boolean).join(" and ")}`) : "no Organization JSON-LD");
  const signals = { "canonical URL": tag(html, /<link[^>]+rel=["']?canonical/i), "HTML lang": tag(html, /<html[^>]+lang=["']?[a-z]/i), "og:image": tag(html, /<meta[^>]+(property|name)=["']og:image["']/i), "og:type": tag(html, /<meta[^>]+(property|name)=["']og:type["']/i) };
  const missing = Object.keys(signals).filter((k) => !signals[k]);
  set("metadata-completeness", share(4 - missing.length, 4), missing.length ? `${4 - missing.length} of 4; missing ${missing.join(", ")}` : "canonical, lang, og:image, og:type");
  set("sitemap", m.smOk ? 1 : 0, m.smOk ? `${m.smUrl.replace(m.origin, "")}${/sitemap/i.test(m.robots.text || "") ? ", named in robots.txt" : ""}` : `no sitemap at ${m.smUrl.replace(m.origin, "")}`);
  const anchorsOk = Object.keys(m.anchors).filter((k, i) => m.realPage(m.anchorPages[i]) && text(m.anchorPages[i].text).length >= 500);
  set("trust-anchors", share(anchorsOk.length, 3), anchorsOk.length === 3 ? "about, contact and privacy pages, 500+ characters each" : `${anchorsOk.length ? anchorsOk.join(", ") + " verified; " : ""}missing ${Object.keys(m.anchors).filter((k) => !anchorsOk.includes(k)).join(", ")}${m.catchAll ? " (a catch-all 200 is not a page)" : ""}`);
  const whenToUse = m.files.find((r) => /^#{1,4}\s*(when to use|use (this|it|us) (when|for)|when should)|\bwhen to use\b|\buse this (when|if)\b/im.test(r.text));
  set("agent-instruction", whenToUse ? 1 : m.files.length ? 0.5 : 0, whenToUse ? `when-to-use guidance in ${whenToUse.url.replace(m.origin, "")}` : m.files.length ? `${m.files.map((r) => r.url.replace(m.origin, "")).join(", ")} present, no when-to-use section` : "no llms.txt, agent.txt or AGENTS.md");
  set("content-efficiency", !m.homeOk ? 0 : ratio >= 0.05 ? 1 : ratio >= 0.01 ? 0.5 : 0, `${(ratio * 100).toFixed(2)}% of the homepage HTML is readable text (${t.length} of ${html.length} characters)`);
  const heavy = [m.home, ...m.pages].filter((r) => text(r.text).length > 100000);
  set("page-token-budget", heavy.length ? 0 : 1, heavy.length ? `${heavy.length} of ${m.pages.length + 1} page(s) over ~25K tokens of text: ${heavy.slice(0, 2).map((r) => `${r.url.replace(m.origin, "") || "/"} (~${Math.round(text(r.text).length / 4000)}K tokens)`).join(", ")}` : `${m.pages.length + 1} page(s) measured, all under ~25K tokens`);
  set("brand-search-accuracy", "unmeasured", "runs a web search; doors names no search engine, so --reference shows theirs");

  // recommended, gated
  const offers = nodes.some((n) => n.offers || [].concat(n["@type"] || []).includes("Offer"));
  set("pricing-info", m.realPage(m.pricing) ? 1 : offers ? 1 : 0, m.realPage(m.pricing) ? `${m.pricingUrl.replace(m.origin, "")} answers` : offers ? "schema.org Offer in the JSON-LD" : `no pricing page at ${m.pricingUrl.replace(m.origin, "")} and no Offer`);
  set("public-api-docs", m.docsLink ? 1 : m.realPage(m.docsPage) ? 0.5 : 0, m.docsLink ? `homepage links ${m.docsLink.replace(m.origin, "")}` : m.realPage(m.docsPage) ? "/docs answers but the homepage does not link it" : "no docs, api or developers link on the homepage");
  set("developer-portal", m.portalLink && m.realPage(m.portalPage) && text(m.portalPage.text).length >= 500 ? 1 : m.docsLink || m.realPage(m.portalPage) ? 0.5 : 0, m.portalLink && m.realPage(m.portalPage) ? `${m.portalLink.replace(m.origin, "")} answers with ${text(m.portalPage.text).length} characters` : m.docsLink ? "developer links on the homepage, no developer portal" : "no developer portal");
  set("public-api", liveOk || graphqlOk ? 1 : liveLocked ? 0.75 : m.spec ? 0.5 : m.docsLink ? 0.43 : 0, liveOk ? `GET ${liveOk.url.replace(m.origin, "")} answered ${liveOk.status} JSON without credentials` : graphqlOk ? "GraphQL at /graphql answers { __typename }" : liveLocked ? `GET ${liveLocked.url.replace(m.origin, "")} challenges with 401 (a locked door is a door)` : m.spec ? `spec lists ${m.ops.length} operation(s); none of the ${m.live.length} parameterless GET(s) knocked answered` : m.docsLink ? "API described in docs, no machine-verifiable endpoint" : "no reachable REST or GraphQL endpoint");
  if (!m.spec) for (const id of ["api-schema-analysis", "response-schema-coverage", "api-error-model", "api-versioning-policy"]) set(id, m.specYaml ? "unmeasured" : 0, m.specYaml ? "YAML spec; doors parses JSON only" : "no OpenAPI document to read");
  else {
    const n = m.ops.length; const typed = (p) => p.schema || p.$ref || p.content || p.type;
    const described = m.ops.filter((o) => o.op.operationId && (o.op.description || o.op.summary) && o.params.every(typed) && (!o.op.requestBody || o.op.requestBody.content || o.op.requestBody.$ref)).length;
    set("api-schema-analysis", share(described, n) >= 0.9 ? 1 : share(described, n) >= 0.5 ? 0.5 : 0, `${described} of ${n} operation(s) carry an operationId, a description and typed parameters`);
    const has2xx = m.ops.filter((o) => Object.entries(o.op.responses || {}).some(([c, r]) => /^2/.test(c) && (r.$ref || r.schema || Object.values(r.content || {}).some((x) => x.schema)))).length;
    set("response-schema-coverage", share(has2xx, n) >= 0.8 ? 1 : share(has2xx, n) >= 0.5 ? 0.5 : 0, `${Math.round(share(has2xx, n) * 100)}% of operations define a typed 2xx response`);
    const errOps = m.ops.filter((o) => Object.entries(o.op.responses || {}).some(([c, r]) => /^[45]|default/.test(c) && (r.$ref || r.schema || Object.values(r.content || {}).some((x) => x.schema)))).length;
    set("api-error-model", share(errOps, n) >= 0.5 ? 1 : errOps ? 0.5 : 0, `${errOps} of ${n} operation(s) type their 4xx/5xx responses${JSON.stringify(m.spec).includes("problem+json") ? ", application/problem+json" : ""}`);
    const s = JSON.stringify(m.spec); const versioned = /\/v\d+(\/|$)/.test(m.apiBase) || Object.keys(m.spec.paths || {}).some((p) => /^\/v\d+\//.test(p)) || m.ops.some((o) => o.params.some((p) => p.in === "header" && /version/i.test(p.name || "")));
    const deprecation = m.ops.some((o) => o.op.deprecated) || /"(sunset|deprecation)"|x-sunset/i.test(s);
    set("api-versioning-policy", versioned && deprecation ? 1 : versioned || deprecation ? 0.5 : 0, `${versioned ? "versioned (path or header)" : "no version in path or header"}; ${deprecation ? "deprecation declared in the spec" : "no deprecated flag or Sunset header in the spec"}`);
  }
  const names = m.ops.map((o) => o.op.operationId).filter(Boolean); const safe = names.filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x));
  set("function-calling-compat", m.spec ? (m.ops.length && safe.length === m.ops.length && new Set(names).size === names.length && m.ops.every((o) => o.op.description || o.op.summary) ? 1 : share(safe.length, m.ops.length) >= 0.5 ? 0.5 : 0) : mcpLive ? 0.5 : m.specYaml ? "unmeasured" : 0,
    m.spec ? `${safe.length} of ${m.ops.length} operationIds are tool-name safe${new Set(names).size !== names.length ? `, ${names.length - new Set(names).size} duplicated` : ""}` : mcpLive ? `MCP lists ${m.mcp.tools.count} tool(s); no OpenAPI for function calling` : "no API spec to derive functions from");
  const liveRate = [m.errKnock, ...m.live].map(rateHeaders).find((h) => h.length); const docRate = m.spec && /ratelimit|rate-limit|retry-after/i.test(JSON.stringify(m.spec));
  set("rate-limit-headers", liveRate ? 1 : docRate ? 0.5 : 0, liveRate ? `live: ${liveRate.join(", ")}` : docRate ? "documented in the spec, not seen on a live response" : `none on ${1 + m.live.length} API response(s)`);
  set("mcp-server", mcpLive ? 1 : mcpLocked ? 5 / 6 : m.mcp.card?.verdict && m.mcp.card.verdict !== "absent" ? 0.5 : /\bMCP\b|model context protocol/i.test(m.corpus) ? 1 / 3 : 0,
    mcpLive ? `${m.mcp.era} MCP at /mcp, ${m.mcp.tools.count} tool(s) without credentials${m.mcp.card?.verdict === "DRIFTS" ? "; the server card DRIFTS from tools/list" : ""}` : mcpLocked ? "MCP at /mcp challenges with 401 (OAuth-scoped; a public tools/list earns the rest)" : m.mcp.card?.verdict && m.mcp.card.verdict !== "absent" ? `server card ${m.mcp.card.path}, no live handshake` : /\bMCP\b/.test(m.corpus) ? "MCP named in prose, no server answers at /mcp" : "no MCP server");
  set("cli-tool", m.install ? (m.cliVerified ? 1 : 0.5) : /\bCLI\b|command[- ]line/i.test(m.corpus) ? 0.25 : 0, m.install ? `\`${m.install[0].trim()}\`${m.cliVerified ? `, confirmed on ${m.cliVerified}` : ", not confirmed on a registry"}` : /\bCLI\b/.test(m.corpus) ? "a CLI is mentioned, no install command" : "no CLI named");
  const described = { "free tier": /free (tier|plan|trial)|free to use|no credit card|\$0\b/i, "self-serve keys": /(create|generate|get)\s+(an?\s+|your\s+)?api\s+keys?|self-serve|api keys? (page|dashboard)/i, "sandbox": /sandbox|test mode|test (api )?keys?|playground/i };
  const said = Object.keys(described).filter((k) => described[k].test(m.corpus));
  set("onboarding-friction", Math.min(1, 0.2 * said.length + (liveOk ? 0.4 : 0)), `${liveOk ? `verified live: ${liveOk.url.replace(m.origin, "")} answered without credentials; ` : ""}${said.length ? `described: ${said.join(", ")}` : "no free tier, self-serve key or sandbox described"}`);
  set("agentic-search-specific", "unmeasured", "runs a web search for the developer resources; --reference shows theirs");

  // bonus: emerging doors, counted from the ladder's 22 checks and the audit's extras
  const lc = m.ladder.checks || {}; const pos = [...Object.keys(lc).filter((k) => lc[k].status === "pass"), ...["llms.txt", "AGENTS.md", "NLWeb /ask", "TDM terms"].filter((k) => ["yes", "likely"].includes(audit[k]?.verdict)), ...(m.ladder.llmsFull?.verdict === "yes" ? ["llms-full.txt"] : [])];
  return { g, gates, bonus: { signals: [...new Set(pos)], points: Math.min(5, round1(pos.length * BONUS_PER_SIGNAL)) } };
}

function score({ g, gates, bonus }) {
  const rows = CHECKS.map(([id, tier, gate, name, skill, recipe]) => { const c = gates[gate] ? g[id] : { credit: null, detail: `not applicable (no ${gate} evidence)` }; return { id, tier, gate, name, skill, recipe, ...c, status: c.credit === null ? "n/a" : c.credit === "unmeasured" ? "unmeasured" : c.credit >= 1 ? "pass" : c.credit <= 0 ? "failed" : "partial" }; });
  const bucket = (tier, pool) => { const counted = rows.filter((r) => r.tier === tier && typeof r.credit === "number"); const earned = counted.length ? (pool * counted.reduce((a, r) => a + r.credit, 0)) / counted.length : 0;
    for (const r of counted) r.recoverable = round1((pool * (1 - r.credit)) / counted.length); return { earned: round1(earned), available: pool, passing: counted.filter((r) => r.credit >= 1).length, total: counted.length, unmeasured: rows.filter((r) => r.tier === tier && r.status === "unmeasured").length }; };
  const essential = bucket("essential", 80), recommended = bucket("recommended", 20);
  const total = Math.min(100, Math.round(essential.earned + recommended.earned + bonus.points));
  return { score: total, label: LABELS.find(([min]) => total >= min)[1], breakdown: { essential, recommended, bonus: { points: bonus.points, positive_signals: bonus.signals.length, signals: bonus.signals } }, rows,
    next: rows.filter((r) => r.recoverable > 0).sort((a, b) => (a.tier === b.tier ? b.recoverable - a.recoverable : a.tier === "essential" ? -1 : 1)) };
}

// Their latest completed report. A GET never starts a scan (their docs say so); a site with no report gets told how to start one by hand.
async function reference(origin) {
  const r = await get(`https://is-agentic.com/api/v1/report?url=${encodeURIComponent(origin)}`, { accept: "application/json" }); const d = json(r.text);
  if (r.status === 404) return { error: `no completed report for ${origin}; scan it at https://is-agentic.com/ (or \`npx is-agentic ${new URL(origin).hostname}\`, which starts one) and re-run` };
  if (!d || r.status !== 200) return { error: `is-agentic.com answered ${r.status || r.error}${d?.code ? ` (${d.code}: ${d.detail})` : ""}` };
  return d;
}
function diff(ours, theirs) {
  const issues = Object.fromEntries((theirs.issues || []).map((i) => [i.id, i])); const known = new Set(CHECKS.map((c) => c[0]));
  const rows = [];
  for (const r of ours.rows) { const t = issues[r.id]; const their = t ? t.result : "pass or n/a";
    if (r.status === "unmeasured") { if (t) rows.push({ id: r.id, ours: "unmeasured", theirs: their, theirDetail: t.details, ourDetail: r.detail }); continue; }
    const agree = t ? r.status === t.result : r.status === "pass" || r.status === "n/a"; if (!agree) rows.push({ id: r.id, ours: r.status, theirs: their, theirDetail: t?.details || "(not listed: their issues array lists only failed and partial checks)", ourDetail: r.detail }); }
  const unknown = (theirs.issues || []).filter((i) => !known.has(i.id)).map((i) => ({ id: i.id, tier: i.tier, result: i.result, name: i.name, detail: i.details }));
  return { rows, unknown };
}

function print(out) {
  const s = out.result; const b = s.breakdown; const pad = (x, n) => String(x).padEnd(n);
  console.log(`${out.origin}   is-agentic rubric: Essential 80, Recommended 20, Bonus up to 5\n`);
  if (!out.measurable) console.log(`  ! GET / answered ${out.homeStatus}: the origin refuses this instrument or has no homepage, so the page checks below say nothing about the site\n`);
  else if (!out.homeOk) console.log(`  ! GET / answered ${out.homeStatus} to this probe and 200 to a browser: the page rows below describe what an unknown agent gets, which is a finding, and not what a browser sees\n`);
  console.log(`  score ${s.score} / 100   ${s.label}`);
  console.log(`  essential    ${pad(`${b.essential.earned} / 80`, 12)} ${b.essential.passing} of ${b.essential.total} pass`);
  console.log(`  recommended  ${pad(`${b.recommended.earned} / 20`, 12)} ${b.recommended.passing} of ${b.recommended.total} pass${b.recommended.unmeasured ? `, ${b.recommended.unmeasured} search check(s) unmeasured and outside the pool` : ""}`);
  console.log(`  bonus        ${pad(`+${b.bonus.points}`, 12)} ${b.bonus.positive_signals} emerging door(s) open (approximate: their weights are unpublished)\n`);
  for (const tier of ["essential", "recommended"]) { console.log(`  ${tier}`); for (const r of s.rows.filter((x) => x.tier === tier)) console.log(`    ${pad(r.status === "partial" ? `${Math.round(r.credit * 100)}%` : r.status === "unmeasured" ? "?" : r.status, 7)} ${pad(r.id, 27)} ${r.detail}`); }
  console.log(`\n  next (essentials first, then by points recoverable)`);
  if (!s.next.length) console.log(`    nothing: every counted check passes`);
  for (const r of s.next) console.log(`    +${pad(r.recoverable, 5)} ${pad(r.id, 27)} ${r.recipe}\n    ${"".padEnd(34)} skill: ${r.skill}`);
  if (out.reference) { const t = out.reference;
    if (t.error) console.log(`\n  is-agentic.com   ${t.error}`);
    else { const tb = t.score_breakdown; console.log(`\n  is-agentic.com   ${t.score} / 100 ${t.score_label}; essential ${tb.essential.earned}/80 (${tb.essential.passing} of ${tb.essential.total}), recommended ${tb.recommended.earned}/20 (${tb.recommended.passing} of ${tb.recommended.total}), bonus +${tb.bonus.points}; scanned ${t.scanned_at}`);
      if (tb.essential.total !== b.essential.total || tb.recommended.total !== b.recommended.total) console.log(`    the two instruments count different checks: theirs ${tb.essential.total}+${tb.recommended.total}, ours ${b.essential.total}+${b.recommended.total} (gating, or the search checks)`);
      if (!out.diff.rows.length) console.log(`    the two agree on every check doors measures`);
      for (const d of out.diff.rows) console.log(`    ${pad(d.id, 27)} theirs ${pad(d.theirs, 12)} ${d.theirDetail}\n    ${"".padEnd(27)} ours   ${pad(d.ours, 12)} ${d.ourDetail}`);
      for (const u of out.diff.unknown) console.log(`    ${pad(u.id, 27)} theirs ${pad(u.result, 12)} a check doors has no row for yet (${u.tier}: ${u.name}): ${u.detail}`); } }
}

// ── the control: one fixture origin built to pass every check doors measures, and two built to fail them, so a red row is a measurement.
// Two, because some doors must stand open on a failing origin for the checks they gate to count at all: `bad` keeps a live MCP server (so its
// resources and App view can fail) and a sitemap (so its sampled pages can fail); `bare` has neither, a catalog for API evidence, and no docs link.
function fixture(mode) {
  const good = mode === "good", bare = mode === "bare";
  let origin = ""; const page = (title, extra = "") => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><h1>${title}</h1><h2>Section</h2><p>${"This page exists so the fixture has real prose for an agent to read without running any script at all. ".repeat(6)}</p>${extra}</body></html>`;
  const org = { "@context": "https://schema.org", "@type": "Organization", name: "Fixture", url: "/", contactPoint: { "@type": "ContactPoint", email: "hi@fixture.test", contactType: "support" }, address: { "@type": "PostalAddress", addressLocality: "Nowhere" }, offers: { "@type": "Offer", price: "0" } };
  const homeGood = () => `<!doctype html><html lang="en"><head><title>Fixture</title><link rel="canonical" href="${origin}/"><meta property="og:image" content="${origin}/og.png"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(org)}</script></head><body><h1>Fixture API</h1><h2>What it does</h2><p>${"Fixture is a small API with a free tier, self-serve API keys you create in the dashboard, and a sandbox for tests. Install the CLI with npx doors-fixture-cli and sign in with OAuth. ".repeat(4)}</p><h3>Links</h3><p><a href="/docs">Docs</a> <a href="/developers">Developers</a> <a href="/about">About</a> <a href="/contact">Contact</a> <a href="/privacy">Privacy</a> <a href="/pricing">Pricing</a></p></body></html>`;
  const homeBad = `<!doctype html><html><head><title>app</title></head><body><div id="root"></div>${bare ? "" : '<a href="/docs">docs</a>'} OAuth<script>${"var x=1;".repeat(400)}</script></body></html>`;
  const spec = () => ({ openapi: "3.1.0", info: { title: "fixture", version: "1" }, servers: [{ url: `${origin}/api/v1` }], components: { securitySchemes: { oauth: { type: "oauth2", flows: { clientCredentials: { tokenUrl: `${origin}/token`, scopes: { "read:status": "read" } } } } }, schemas: { Problem: { type: "object", properties: { title: { type: "string" } } } } },
    paths: { "/status": { get: { operationId: "get_status", description: "service status", responses: { 200: { description: "ok", content: { "application/json": { schema: { type: "object" } } } }, 429: { description: "slow down", headers: { "RateLimit": { schema: { type: "string" } }, "Retry-After": { schema: { type: "integer" } } }, content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } } } } },
      "/legacy": { get: { operationId: "get_legacy", description: "old", deprecated: true, parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }], responses: { 200: { description: "ok", content: { "application/json": { schema: { type: "object" } } } }, default: { description: "error", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } } } } } } });
  const mcp = (rq, body, rs) => { const msg = json(body) || {}; const reply = (result, error) => { rs.writeHead(200, { "content-type": "application/json", "mcp-session-id": "fixture" }); rs.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...(error ? { error } : { result }) })); };
    const view = "ui://fixture/view.html";
    if (msg.method === "server/discover") return reply(null, { code: -32601, message: "method not found" });
    if (msg.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "fixture", version: "1" } });
    if (msg.method === "tools/list") return reply({ tools: [{ name: "get_status", description: "status", inputSchema: { type: "object" }, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: view } } }] });
    if (msg.method === "resources/list") return reply({ resources: good ? [{ uri: view, name: "view", mimeType: "text/html;profile=mcp-app" }] : [] });
    if (msg.method === "resources/read") return reply({ contents: [{ uri: view, mimeType: "text/html;profile=mcp-app", text: good ? "<!doctype html><html><body><div>status</div></body></html>" : '<html><body><form><input type="password"></form></body></html>', ...(good ? { _meta: { ui: { csp: { connectDomains: [origin], resourceDomains: [origin] } } } } : {}) }] });
    return reply(null, { code: -32601, message: "method not found" }); };
  const BOTS = /GPTBot|ClaudeBot|ChatGPT-User|Claude-User|PerplexityBot|Google-Extended/;
  const srv = createServer((rq, rs) => { let body = ""; rq.on("data", (c) => (body += c)); rq.on("end", () => {
    const u = new URL(rq.url, origin); const p = u.pathname; const accept = rq.headers.accept || ""; const send = (status, ct, b, h = {}) => { rs.writeHead(status, { "content-type": ct, ...h }); rs.end(b); };
    if (!good && BOTS.test(rq.headers["user-agent"] || "")) return send(403, "text/html", "<html><body>blocked</body></html>");
    if (p === "/mcp" && rq.method === "POST" && !bare) return mcp(rq, body, rs);
    if (p === "/") return /^text\/markdown/.test(accept) && good ? send(200, "text/markdown; charset=utf-8", "# Fixture API\n\nA small API.\n", { vary: "Accept" }) : send(200, "text/html", good ? homeGood() : homeBad, good ? { vary: "Accept" } : {});
    if (p === "/robots.txt") return send(200, "text/plain", `User-agent: *\nAllow: /\n${good ? `Sitemap: ${origin}/sitemap.xml\n` : ""}`);
    if (p === "/sitemap.xml" && !bare) return send(200, "application/xml", `<?xml version="1.0"?><urlset>${["/guide", "/guide/two", "/guide/three"].map((x) => `<loc>${origin}${x}</loc>`).join("")}</urlset>`);
    if (p === "/llms.txt") return send(200, "text/plain", good ? "# Fixture\n\n> A small API.\n\n## When to use\n\nUse this when you need the status of a fixture.\n" : "# app\n\nthings\nmore things\n");
    if (p.startsWith("/guide")) return good ? send(200, "text/html", page("Guide")) : p === "/guide" ? send(200, "text/html", `<html><head><meta http-equiv="refresh" content="0; url=/guide/two"></head><body></body></html>`) : p === "/guide/two" ? send(401, "text/html", "<html><body>sign in</body></html>") : send(200, "text/html", page("Huge", "<p>" + "token ".repeat(30000) + "</p>"));
    if (good && ["/docs", "/developers", "/about", "/contact", "/privacy", "/pricing"].includes(p)) return send(200, "text/html", page(p.slice(1)));
    if (good && p === "/openapi.json") return send(200, "application/json", JSON.stringify(spec()));
    if ((good || bare) && p === "/.well-known/api-catalog") return send(200, "application/linkset+json", JSON.stringify({ linkset: [{ anchor: `${origin}/api/v1`, "service-desc": [{ href: `${origin}/openapi.json` }] }] }));
    if (good && p === "/.well-known/oauth-authorization-server") return send(200, "application/json", JSON.stringify({ issuer: origin, token_endpoint: `${origin}/token`, grant_types_supported: ["client_credentials"], scopes_supported: ["read:status"] }));
    if (good && p === "/token") return send(400, "application/json", JSON.stringify({ error: "invalid_request" }));
    if (good && p === "/api/v1/status") return send(200, "application/json", '{"ok":true}', { ratelimit: '"default";r=99;t=60', "ratelimit-policy": '"default";q=100;w=60' });
    if (good && p.startsWith("/api/")) return send(404, "application/problem+json", JSON.stringify({ type: "about:blank", title: "Not Found", status: 404 }));
    if (!good && !p.startsWith("/.well-known/") && !p.startsWith("/api/") && !/\.(json|ya?ml|txt|md)$/.test(p)) return send(200, "text/html", homeBad); // the app shell answers every path
    if (/^text\/markdown/.test(accept)) return send(404, "text/markdown; charset=utf-8", "# Not found\n\nTry [the sitemap](/sitemap.xml) or [llms.txt](/llms.txt).\n");
    return send(404, "text/html", "<html><body>not found</body></html>");
  }); });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => { origin = `http://127.0.0.1:${srv.address().port}`; r({ origin, close: () => srv.close() }); }));
}
async function control() {
  const fx = await Promise.all(["good", "bad", "bare"].map(fixture));
  const ms = await Promise.all(fx.map((f) => measure(f.origin))); fx.forEach((f) => f.close());
  const [sg, sb, sz] = ms.map((m) => score(grade(m))); const byId = (s) => Object.fromEntries(s.rows.map((r) => [r.id, r]));
  const [G, B, Z] = [sg, sb, sz].map(byId); const cell = (r) => String(typeof r.credit === "number" ? round1(r.credit) : r.status).padEnd(10);
  // cli-tool needs a public registry the fixture cannot be, so the good origin reads "named, not confirmed" (0.5) offline and 1 when npm answers
  const red = (id) => [B[id], Z[id]].some((r) => typeof r.credit === "number" && r.credit < G[id].credit);
  const rows = CHECKS.map(([id]) => ({ id, good: G[id], bad: B[id], bare: Z[id], ok: SEARCH.has(id) ? G[id].status === "unmeasured" : G[id].credit >= (id === "cli-tool" ? 0.5 : 1) && red(id) }));
  const failed = rows.filter((r) => !r.ok);
  if (JSON_OUT) { console.log(JSON.stringify({ scores: { good: sg.score, bad: sb.score, bare: sz.score }, rows: rows.map((r) => ({ id: r.id, ok: r.ok, good: r.good.credit, bad: r.bad.credit, bare: r.bare.credit, goodDetail: r.good.detail, badDetail: r.bad.detail, bareDetail: r.bare.detail })), failed: failed.map((r) => r.id) }, null, 2)); }
  else { console.log(`  fixtures   good ${sg.score}/100 (${sg.label}), bad ${sb.score}/100, bare ${sz.score}/100\n\n        ${"check".padEnd(27)} ${"good".padEnd(10)} ${"bad".padEnd(10)} bare`);
    for (const r of rows) console.log(`  ${r.ok ? "pass" : "FAIL"}  ${r.id.padEnd(27)} ${cell(r.good)} ${cell(r.bad)} ${cell(r.bare)}${r.ok ? "" : ` ${r.good.detail} | ${r.bad.detail}`}`);
    console.log(failed.length ? `\n  ${failed.length} check(s) read the same on every fixture; do not trust that row on a foreign origin until it passes` : "\n  every check reads green on the good origin and red on a failing one; a red row on a foreign origin is a measurement"); }
  process.exit(failed.length ? 1 : 0);
}

async function main() {
  if (CONTROL) return control();
  const origin = new URL(target).origin;
  const [m, ref] = await Promise.all([measure(origin), REFERENCE ? reference(origin) : null]);
  const result = score(grade(m));
  const out = { origin, measurable: m.homeOk || m.ladder.measurable === true, homeOk: m.homeOk, homeStatus: m.home.status || m.home.error, result, reference: ref, diff: ref && !ref.error ? diff(result, ref) : null, siblings: { ladderLevel: m.ladder.level ?? null, ladderError: m.ladder.error || null, bots: m.bots.instrument || m.bots.error || null, mcp: m.mcp.era || m.mcp.error || null } };
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2)); else print(out);
}
export { CHECKS, measure, grade, score, diff, print, fixture };
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
