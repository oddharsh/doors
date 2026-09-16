# The three documents, as the reference site serves them

Copied from `public/.well-known/` and `src/content/auth.md` at the pinned commit
(see `../../../references/site-paths.md`), trimmed to the fields that carry the
chain. Replace `aadhar.sh` with your origin; keep the field names.

## `/.well-known/oauth-protected-resource` (RFC 9728)

```json
{
  "resource": "https://aadhar.sh/",
  "resource_name": "aadhar.sh public agent surfaces",
  "resource_documentation": "https://aadhar.sh/auth.md",
  "authorization_servers": ["https://aadhar.sh"],
  "scopes_supported": ["public.read", "mcp.read", "rn.read", "photos.read", "around.read"],
  "bearer_methods_supported": ["header"]
}
```

`resource` is the origin the challenge protects. Each `authorization_servers[]`
entry is an ISSUER, and the client derives that issuer's metadata URL from it
(RFC 8414 s3), so the value has to be one whose metadata says the same string
back.

## `/.well-known/oauth-authorization-server` (RFC 8414, with the Auth.md block)

```json
{
  "issuer": "https://aadhar.sh",
  "token_endpoint": "https://aadhar.sh/oauth2/token",
  "revocation_endpoint": "https://aadhar.sh/oauth2/revoke",
  "grant_types_supported": ["urn:workos:agent-auth:grant-type:anonymous"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["public.read", "mcp.read", "rn.read", "photos.read", "around.read"],
  "agent_auth": {
    "skill": "https://aadhar.sh/auth.md",
    "register_uri": "https://aadhar.sh/agent/auth",
    "claim_uri": "https://aadhar.sh/agent/auth/claim",
    "revocation_uri": "https://aadhar.sh/oauth2/revoke",
    "identity_types_supported": ["anonymous"],
    "credential_types_supported": ["bearer_token"],
    "events_supported": []
  }
}
```

No `authorization_endpoint` and no `response_types_supported`, because the one
grant type needs no browser. Add both the moment you add `authorization_code`.
The `agent_auth` block is the Auth.md convention (workos.com/auth-md): a
machine-readable pointer to the registration flow, beside the prose that
explains it.

## `/auth.md`

Markdown, served as `text/markdown`. The reference file is 3.3 KB and has four
sections the probe looks for by marker: what an agent can reach (a list of URLs),
**Discovery** (naming both well-known documents by URL, in the order to fetch
them), **Registration** (the POST, its body, what comes back), and **Scopes**
(each one, and what it does NOT grant). Say the last part plainly; agents quote
this file to their users.

## The registration endpoint

`src/worker/agent.ts`: `POST /agent/auth` with `{"type":"anonymous"}` answers
`201` with a bearer token, `expires_in`, the scope list, `claim_uri` and
`revocation_uri`, and `cache-control: no-store`. Any other identity type answers
`400 unsupported_identity_type` naming what is supported, so an agent that asked
for more learns the ceiling instead of retrying. `GET /agent/auth/claim` answers
`not_required` for anonymous credentials. Everything answers `OPTIONS` for the
browser case.

## The knock the probe makes

| hop | request | a healthy answer |
|---|---|---|
| challenge | `GET <protected>` with no token | `401` + `WWW-Authenticate: Bearer resource_metadata="..."` |
| PRM | `GET /.well-known/oauth-protected-resource` | JSON with `resource` and `authorization_servers` |
| AS | `GET <issuer>/.well-known/oauth-authorization-server` | JSON whose `issuer` equals `<issuer>` |
| token | `POST <token_endpoint>` with no body | `400` or `401` (never `404`) |
| register | `POST <agent_auth.register_uri>` | `201`, `400` or `401` |

## Field note: a hosted authorization server mirrored at the storefront

Measured 2026-09-16 on a Shopify storefront. The store's own origin serves an
AS document whose `issuer` is `https://shopify.com/authentication/<shop-id>`.
Fetched by derivation from that issuer it is correct; fetched from the store's
origin, where every scanner and the PRM's own `authorization_servers` entry
(`accounts.<store>`) lead, it fails the s3.3 comparison. Two fixes are honest:
name `https://shopify.com/authentication/<shop-id>` in the PRM and stop
mirroring, or make the store the issuer and proxy the endpoints. Passing a
presence check with the mirror is the one option that leaves a strict client
stuck.
