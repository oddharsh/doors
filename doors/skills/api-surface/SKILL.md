---
name: api-surface
description: Build the API surface agents integrate against, the way both agent-readiness scanners grade it: an OpenAPI document generated from the routes (operationIds that are valid tool names, typed parameters and 2xx responses), an RFC 9727 api-catalog, application/problem+json errors including the 404 under the API base, live RateLimit and Retry-After headers, path versioning with Deprecation and Sunset, a parameterless GET an agent can call, developer docs linked from the homepage, onboarding stated in llms.txt (free tier, keys, sandbox), and a CLI where one is genuinely useful. Use this when a site has an API, MCP server or developer platform and is-agentic.com or agent-score reports openapi-spec, json-error-responses, api-schema-analysis, function-calling-compat, response-schema-coverage, api-error-model, api-versioning-policy, rate-limit-headers, public-api, public-api-docs, developer-portal, onboarding-friction or cli-tool, when isitagentready reports apiCatalog, or when make-agent-ready hands over an API card. Not for a site with no API: adding one only to score turns on Essentials it then fails.
---

# api-surface

On is-agentic.com, evidence of an API (an OpenAPI document, an MCP server,
OAuth metadata, a docs link) switches on three more Essentials and a dozen
Recommended checks. A site that has an API should build all of them; a site
that does not should not open the door. This skill is the build half; the
probe is `agent-score`.

## Measure first

```bash
node <plugin-root>/skills/agent-score/scripts/score.mjs https://api.example
node <plugin-root>/skills/agent-auth/scripts/auth.mjs https://api.example     # the OAuth chain, if there is one
```

## What to build, in order

1. **OpenAPI from the code.** Generate `/openapi.json` from the router or
   schema library that serves the routes, never by hand, and serve it at the
   root. Every operation gets:
   - a unique `operationId` matching `^[A-Za-z0-9_-]{1,64}$` (agents turn it
     into a tool name, and model APIs reject tool names with spaces, dots or
     slashes; 64 characters is the strictest common limit),
   - a `description`, typed `parameters`, a typed `requestBody`,
   - a typed 2xx response schema (cloudflare.com and mpp.dev both read 0%).
2. **The catalog.** `/.well-known/api-catalog` as `application/linkset+json`
   (RFC 9727): one entry per API with its `anchor`, `service-desc` (the OpenAPI
   URL), `service-doc` (the docs page) and optionally `status`. Name it from the
   homepage as `Link: </.well-known/api-catalog>; rel="api-catalog"`. This is
   also a level-4 integration on isitagentready.com.
3. **Errors as problem+json.** Every API error, including a 404 for a route
   that does not exist under the API base, answers `application/problem+json`
   (RFC 9457): `type`, `title`, `status`, `detail`, plus a stable `code` and a
   `resolution` hint an agent can act on. Declare the schema on every 4xx/5xx
   (or `default`) response in the spec. The unknown-route 404 is the one
   frameworks get wrong, because it falls through to the HTML error page.

   ```json
   {"type":"https://api.example/errors/not-found","title":"Not Found","status":404,
    "code":"route_not_found","detail":"GET /v1/widgetz is not a route.","resolution":"See /openapi.json for the routes."}
   ```
4. **Rate limits, live.** `RateLimit` and `RateLimit-Policy` (the IETF
   structured fields) on API responses and `Retry-After` on every 429, and the
   same headers declared on the spec's responses. Documented but not sent
   earns half (the reference site's open item).
5. **Versioning and retirement.** Version in the path (`/v1`) or a declared
   header, mark retiring operations `deprecated: true`, and announce removals
   with `Deprecation` and `Sunset` headers (RFC 9745, RFC 8594). A policy that
   lives only in prose on a docs page reads as partial (stripe.com, github.com).
6. **Scopes.** If the API authenticates, name OAuth scopes in the spec's
   security scheme (`read:orders`, `write:orders`) and in RFC 9728
   `scopes_supported`; an API-key-only scheme with no scopes reads as
   all-or-nothing. The chain itself (AS metadata, protected-resource metadata,
   the 401 challenge, Auth.md) is `agent-auth`. A keyless read-only API states
   that in the spec and in llms.txt instead.
7. **One call that works cold.** At least one parameterless GET in the spec
   (`/v1/status`, a list with defaults) that answers JSON without a key. A 401
   with a `WWW-Authenticate` challenge counts most of the way; a docs page with
   no reachable endpoint reads as 3/7.
8. **Docs one click from home.** `/docs` or `/developers` with authentication,
   endpoints, examples, limits and the error shape, linked from the homepage
   navigation, with the product name in its title and H1 so a name search finds
   it.
9. **Onboarding in llms.txt.** Under "When to use", say whether it is free,
   whether a key is needed and how to get one (self-serve, no sales call), and
   whether there is a sandbox or test mode. is-agentic reads this prose and
   then tries to verify it live; a zero-auth endpoint (step 7) is the strongest
   evidence there is. Say only what is true.
10. **A CLI, if one helps.** Publish on npm, PyPI or Homebrew core and put the
    install command in llms.txt. Skip it rather than ship a wrapper nobody uses.

## Traps

- **YAML only.** Ship `/openapi.json` beside any YAML; several readers,
  `agent-score` included, parse JSON only.
- **The spec's `servers` URL decides where errors are knocked.** A spec that
  says `https://api.example/v1` gets its 404 probed there; make that host
  answer problem+json too, not just the main origin.
- **An MCP server is API evidence.** If `/mcp` is the only API, the OpenAPI,
  errors and scopes Essentials still apply; describe the HTTP surface behind it
  or expect to lose about 7 points each.
- **Do not put paid routes only in prose.** A payment door (x402, MPP) is read
  from the spec's `x-payment-info`; `agent-commerce` has the shapes.

## Reference implementation

The reference site serves `/openapi.json` (OpenAPI 3.1, typed
parameters and response schemas), the api-catalog under `public/.well-known/`,
JSON errors with an `error` sentence and usually a `code`, and a keyless,
read-only API it says is keyless. Its open item is step 4: rate-limit headers
are in the spec but not on live responses.
