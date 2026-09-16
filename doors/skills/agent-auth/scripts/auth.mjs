#!/usr/bin/env node
// auth.mjs — the three documents an agent reads to learn how to get a credential
// for this origin, and whether they agree with each other:
//   RFC 8414 / OIDC     /.well-known/oauth-authorization-server, /.well-known/openid-configuration
//   RFC 9728            /.well-known/oauth-protected-resource
//   Auth.md             /auth.md plus the `agent_auth` block on the AS metadata
//
//   node auth.mjs https://example.com
//   node auth.mjs https://example.com --protected /api/orders     knock one route that should challenge
//   node auth.mjs https://example.com --json
//
// Presence is the cheap half and is all a scanner grades. What an agent actually
// depends on is the CHAIN: a protected route answers 401 with a WWW-Authenticate
// naming resource_metadata (RFC 9728 s5.1); that document names authorization
// servers; each of those serves metadata whose `issuer` is the URL it was found
// under (RFC 8414 s3.3); the token endpoint it names answers. A link in that
// chain that 404s is worse than no chain, because the agent trusts the document
// and gives up on the site. Every hop is fetched. One control: a well-known path
// that cannot exist must NOT answer 200, or an SPA catch-all is minting
// "present" for every document below. Zero dependencies.
const UA = "doors-agent-auth/0.1 (+https://github.com/oddharsh/doors)";
const args = process.argv.slice(2); const target = args.find((a) => !a.startsWith("--")); const JSON_OUT = args.includes("--json");
const protectedPath = args[args.indexOf("--protected") + 1] && args.includes("--protected") ? args[args.indexOf("--protected") + 1] : null;
if (!target) { console.error("usage: auth.mjs <origin> [--protected <path>] [--json]"); process.exit(2); }
const origin = new URL(target).origin;

async function req(u, { method = "GET", accept = "application/json, */*;q=0.5", body } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const res = await fetch(u, { method, body, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept } });
    return { status: res.status, text: await res.text(), headers: res.headers, url: res.url }; }
  catch (e) { return { status: 0, text: "", headers: new Headers(), error: e.message }; } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const isHtml = (t) => /^\s*<(!doctype|html)/i.test(t.slice(0, 300));
const same = (a, b) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };
// RFC 8414 s3: an issuer with a path component puts its metadata at /.well-known/oauth-authorization-server/<path>.
const metadataUrlFor = (issuer) => { const u = new URL(issuer); const p = u.pathname.replace(/\/$/, ""); return [`${u.origin}/.well-known/oauth-authorization-server${p}`, `${u.origin}${p}/.well-known/openid-configuration`, `${u.origin}/.well-known/openid-configuration${p}`]; };

async function readAs(issuerOrOrigin) {
  // Try RFC 8414 first, then the two OIDC spellings; report which one answered.
  for (const u of metadataUrlFor(issuerOrOrigin)) {
    const r = await req(u); if (r.status !== 200) continue;
    const d = json(r.text); if (!d || isHtml(r.text)) return { url: u, status: r.status, verdict: "present but not JSON", doc: null };
    return { url: u, status: r.status, doc: d, contentType: r.headers.get("content-type"), cors: r.headers.get("access-control-allow-origin") };
  }
  return { url: metadataUrlFor(issuerOrOrigin)[0], status: 404, doc: null };
}

async function knock(u, method = "POST") {
  // A token endpoint that exists answers a bad request with 400/401/405, never 404; a GET-only knock cannot tell those apart from a missing route.
  const r = await req(u, { method, accept: "application/json", body: method === "POST" ? "" : undefined });
  return { url: u, status: r.status || r.error, answers: r.status > 0 && r.status !== 404 && r.status < 500 };
}

