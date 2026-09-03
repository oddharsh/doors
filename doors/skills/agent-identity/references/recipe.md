# agent-identity recipe

## Web Bot Auth, the exact shape

Outbound request headers (the reference signer, `src/worker/lib/botauth.ts`):

```
Signature-Agent: "https://example.com"
Signature-Input: sig1=("@authority" "signature-agent");created=1725000000;keyid="<thumbprint>";alg="ed25519";tag="web-bot-auth"
Signature: sig1=:<base64 of the Ed25519 signature over the signature base>:
```

The signature base is RFC 9421's: one line per covered component
(`"@authority": host`, `"signature-agent": "https://example.com"`) followed by
`"@signature-params": <the params string>`. Covering `@authority` binds the
signature to the host being visited, so a captured signature cannot be replayed
elsewhere; covering `signature-agent` binds it to the directory that holds the
key.

`keyid` MUST be the RFC 7638 thumbprint of the public key
(draft-meunier-web-bot-auth-architecture-04, section on signature parameters;
for Ed25519 the members are `crv`, `kty`, `x`). Compute it in the signer from
the public members, never read it from a typed `kid`:

```js
import { createHash } from "node:crypto";
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const canon = `{"crv":${JSON.stringify(jwk.crv)},"kty":${JSON.stringify(jwk.kty)},"x":${JSON.stringify(jwk.x)}}`;
const keyid = b64u(createHash("sha256").update(canon).digest());
```

Test vector, RFC 8037 appendix A.3: `x = 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo`
thumbprints to `kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k`.

## The directory

`/.well-known/http-message-signatures-directory`, a JWK Set of public keys:

```json
{ "keys": [ { "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig",
              "kid": "<thumbprint>", "x": "<base64url public key>" } ] }
```

Media type, per draft-meunier-http-message-signatures-directory-03:
`application/http-message-signatures-directory+json`. Long cache (the reference
uses 30 days); rotate by adding the new key before removing the old.

## Field note: the reference site's kid was a label

First run of `identity.mjs` against aadhar.sh, 2026-09-03: one Ed25519 key,
`kid=rn-2026-06-30`, thumbprint `091z_BcIsuIgfzzKCKOie6JcSkz7UhVlbiakxjV5E8o`,
served as `application/jwk-set+json`. Every earlier check of that directory
(the site's own audit included) asserted presence and a `keys` array, and all of
them passed. The signer took `keyid` from the same typed field, so the two
agreed with each other and with no verifier. The fix derives `keyid` from the
public members and pins the directory's kid to the thumbprint in a test; the PR
is linked from `site-paths.md` once merged.

The general shape: a check that asserts a file EXISTS cannot see that the file
is wrong in the one way the consumer cares about. Grade the property the
verifier keys on.

## Agent card

`/.well-known/agent-card.json`:

```json
{ "name": "...", "description": "...", "version": "1",
  "provider": { "organization": "...", "url": "https://example.com/" },
  "supportedInterfaces": [
    { "url": "https://example.com/mcp",
      "protocolBinding": "https://modelcontextprotocol.io/specification/2026-07-28",
      "protocolVersion": "2026-07-28",
      "serverCard": "https://example.com/.well-known/mcp/server-card.json" } ],
  "skills": [ { "id": "...", "name": "...", "description": "..." } ] }
```

Every URL in it must answer. An MCP URL answering 405 to a GET is fine (it
takes POST); 404 is a dangling door.

## DNS-AID

```
_index._agents.example.com.  3600  IN  SVCB  1 example.com. mandatory=alpn,port alpn=h2,h3 port=443
```

Only `_index` unless you run the server the other name promises: `_a2a` for an
Agent2Agent server, `_mcp` for MCP. DNSSEC-sign the zone so the answer is
authenticated (the probe reports the resolver's AD flag). Verify with DoH:

```bash
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=_index._agents.example.com&type=SVCB&do=1'
```

## Where the reference does it

- signer: `src/worker/lib/botauth.ts` (`signRequestForWebBotAuth`, `paramsFor`)
- directory and card: `public/.well-known/http-message-signatures-directory`,
  `public/.well-known/agent-card.json`
- DNS-AID declared and diffed against the zone: `config/infra.json` (`dns`)
- the bot's page: `/bot`, hand twin `src/content/md/bot.md`, pinned to
  `src/worker/bot.ts` by `checkTwinFacts` in `tools/gen-md-twins.ts`
