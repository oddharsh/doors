# The five commerce protocols, on the wire

What each one is, the exact document or header a client reads, a minimal valid
example, and where the spec lives. Every field name below was read from the
spec or measured from a live implementation on 2026-09-16; where the two
disagreed, the live one is noted.

## UCP, Universal Commerce Protocol (Google; ucp.dev)

**Reads:** `GET /.well-known/ucp`, `application/json`.

```json
{
  "ucp": {
    "version": "2026-08-25",
    "services": {
      "dev.ucp.shopping": [{
        "version": "2026-08-25",
        "spec": "https://ucp.dev/2026-08-25/specification/overview/",
        "transport": "rest",
        "endpoint": "https://store.example/ucp/v1",
        "schema": "https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json"
      }]
    },
    "capabilities": {
      "dev.ucp.shopping.checkout": [{ "version": "2026-08-25", "spec": "https://ucp.dev/2026-08-25/specification/shopping/checkout/", "schema": "https://ucp.dev/2026-08-25/services/shopping/checkout.json" }]
    },
    "payment_handlers": {}
  }
}
```

Required: `ucp.version` (YYYY-MM-DD), `ucp.services`, `ucp.payment_handlers`
(both may be empty objects). Optional: `ucp.capabilities`, top-level `keys[]`
(a JWK Set for HTTP message signatures on webhooks), `ucp.supported_versions`
(older version to profile URL). Transports: `rest` (needs `schema` + `endpoint`),
`mcp` (OpenRPC `schema` + `endpoint`), `a2a` (`endpoint` is an agent card),
`embedded` (`schema` only). Standard capabilities: `dev.ucp.shopping.checkout`,
`.cart`, `.catalog`, `.order`, extensions `.fulfillment` and `.discount`, and
`dev.ucp.common.identity_linking`. Authority binding: a `dev.ucp.*` capability's
`schema` host must reverse to `dev.ucp`.

**Live (Shopify, every store):** `ucp.version 2026-08-25`, two services
(`mcp` at `https://<shop>.myshopify.com/api/ucp/mcp`, which answers JSON-RPC
POSTs and redirects GETs; `embedded` with no endpoint), eight `dev.ucp.shopping.*`
capabilities plus `dev.shopify.catalog`, three payment handlers
(`com.google.pay`, `dev.shopify.card`, `dev.shopify.shop_pay`), and
`supported_versions` back to `2026-01-23`. Cache is `max-age=60`.

## ACP, Agentic Commerce Protocol (OpenAI + Stripe; agenticcommerce.dev)

**Reads:** `GET /.well-known/acp.json`, `application/json`, no auth,
`Cache-Control: public, max-age=3600` minimum.

```json
{
  "protocol": { "name": "acp", "version": "2025-09-29", "supported_versions": ["2025-09-29"] },
  "api_base_url": "https://store.example/api",
  "transports": ["rest"],
  "capabilities": { "services": ["checkout"] }
}
```

All four root fields are required. `transports` is the closed set
`rest`, `mcp`. `capabilities.services` is the closed set `checkout`, `orders`,
`delegate_payment`, `carts`. Optional under `capabilities`: `extensions[]`
(`{name, spec?, schema?}`), `intervention_types[]` (`3ds`, `biometric`,
`address_verification`), `supported_currencies[]`, `supported_locales[]`.
Optional under `protocol`: `documentation_url`. Spec:
github.com/agentic-commerce-protocol/agentic-commerce-protocol, `rfcs/rfc.discovery.md`.

## x402 (x402.org, x402 Foundation; docs.x402.org)

**Reads:** a 402 on the paid route itself.

| | v1 | v2 |
|---|---|---|
| requirements | JSON body | `PAYMENT-REQUIRED: <base64 JSON>` header |
| payment | `X-PAYMENT` request header | `PAYMENT-SIGNATURE` request header |
| receipt | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |
| network | string (`base`, `base-sepolia`) | CAIP-2 (`eip155:8453`, `eip155:84532`) |
| version field | `x402Version: 1` | `x402Version: 2` |

The requirements object, both versions:

```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "10000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xYourAddress",
    "resource": "https://api.example/v1/report",
    "maxTimeoutSeconds": 60
  }],
  "resource": { "url": "https://api.example/v1/report", "method": "GET", "description": "..." }
}
```

v1 spells the price `maxAmountRequired`; v2 spells it `amount`. Schemes:
`exact`, `upto`, batch settlement. A facilitator verifies and settles; the
hosted one at `x402.org/facilitator` is testnet-only. Discovery is the Bazaar:
`GET <facilitator>/discovery/resources` lists registered HTTP endpoints and MCP
tools, opt-in per route. The reference site's gate (`src/worker/x402.ts`) is v1,
prices `/llms-full.txt` at 10000 atomic USDC ($0.01), and serves the file free
with `x-payment-note: x402 gate not configured; served free` until
`X402_PAY_TO` is set.