async function main() {
  const [as, prm, authMd, ghost] = await Promise.all([
    readAs(origin),
    req(origin + "/.well-known/oauth-protected-resource"),
    req(origin + "/auth.md", { accept: "text/markdown, text/plain;q=0.9, */*;q=0.1" }),
    req(`${origin}/.well-known/oauth-ghost-${Date.now().toString(36)}`),
  ]);
  const out = { origin, control: {}, authorizationServer: {}, protectedResource: {}, authMd: {}, challenge: {}, chain: [] };

  // Control: a path that cannot exist must not be "present". If it answers 200 HTML, every 200 below has to be JSON to count, and the script says so.
  const catchAll = ghost.status === 200;
  out.control = { ghost: `${ghost.status || ghost.error}`, verdict: catchAll ? "FAIL: a well-known path that cannot exist answered 200 (catch-all); only responses that parse as JSON are counted below" : "pass: an absent well-known path answers " + (ghost.status || ghost.error) };

  // Authorization server metadata (RFC 8414 / OIDC discovery)
  if (!as.doc) out.authorizationServer = { verdict: as.verdict || `absent (HTTP ${as.status} at /.well-known/oauth-authorization-server and both openid-configuration spellings)` };
  else {
    const d = as.doc; const missing = [];
    if (!d.issuer) missing.push("issuer");
    const usesAuthz = !Array.isArray(d.grant_types_supported) || d.grant_types_supported.some((g) => g === "authorization_code" || g === "implicit");
    if (usesAuthz && !d.authorization_endpoint) missing.push("authorization_endpoint (required unless no grant type uses it)");
    if (!d.token_endpoint && !(Array.isArray(d.grant_types_supported) && d.grant_types_supported.every((g) => g === "implicit"))) missing.push("token_endpoint");
    if (as.url.includes("openid-configuration") && !d.jwks_uri) missing.push("jwks_uri (OIDC requires it)");
    if (usesAuthz && !Array.isArray(d.response_types_supported)) missing.push("response_types_supported");
    const issuerMatches = typeof d.issuer === "string" && same(d.issuer, as.url) && metadataUrlFor(d.issuer).includes(as.url);
    const token = d.token_endpoint ? await knock(d.token_endpoint) : null;
    const agentAuth = d.agent_auth && typeof d.agent_auth === "object" ? d.agent_auth : null;
    out.authorizationServer = {
      verdict: missing.length ? `present at ${as.url.replace(origin, "")} but missing ${missing.join(", ")}` : `present at ${as.url.replace(origin, "")}: ${d.issuer}`,
      issuer: d.issuer || null, issuerBindsToPath: issuerMatches,
      grantTypes: d.grant_types_supported || null, scopes: d.scopes_supported || null,
      tokenEndpoint: token, authorizationEndpoint: d.authorization_endpoint || null, jwksUri: d.jwks_uri || null,
      contentType: as.contentType, cors: as.cors,
      agentAuth: agentAuth ? { registerUri: agentAuth.register_uri || agentAuth.identity_endpoint || null, identityTypes: agentAuth.identity_types_supported || null, credentialTypes: agentAuth.credential_types_supported || null, skill: agentAuth.skill || null } : null,
    };
    if (!issuerMatches) out.chain.push(`AS metadata at ${as.url} carries issuer ${d.issuer}, which does not derive to that path (RFC 8414 s3.3: a client MUST reject the mismatch)`);
    if (token && !token.answers) out.chain.push(`token_endpoint ${d.token_endpoint} answers ${token.status} to a POST; an agent following this metadata dead-ends`);
    if (agentAuth?.register_uri) { const k = await knock(agentAuth.register_uri, "POST"); out.authorizationServer.agentAuth.register = k; if (!k.answers) out.chain.push(`agent_auth.register_uri ${agentAuth.register_uri} answers ${k.status}`); }
  }

  // Protected resource metadata (RFC 9728)
  const p = prm.status === 200 && !isHtml(prm.text) ? json(prm.text) : null;
  if (prm.status !== 200) out.protectedResource = { verdict: `absent (HTTP ${prm.status || prm.error})` };
  else if (!p) out.protectedResource = { verdict: "present but not JSON" + (isHtml(prm.text) ? " (HTML at the path)" : "") };
  else {
    const missing = []; if (!p.resource) missing.push("resource");
    const servers = Array.isArray(p.authorization_servers) ? p.authorization_servers : [];
    const resolved = await Promise.all(servers.slice(0, 4).map(async (iss) => { const m = await readAs(iss); return { issuer: iss, metadata: m.url, status: m.status, issuerAgrees: Boolean(m.doc && typeof m.doc.issuer === "string" && m.doc.issuer.replace(/\/$/, "") === String(iss).replace(/\/$/, "")) }; }));
    const asScopes = out.authorizationServer.scopes; const prmScopes = Array.isArray(p.scopes_supported) ? p.scopes_supported : null;
    const scopeGap = asScopes && prmScopes ? prmScopes.filter((s) => !asScopes.includes(s)) : [];
    out.protectedResource = {
      verdict: missing.length ? `present but missing ${missing.join(", ")}` : `present: ${p.resource}${servers.length ? `, ${servers.length} authorization server${servers.length === 1 ? "" : "s"}` : ", names no authorization server"}`,
      resource: p.resource || null, resourceIsThisOrigin: typeof p.resource === "string" && same(p.resource, origin),
      authorizationServers: resolved, scopes: prmScopes, bearerMethods: p.bearer_methods_supported || null, documentation: p.resource_documentation || null,
      contentType: prm.headers.get("content-type"), cors: prm.headers.get("access-control-allow-origin"), scopesNotOnAs: scopeGap,
    };
    for (const r of resolved) if (r.status !== 200) out.chain.push(`authorization server ${r.issuer} named by the PRM serves no metadata (HTTP ${r.status})`); else if (!r.issuerAgrees) out.chain.push(`authorization server ${r.issuer}: its metadata carries a different issuer`);
    if (scopeGap.length) out.chain.push(`PRM lists scope(s) the AS does not: ${scopeGap.join(", ")}`);
    if (p.resource && !same(p.resource, origin)) out.chain.push(`PRM resource ${p.resource} is not this origin; if that is deliberate the route that challenges should say so`);
  }

  // Auth.md
  const md = authMd.status === 200 && !isHtml(authMd.text) ? authMd.text : null;
  if (!md) out.authMd = { verdict: authMd.status === 200 ? "present but HTML (catch-all or a rendered page, not the document)" : `absent (HTTP ${authMd.status || authMd.error})` };
  else {
    const markers = { discovery: /oauth-protected-resource|oauth-authorization-server|openid-configuration/i.test(md), register: /regist(er|ration)/i.test(md), credential: /bearer|token|credential/i.test(md), scopes: /scope/i.test(md) };
    const hits = Object.values(markers).filter(Boolean).length;
    const skillPointsHere = out.authorizationServer.agentAuth?.skill ? same(out.authorizationServer.agentAuth.skill, origin) && /\/auth\.md$/.test(out.authorizationServer.agentAuth.skill) : null;
    out.authMd = { verdict: `present, ${authMd.text.length} bytes, ${hits} of 4 markers (${Object.entries(markers).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"})`, contentType: authMd.headers.get("content-type"), markers, agentAuthPointsHere: skillPointsHere };
    if (!markers.discovery) out.chain.push("auth.md never names the well-known metadata an agent should fetch next");
    if (skillPointsHere === false) out.chain.push(`agent_auth.skill points at ${out.authorizationServer.agentAuth.skill}, not this auth.md`);
  }

  // The challenge, which is where a real client enters the chain: 401 + WWW-Authenticate: Bearer resource_metadata="...".
  if (protectedPath) {
    const r = await req(origin + protectedPath, { accept: "application/json" });
    const wa = r.headers.get("www-authenticate") || "";
    const rm = /resource_metadata="([^"]+)"/i.exec(wa)?.[1] || null;
    out.challenge = { path: protectedPath, status: r.status, wwwAuthenticate: wa || null, resourceMetadata: rm,
      verdict: r.status === 401 && rm ? `401 naming resource_metadata (${rm})` : r.status === 401 ? "401 but WWW-Authenticate names no resource_metadata (RFC 9728 s5.1); an agent has to guess the well-known path" : r.status === 200 ? "200 without a credential: that route is not protected" : `HTTP ${r.status || r.error}, no Bearer challenge` };
    if (rm && !same(rm, origin) && !out.protectedResource.authorizationServers) out.chain.push(`challenge points at ${rm}, off this origin`);
  } else out.challenge = { verdict: "not knocked (pass --protected <path> to test the route that should answer 401 with resource_metadata)" };

  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${origin}\n`);
  console.log(`  control        ${out.control.verdict}`);
  console.log(`  AS metadata    ${out.authorizationServer.verdict}`);
  if (out.authorizationServer.grantTypes) console.log(`                 grants ${out.authorizationServer.grantTypes.join(", ")}; token endpoint ${out.authorizationServer.tokenEndpoint ? `answers ${out.authorizationServer.tokenEndpoint.status}` : "not named"}${out.authorizationServer.cors ? "; CORS " + out.authorizationServer.cors : "; no CORS header"}`);
  if (out.authorizationServer.agentAuth) console.log(`                 agent_auth: register ${out.authorizationServer.agentAuth.registerUri || "(none)"}${out.authorizationServer.agentAuth.register ? ` (answers ${out.authorizationServer.agentAuth.register.status})` : ""}; identities ${(out.authorizationServer.agentAuth.identityTypes || []).join(", ") || "(none)"}`);
  console.log(`  PRM            ${out.protectedResource.verdict}`);
  for (const s of out.protectedResource.authorizationServers || []) console.log(`                 ${s.issuer}  metadata ${s.status}${s.status === 200 ? (s.issuerAgrees ? ", issuer agrees" : ", ISSUER DISAGREES") : ""}`);
  if (out.protectedResource.scopes) console.log(`                 scopes ${out.protectedResource.scopes.join(", ")}`);
  console.log(`  auth.md        ${out.authMd.verdict}`);
  console.log(`  challenge      ${out.challenge.verdict}`);
  console.log(`\n  chain          ${out.chain.length ? "" : "every hop answers"}`);
  for (const c of out.chain) console.log(`                 ! ${c}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
