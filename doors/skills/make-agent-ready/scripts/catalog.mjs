// catalog.mjs: what to build so a site scores well on both agent-readiness
// scanners, one card per thing a site owner builds. Each card names the
// checks it closes on isitagentready.com (Cloudflare, `cf`, the 22 ids in
// agent-readiness/scripts/ladder.mjs) and is-agentic.com (Vercel/Ora, `ia`, the
// 36 ids in agent-score/scripts/score.mjs), says how much it matters per site
// type, gives the steps a coding agent follows and the commands that prove the
// change shipped. Folded from Cloudflare's 24 published fix skills
// (isitagentready.com/.well-known/agent-skills/, read 2026-10-16), the
// recommendation text on 41 is-agentic reports, Vercel's own is-agentic skill,
// and what the doors probes learned on live origins.
//
// Types: content (a personal site, blog, portfolio or documentation read as
// prose), business (a company or marketing site), app (hosted software, an API,
// a developer platform), store (sells things). `do` = build it; `optional` =
// worth it once the `do` list is done; `skip` = not relevant, and building it
// anyway can cost points (see the `mcp` and `openapi` cards).
//
// `$ORIGIN` in a verify command is replaced with the origin being planned.

export const TYPES = ["content", "business", "app", "store"];
export const ALIASES = { personal: "content", blog: "content", docs: "content", portfolio: "content", company: "business", marketing: "business", api: "app", saas: "app", devtools: "app", shop: "store", commerce: "store" };

// Cloudflare's ladder rungs: a check on a lower rung blocks every level above it.
export const CF_RUNG = { robotsTxt: 1, sitemap: 1, linkHeaders: 1, robotsTxtAiRules: 2, contentSignals: 2, markdownNegotiation: 3, mcpServerCard: 4, a2aAgentCard: 4, agentSkills: 4, apiCatalog: 4, webBotAuth: 5, oauthDiscovery: 5, authMd: 5 };
// is-agentic essential ids (the rest of `ia` are recommended); the 80-point pool is split among however many essentials a site is charged for.
export const IA_ESSENTIAL = new Set(["content-no-js", "agent-friendly-404", "markdown-negotiation-vary", "agent-crawler-reachability", "redirect-hygiene", "docs-auth-gate", "openapi-spec", "scoped-permissions", "json-error-responses", "oauth-support", "mcp-resource-listing", "mcp-view-domain", "mcp-view-csp"]);
// Essentials that count only once a feature exists (resources advertised, an MCP App declared): doing it right earns nothing new, doing it wrong costs.
export const IA_CONDITIONAL = new Set(["mcp-resource-listing", "mcp-view-domain", "mcp-view-csp"]);
// What each Cloudflare rung needs, for the brief's labels.
export const CF_RUNG_NEED = { 1: "level 1 (two of robots.txt, sitemap, Link headers)", 2: "level 2", 3: "level 3", 4: "level 4 (any one of four integrations)", 5: "level 5 (two of three)" };
// How many checks each type is typically charged for on is-agentic (from the 41 reports): an essential is worth 80/E points, a recommended 20/R.
export const IA_POOL = { content: { E: 6, R: 9 }, business: { E: 6, R: 9 }, app: { E: 11, R: 22 }, store: { E: 10, R: 18 } };

export const RULES = [
  "Never advertise a door you do not serve. A card, catalog entry, Link header or DNS record that points at nothing passes a presence check and breaks the first agent that trusts it.",
  "Do not open a door you will not finish. On is-agentic, an MCP server, an OpenAPI document, OAuth metadata or a developer portal is evidence of an API, and evidence turns on the API checks: OpenAPI, scoped permissions and JSON errors become Essential, each worth about 7 points. A content site that adds /mcp and stops there loses points.",
  "Keep every claim true. Describe the site as it is (a Person, not an invented Organization; no sandbox you do not run). Both scanners read prose and structured data, and a false claim is a defect an agent acts on.",
  "Essentials first. On is-agentic one Essential is worth 7 to 13 points and one Recommended at most 2.5; on Cloudflare a lower rung blocks every level above it.",
  "Prove each change from the outside. Every card ends with commands; run them against the deployed origin, then re-run the plan. is-agentic refreshes a report only when it is older than 6 hours, so use Rescan on the report page before reading their number.",
];