## MPP, Machine Payments Protocol (Stripe + Tempo; mpp.dev)

**Reads:** a 402 on the paid route, and `/openapi.json` for prices ahead of time.

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="qB3wErTyU7iOpAsD9fGhJk", realm="api.example", method="tempo", intent="charge", request="<base64url JCS JSON>", expires="2027-01-15T12:05:00Z", header="Payment-Authorization"
```

Required challenge parameters: `id`, `realm`, `method` (`tempo`, `stripe`,
`lightning`, ...), `intent` (`charge`, `session`), `request` (base64url of
RFC 8785 JSON with `amount`, `currency`, `recipient`, method details). Optional:
`description`, `digest`, `expires`, `header` (where the credential goes;
defaults to `Authorization`), `opaque`. Several challenges may be sent as
several `WWW-Authenticate` values. The client answers with a Credential in the
named header and the server returns a receipt in `Payment-Receipt`.

Discovery is an OpenAPI 3.1 document at `/openapi.json`:

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Reports API", "version": "1.0.0" },
  "x-service-info": { "categories": ["data"], "docs": { "homepage": "https://api.example", "llms": "/llms.txt" } },
  "paths": {
    "/v1/report": {
      "get": {
        "x-payment-info": { "offers": [
          { "amount": "1000000", "currency": "0x20c0000000000000000000000000000000000001", "intent": "charge", "method": "tempo", "description": "Premium report" },
          { "amount": "100", "currency": "usd", "intent": "charge", "method": "stripe", "description": "Premium report" }
        ] },
        "responses": { "200": { "description": "ok" }, "402": { "description": "Payment Required" } }
      }
    }
  }
}
```

`offers[]` is canonical; the flat `{amount, currency, intent, method}` form is
accepted as legacy shorthand and cannot be combined with `offers`. Amounts are
base units as strings. Discovery is advisory; the 402 is authoritative.
Registries: mppscan.com, mpp.dev/services (and an MCP server at
`https://mpp.dev/mcp/services`). `mppx` emits the document from route config
(`discovery(app, mppx, {...})`).

**The spec link isitagentready.com cites for MPP discovery
(`paymentauth.org/draft-payment-discovery-00.txt`) answers a GitHub Pages 404**;
mpp.dev/advanced/discovery is the document that exists.

**Live (stableenrich.dev):** one 402 carries BOTH `PAYMENT-REQUIRED` (x402 v2)
and `WWW-Authenticate: Payment` (MPP, `method=tempo`). Its `/openapi.json`
puts `x-payment-info` on 37 operations in a third shape,
`{"price": {"mode":"fixed","currency":"USD","amount":"0.22"}, "protocols": [{"x402": {}}, {"mpp": {"method":"tempo","intent":"charge","currency":"0x20c0..."}}]}`,
which a canonical MPP discovery reader does not parse.

## AP2, Agent Payments Protocol (Google; github.com/google-agentic-commerce/AP2)

**Reads:** the A2A agent card, `capabilities.extensions[]`.

```json
{
  "name": "Store Agent",
  "url": "https://store.example/a2a",
  "capabilities": {
    "extensions": [
      { "uri": "https://github.com/google-agentic-commerce/ap2/v1", "description": "Supports the Agent Payments Protocol.", "required": true }
    ]
  },
  "skills": [{ "id": "search_catalog", "name": "Search Catalog", "description": "..." }]
}
```

The URI is `https://github.com/google-agentic-commerce/ap2/v1` (from the
samples' `a2a_extension_utils.py`, `EXTENSION_URI`). AP2 itself is the
mandate chain: an IntentMandate (what the user authorised), a CartMandate
(what the merchant will sell, signed), a PaymentMandate (what the credentials
provider will pay), as SD-JWTs. Declaring the extension says the agent speaks
that chain; UCP and ACP are the checkout protocols it rides on.

## Which door for which business

| you are | build first | then |
|---|---|---|
| a store on Shopify | nothing: UCP and WebMCP ship for you | `acp.json`, an agent card with AP2 |
| a store elsewhere | UCP profile with a `rest` shopping service | `acp.json`, AP2 |
| an API sold per call | a 402 (x402 v2 or MPP) on each paid route | list them in `api-catalog` / `openapi.json`, register |
| a content site with a paid tier | x402 on the paid representation, free elsewhere | an `x-payment-note` while the wallet is unset |