export const CARDS = [
  {
    id: "site-type", title: "Declare the site type", skill: "make-agent-ready", cf: [], ia: [], first: true,
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "is-agentic opens a report on the lens for the declared type, so readers see the checks that matter for this site first. It changes no points and costs one tag.",
    do: [
      "Add exactly one <meta name=\"is-agentic-site-type\" content=\"TYPE\"> to the homepage <head>, where TYPE is content, business, app or store (is-agentic's own four values).",
    ],
    verify: ["curl -s $ORIGIN/ | grep -o 'is-agentic-site-type[^>]*'"],
  },
  {
    id: "rendered-text", title: "Put the content in the HTML", skill: "page-basics", cf: [], ia: ["content-no-js", "content-efficiency"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "Most agents never run JavaScript. A shell that renders client-side reads as an empty page, and this is the single largest Essential on is-agentic.",
    do: [
      "Server-render (or prerender) the homepage and every content page so the raw HTML carries at least 500 characters of real text.",
      "Give each page one <h1>, as the first heading, and step down one level at a time (h1, h2, h3); no skipped levels and no page that is all one level.",
      "Keep readable text at 5% or more of the HTML: move hydration blobs, inline styles and wrapper nesting out of the page.",
    ],
    verify: [
      "curl -s $ORIGIN/ | sed -e 's/<script[^>]*>.*<\\/script>//g' -e 's/<[^>]*>//g' | tr -s ' \\n' | wc -c   # over 500",
      "curl -s $ORIGIN/ | grep -o '<h[1-6]' | head -5   # <h1 first",
    ],
  },
  {
    id: "real-404", title: "Answer unknown paths with a real 404", skill: "page-basics", cf: [], ia: ["agent-friendly-404"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "An app shell that answers 200 for every path tells an agent every guess exists. Half the credit is the status; the other half is a Markdown body that says where to look.",
    do: [
      "Return 404 (or 410) for any path that has no page. An SPA must do this at the server or edge, not in the client router.",
      "When the request carries Accept: text/markdown, answer the 404 with Content-Type: text/markdown and a few lines linking /sitemap.xml, /llms.txt and the docs or home page.",
    ],
    verify: [
      "curl -s -o /dev/null -w '%{http_code}\\n' $ORIGIN/no-such-page-xyz   # 404",
      "curl -s -i -H 'Accept: text/markdown' $ORIGIN/no-such-page-xyz | grep -i '^content-type'   # text/markdown",
    ],
  },
  {
    id: "http-redirects", title: "Redirect with HTTP, not in the page", skill: "page-basics", cf: [], ia: ["redirect-hygiene"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "A non-JS agent never runs location.href or waits for a meta refresh; it sees the stub page and stops.",
    do: [
      "Replace every <meta http-equiv=\"refresh\"> and JavaScript redirect with a 301 or 308 (permanent) or 302/307 (temporary) from the server or edge.",
      "Keep chains to one or two hops: apex to www (or back) and http to https in one step.",
    ],
    verify: ["curl -sI $ORIGIN/ | grep -i '^location' || echo 'no redirect on /'", "grep -rl 'http-equiv=\"refresh\"' <build-output-dir> || echo 'no meta refresh'"],
  },
  {
    id: "no-login-walls", title: "Keep content pages public", skill: "page-basics", cf: [], ia: ["docs-auth-gate"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "An agent cannot complete a login while browsing, so a gated page is a page it cannot cite.",
    do: [
      "Serve documentation, help and content pages without a login. If something must stay gated, publish a public summary page that says what it covers and how to get access.",
    ],
    verify: ["curl -s -o /dev/null -w '%{http_code}\\n' $ORIGIN/docs   # 200, not 401/403"],
  },
  {
    id: "page-size", title: "Keep pages under an agent's context budget", skill: "page-basics", cf: [], ia: ["page-token-budget"],
    types: { content: "do", business: "optional", app: "do", store: "optional" },
    why: "A page over about 100K characters of text (~25K tokens) gets truncated by the agent reading it.",
    do: ["Split long reference pages into focused pages and link them from an index page and from llms.txt."],
    verify: ["curl -s $ORIGIN/<longest-page> | sed 's/<[^>]*>//g' | wc -c   # under 100000"],
  },
  {
    id: "head-metadata", title: "Fill in the four head signals", skill: "page-basics", cf: [], ia: ["metadata-completeness"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "Agents use these to resolve which entity a page belongs to and how to cite it.",
    do: [
      "On the homepage (and ideally every page): <html lang=\"en\">, <link rel=\"canonical\" href=\"https://the.origin/path\">, <meta property=\"og:type\" content=\"website\"> (article on posts), <meta property=\"og:image\" content=\"https://.../og.png\">.",
    ],
    verify: ["curl -s $ORIGIN/ | grep -Eo '<html[^>]*lang=|rel=\"?canonical|og:image|og:type' | sort -u   # four lines"],
  },
  {
    id: "identity-json-ld", title: "Say who the site is in JSON-LD", skill: "page-basics", cf: [], ia: ["json-ld", "org-schema-completeness"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "One JSON-LD block lets an agent parse the site's identity instead of guessing from prose. is-agentic also asks an Organization for a contactPoint and an address.",
    do: [
      "Add one <script type=\"application/ld+json\"> on the homepage with the type the site really is: Person for a personal site, Organization (or LocalBusiness) for a company, SoftwareApplication for a product, with name, url, description, and sameAs for owned profiles.",
      "If the site's publisher is an organization, give that Organization node a contactPoint (email or telephone, contactType) and an address (PostalAddress; a city and country is enough when there is no public street address).",
      "A personal site describes a Person. Do not invent an Organization to pass the completeness check; it is 2.5 points at most and a false identity is worse.",
    ],
    verify: ["curl -s $ORIGIN/ | grep -o 'application/ld+json' | wc -l   # 1 or more", "curl -s $ORIGIN/ | grep -o '\"@type\":\"[A-Za-z]*\"' | sort -u"],
  },
  {
    id: "trust-pages", title: "Publish about, contact and privacy pages", skill: "page-basics", cf: [], ia: ["trust-anchors"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "These are the pages an agent reads to decide whether a site is legitimate before recommending it.",
    do: [
      "Serve /about, /contact and /privacy as real pages with 500+ characters each, linked from the homepage. A privacy page is honest on a site that collects nothing: say so, and say what the server logs.",
    ],
    verify: ["for p in about contact privacy; do curl -s -o /dev/null -w \"$p %{http_code}\\n\" $ORIGIN/$p; done   # 200 each"],
  },
  {
    id: "crawler-policy", title: "State a crawler policy, and make the edge agree", skill: "crawler-policy",
    cf: ["robotsTxt", "robotsTxtAiRules", "contentSignals"], ia: ["agent-crawler-reachability"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "Cloudflare's level 1 needs robots.txt and level 2 needs AI rules plus Content-Signal. is-agentic charges an Essential when the WAF refuses the agents that fetch on a user's behalf.",
    do: [
      "Ask the owner one question: may AI search, AI answers and AI training use the site? Write the answer, do not assume it.",
      "Serve /robots.txt (text/plain, 200) with a Sitemap: line and a group per decision. Name the three classes explicitly: search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot), training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot), and user-triggered fetchers (ChatGPT-User, Claude-User, Perplexity-User). A lone User-agent: * group passes Cloudflare's check but cannot treat search and training differently.",
      "Add Content-Signal: search=yes, ai-input=yes, ai-train=no (or the owner's answer) inside the groups, declaring all three keys.",
      "Make the edge agree: if a WAF, bot-fight mode or rate rule refuses ChatGPT-User, Claude-User or PerplexityBot, either allow them or say no in robots.txt as well. A refusal robots.txt does not mention is invisible to a polite crawler.",
    ],
    verify: ["curl -s $ORIGIN/robots.txt | grep -Ei '^(user-agent|content-signal|sitemap)'", "node <plugin-root>/skills/crawler-policy/scripts/bot-views.mjs $ORIGIN   # every agent row 200 unless the policy says otherwise"],
  },
  {
    id: "sitemap", title: "Publish a sitemap and name it in robots.txt", skill: "discovery-files", cf: ["sitemap"], ia: ["sitemap"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "Counted on both: one of Cloudflare's level-1 trio, and a Recommended check on is-agentic.",
    do: ["Serve /sitemap.xml (a urlset, or a sitemapindex) listing canonical same-origin URLs with lastmod, generated at build time, and add Sitemap: https://the.origin/sitemap.xml to robots.txt."],
    verify: ["curl -s $ORIGIN/sitemap.xml | head -c 300", "node <plugin-root>/skills/discovery-files/scripts/sweep.mjs $ORIGIN   # no broken advertised URL"],
  },
  {
    id: "llms-txt", title: "Write llms.txt with a when-to-use section", skill: "discovery-files", cf: [], ia: ["agent-instruction", "onboarding-friction"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "is-agentic looks for guidance on when an agent should reach for the site, and reads the same prose for onboarding claims (free tier, keys, sandbox).",
    do: [
      "Serve /llms.txt as text/plain: an H1 with the site name, a one-paragraph summary in a > blockquote, then sections of links with one-line descriptions.",
      "Add a '## When to use this site' section naming the concrete jobs the site is right for and the door to call for each (page, .md twin, endpoint or tool). Specific jobs, not marketing copy.",
      "If the site has an API, say in the same section whether it is free, whether a key is needed and how to get one, and whether there is a sandbox or test mode. If nothing needs a key, say that; it is the best onboarding there is.",
      "Link /llms-full.txt if you generate one, and give big sections their own <section>/llms.txt.",
    ],
    verify: ["curl -s $ORIGIN/llms.txt | grep -n '^#'   # H1, then sections including When to use", "node <plugin-root>/skills/discovery-files/scripts/sweep.mjs $ORIGIN"],
  },
  {
    id: "link-headers", title: "Send Link headers that point agents at the machine doors", skill: "discovery-files", cf: ["linkHeaders"], ia: [],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "One of Cloudflare's level-1 trio, and the cheapest of the three: one header on the homepage response.",
    do: [
      "On the homepage response, send Link values with registered relations for what exists: </llms.txt>; rel=\"describedby\"; type=\"text/plain\" and </index.md>; rel=\"alternate\"; type=\"text/markdown\" for any site; </.well-known/api-catalog>; rel=\"api-catalog\", </openapi.json>; rel=\"service-desc\" and </docs>; rel=\"service-doc\" when an API exists.",
      "On Cloudflare a Transform Rule or the Worker adds them without touching the origin.",
    ],
    verify: ["curl -sI $ORIGIN/ | grep -i '^link'"],
  },
  {
    id: "markdown-negotiation", title: "Negotiate Markdown at every page URL", skill: "markdown-twins", cf: ["markdownNegotiation"], ia: ["markdown-negotiation-vary"],
    types: { content: "do", business: "do", app: "do", store: "do" },
    why: "Cloudflare's level 3 and an Essential on is-agentic. Both send a bare Accept: text/markdown, so pass that, then make it work for the clients that tie text/markdown and text/html at q=1.",
    do: [
      "Generate a .md twin of every page at build time and answer Accept: text/markdown at the page's own URL with Content-Type: text/markdown and Vary: Accept. HTML stays the default.",
      "Break ties in Markdown's favour when text/markdown is listed first at equal q (Claude Code, Copilot CLI and Microsoft Copilot send exactly that), and answer 406 only when every offered type is refused.",
      "Optionally send x-markdown-tokens with the twin's token count.",
      "On a Cloudflare zone, Markdown for Agents does the conversion at the edge with no code; still run the replay, because the edge passes the bare header and can lose the tie.",
    ],
    verify: ["curl -s -i -H 'Accept: text/markdown' $ORIGIN/ | grep -Ei '^(content-type|vary)'   # text/markdown, Vary: Accept", "node <plugin-root>/skills/markdown-twins/scripts/replay.mjs $ORIGIN   # 7 of 7"],
  },
  {
    id: "agent-skills-index", title: "Publish an Agent Skills index", skill: "skills-index", cf: ["agentSkills"], ia: [],
    types: { content: "optional", business: "optional", app: "do", store: "optional" },
    why: "One of the four integrations that lift Cloudflare to level 4. For a site with no API it is the honest way there: a skill that teaches an agent how to read the site (where the twins are, how to search, what to cite), and it does not count as API evidence on is-agentic.",
    do: [
      "Write one SKILL.md with frontmatter (name, description) that teaches an agent a real job on this site, serve it under /.well-known/agent-skills/<name>/SKILL.md, and publish /.well-known/agent-skills/index.json ($schema 0.2.0, skills[] with name, type skill-md, description, url, digest sha256 of the served bytes).",
      "Generate the index from the files the build ships and check it in CI, so a digest cannot drift from the bytes.",
    ],
    verify: ["node <plugin-root>/skills/skills-index/scripts/verify.mjs $ORIGIN   # every digest verifies"],
  },
  {
    id: "ard", title: "Publish an ARD manifest of the agentic resources", skill: "discovery-files", cf: ["ard"], ia: [],
    types: { content: "optional", business: "optional", app: "do", store: "optional" },
    why: "Lets a registry index every agent-facing door from one file. Cloudflare grades it (outside the ladder); only worth it once there are two or more resources to list.",
    do: [
      "Serve /.well-known/ai-catalog.json (application/json, 200, Access-Control-Allow-Origin: *) with specVersion, a host {displayName, identifier}, and entries[] each with identifier urn:air:<host>:<kind>:<name>, displayName, type (a media type such as application/mcp-server-card+json), exactly one of url or data, and 2-5 representativeQueries.",
      "Point at it from robots.txt (Agentmap: https://the.origin/.well-known/ai-catalog.json) if it lives elsewhere.",
    ],
    verify: ["curl -s -i $ORIGIN/.well-known/ai-catalog.json | grep -Ei '^(content-type|access-control-allow-origin)'"],
  },
  {
    id: "agent-card", title: "Publish an A2A agent card for the doors that exist", skill: "agent-identity", cf: ["a2aAgentCard"], ia: [],
    types: { content: "skip", business: "optional", app: "optional", store: "optional" },
    why: "A level-4 integration on Cloudflare. A card describes interfaces, so it only makes sense when the site has an MCP server, an A2A endpoint or an HTTP API to describe.",
    do: [
      "Serve /.well-known/agent-card.json with name, version, description, provider, supportedInterfaces (each a URL with its protocol binding) and skills (id, name, description each). Generate it from the same registry as the server, and make every URL in it answer.",
    ],
    verify: ["node <plugin-root>/skills/agent-identity/scripts/identity.mjs $ORIGIN   # every declared interface answers"],
  },
  {
    id: "mcp", title: "Serve MCP, and finish it", skill: "mcp-doors", cf: ["mcpServerCard"], ia: ["mcp-server", "mcp-resource-listing", "mcp-view-domain", "mcp-view-csp"],
    types: { content: "skip", business: "optional", app: "do", store: "optional" },
    why: "A level-4 integration on Cloudflare and up to six points' worth of a Recommended check on is-agentic. It is also API evidence: once /mcp answers, is-agentic charges the site for OpenAPI, scopes and JSON errors as Essentials. Build it only with the api-surface cards behind it.",
    do: [
      "Serve Streamable HTTP MCP at /mcp speaking the 2026-07-28 revision and the legacy ones on one endpoint, with a public tools/list (an OAuth-locked server earns five of six).",
      "Generate /.well-known/mcp/server-card.json from tools/list (serverInfo name and version, the transport endpoint, capabilities) and test the two equal in CI.",
      "Advertise the resources capability only if resources/list returns something; a tool-only server omits it.",
      "If a tool names an MCP App view (_meta.ui.resourceUri), serve that ui:// resource as HTML with no login form and declare _meta.ui.csp with named connectDomains and resourceDomains.",
    ],
    verify: ["node <plugin-root>/skills/mcp-doors/scripts/conform.mjs $ORIGIN   # era, tools, card matches"],
  },
  {
    id: "webmcp", title: "Register WebMCP tools in the page", skill: "mcp-doors", cf: ["webMcp"], ia: [],
    types: { content: "optional", business: "optional", app: "optional", store: "do" },
    why: "Lets a browser agent call the site's own actions (search, filter, add to cart) instead of driving the UI. Cloudflare grades it by loading the page in a browser.",
    do: [
      "On page load, feature-detect document.modelContext (fall back to navigator.modelContext) and call registerTool({ name, description, inputSchema, execute }) for each real action; pass an AbortController signal to unregister.",
      "For existing forms, add toolname and tooldescription to the <form> and toolparamdescription to its inputs to expose them declaratively.",
    ],
    verify: ["curl -s $ORIGIN/ | grep -Eo 'modelContext|toolname' | sort -u   # a static hint; a browser run settles it"],
  },
  {
    id: "openapi", title: "Publish an OpenAPI document and an API catalog", skill: "api-surface", cf: ["apiCatalog"], ia: ["openapi-spec", "api-schema-analysis", "function-calling-compat", "response-schema-coverage"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "An Essential on is-agentic for any site with an API, three Recommended checks read from it, and the api-catalog is a level-4 integration on Cloudflare.",
    do: [
      "Generate /openapi.json from the code that serves the routes (JSON; YAML can ship beside it). Every operation: a unique operationId matching ^[A-Za-z0-9_-]{1,64}$ (it becomes a tool name), a description, typed parameters, a typed request body, and a typed 2xx response schema.",
      "Serve /.well-known/api-catalog as application/linkset+json (RFC 9727): one linkset entry per API with its anchor, service-desc (the OpenAPI URL), service-doc (the docs page) and optionally status.",
    ],
    verify: ["curl -s $ORIGIN/openapi.json | head -c 200", "curl -s -i $ORIGIN/.well-known/api-catalog | grep -i '^content-type'   # application/linkset+json"],
  },
  {
    id: "api-errors", title: "Return errors as problem+json", skill: "api-surface", cf: [], ia: ["json-error-responses", "api-error-model"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "An Essential once an API is in evidence: an agent cannot parse an HTML error page, including the 404 for a route that does not exist.",
    do: [
      "Answer every API error, 404 under the API base included, with Content-Type: application/problem+json (RFC 9457): type, title, status, detail, and a stable code plus a resolution hint.",
      "Declare that schema on every operation's 4xx/5xx (or default) response in the OpenAPI document.",
    ],
    verify: ["curl -s -i $ORIGIN/api/no-such-route | grep -i '^content-type'   # application/problem+json"],
  },
  {
    id: "api-limits-versions", title: "Send rate-limit headers and declare versioning", skill: "api-surface", cf: [], ia: ["rate-limit-headers", "api-versioning-policy"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "Agents self-throttle on headers they can read and avoid integrating against a surface that can change without notice.",
    do: [
      "Send RateLimit and RateLimit-Policy (the IETF structured fields) on API responses, Retry-After on every 429, and document both in the OpenAPI response headers. Documented but not sent earns half.",
      "Version in the path (/v1) or a header, mark retiring operations deprecated: true, and announce removals with Deprecation and Sunset headers (RFC 9745, RFC 8594).",
    ],
    verify: ["curl -s -D - -o /dev/null $ORIGIN/api/v1/<a-cheap-get> | grep -i ratelimit"],
  },
  {
    id: "scoped-auth", title: "Publish OAuth metadata with named scopes", skill: "agent-auth",
    cf: ["oauthDiscovery", "oauthProtectedResource", "authMd"], ia: ["scoped-permissions", "oauth-support"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "Scoped permissions is an Essential on is-agentic for any API; auth metadata is one of the three ways to Cloudflare's level 5. Skip it for a keyless, read-only API, and say in llms.txt and the OpenAPI that no auth exists.",
    do: [
      "Serve /.well-known/oauth-authorization-server (issuer equal to the URL it was found under, authorization_endpoint, token_endpoint that answers, jwks_uri, grant_types_supported, response_types_supported, scopes_supported).",
      "Serve /.well-known/oauth-protected-resource (resource, authorization_servers, scopes_supported, bearer_methods_supported: [header]) and name it from every 401 as WWW-Authenticate: Bearer resource_metadata=\"...\".",
      "Name OAuth scopes in the OpenAPI security schemes (read:x, write:x), so an agent can ask for least privilege.",
      "For agent registration, serve /auth.md (an H1 containing auth.md) and an agent_auth block (skill, register_uri, a registration method) on the AS metadata.",
    ],
    verify: ["node <plugin-root>/skills/agent-auth/scripts/auth.mjs $ORIGIN   # every hop answers"],
  },
  {
    id: "developer-docs", title: "Link developer docs from the homepage", skill: "api-surface", cf: [], ia: ["public-api-docs", "developer-portal", "agentic-search-specific"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "is-agentic looks for docs one click from the homepage and for developer pages that a name search can find.",
    do: [
      "Serve /docs (or /developers) with authentication, endpoints, examples, limits and the error shape, linked from the homepage navigation.",
      "Put the product name in the <title> and H1 of the docs, OpenAPI and MCP pages, and list them in llms.txt.",
    ],
    verify: ["curl -s $ORIGIN/ | grep -Eo 'href=\"[^\"]*(docs|developers)[^\"]*\"' | head -3"],
  },
  {
    id: "reachable-api", title: "Expose one call an agent can make without help", skill: "api-surface", cf: [], ia: ["public-api", "onboarding-friction"],
    types: { content: "skip", business: "skip", app: "do", store: "optional" },
    why: "A live endpoint is the difference between 'described in docs' (3/7) and verified, and a zero-auth read is the strongest onboarding signal is-agentic sees.",
    do: [
      "Make at least one GET in the OpenAPI document callable without parameters (a status, a list, a search with defaults), answering JSON; a 401 with a WWW-Authenticate challenge is a locked door and still counts most of the way.",
      "Offer a free tier or keyless reads, self-serve key creation and a sandbox or test mode, and say each in llms.txt (llms-txt card).",
    ],
    verify: ["curl -s -o /dev/null -w '%{http_code} %{content_type}\\n' $ORIGIN/api/v1/<parameterless-get>"],
  },
  {
    id: "cli", title: "Publish a CLI and name its install command", skill: "api-surface", cf: [], ia: ["cli-tool"],
    types: { content: "skip", business: "skip", app: "optional", store: "skip" },
    why: "A Recommended check for any developer surface. Worth doing when a CLI is genuinely useful; do not publish a wrapper only for the check.",
    do: ["Publish it on npm, PyPI or Homebrew core, and put the install command (npx name, pip install name, brew install name) in llms.txt and the docs."],
    verify: ["curl -s $ORIGIN/llms.txt | grep -Ei 'npx |pip install|brew install'"],
  },
  {
    id: "pricing", title: "Make pricing readable", skill: "page-basics", cf: [], ia: ["pricing-info"],
    types: { content: "skip", business: "optional", app: "do", store: "do" },
    why: "Counted for a product or a store: an agent comparing options needs the price without scraping a marketing page.",
    do: ["Link a /pricing page from the homepage, or carry schema.org Offer (price, priceCurrency) in the JSON-LD; a store does both on product pages."],
    verify: ["curl -s -o /dev/null -w '%{http_code}\\n' $ORIGIN/pricing"],
  },
  {
    id: "commerce", title: "Open the commerce doors that match what is sold", skill: "agent-commerce", cf: ["ucp", "acp", "x402", "mpp", "ap2"], ia: [],
    types: { content: "skip", business: "skip", app: "optional", store: "do" },
    why: "Cloudflare grades five commerce checks for any origin that sells. A store wants a checkout door (UCP or ACP); a paid API wants a payment door (x402 or MPP).",
    do: [
      "A store: serve /.well-known/ucp (ucp.version, services, capabilities, payment_handlers) or /.well-known/acp.json (protocol {name: acp, version}, api_base_url, transports, capabilities.services), every referenced URL reachable.",
      "A paid API: answer 402 with PAYMENT-REQUIRED (x402 v2) and/or WWW-Authenticate: Payment (MPP), and list the paid routes in /openapi.json with x-payment-info offers[] (intent, method, amount, currency).",
      "Delegated purchase: declare AP2 under capabilities.extensions on the agent card.",
    ],
    verify: ["node <plugin-root>/skills/agent-commerce/scripts/commerce.mjs $ORIGIN"],
  },
  {
    id: "dns-aid", title: "Publish a DNS-AID record", skill: "agent-identity", cf: ["dnsAid"], ia: [],
    types: { content: "optional", business: "optional", app: "optional", store: "optional" },
    why: "Graded by Cloudflare outside the ladder and counted as an emerging signal on is-agentic. Cheap if the zone is already DNSSEC-signed.",
    do: ["Publish _index._agents.<host> SVCB 1 <host>. alpn=\"h2,h3\" port=443 mandatory=alpn,port in a DNSSEC-signed zone. Publish _a2a or _mcp only for a server that exists."],
    verify: ["curl -s -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=_index._agents.<host>&type=SVCB&do=1'   # an answer, AD true"],
  },
  {
    id: "web-bot-auth", title: "Sign your own crawler's requests", skill: "agent-identity", cf: ["webBotAuth"], ia: [],
    types: { content: "skip", business: "skip", app: "optional", store: "skip" },
    why: "Only for a site that runs its own crawler or agent. Cloudflare treats it as informational, and it is one of the three ways to level 5.",
    do: ["Publish a JWK Set at /.well-known/http-message-signatures-directory with kid equal to each key's RFC 7638 thumbprint, and sign outbound requests with Signature-Input, Signature and Signature-Agent per RFC 9421."],
    verify: ["node <plugin-root>/skills/agent-identity/scripts/identity.mjs $ORIGIN"],
  },
  {
    id: "brand-search", title: "Make the brand findable by name", skill: "page-basics", cf: [], ia: ["brand-search-accuracy"],
    types: { content: "optional", business: "do", app: "do", store: "do" },
    why: "is-agentic runs a web search for the brand plus its main product. Markup helps at the margin; the rest is search, so treat a partial as a sample, not a defect.",
    do: ["Put the brand and the main product term in the homepage <title> and H1 (\"Acme payments API\", not \"Welcome\"), and avoid redirect chains that mask the canonical domain."],
    verify: ["curl -s $ORIGIN/ | grep -Eo '<title>[^<]*'"],
  },
];
