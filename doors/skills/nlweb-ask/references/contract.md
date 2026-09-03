# NLWeb /ask, the contract as implemented and graded

## Request

| parameter | meaning | note |
|---|---|---|
| `query` | the question | REQUIRED; a missing one is a 400 naming `parameter: "query"` |
| `streaming` | `1`/`true` (DEFAULT) for SSE, `0`/`false` for one JSON body | the default is what makes a bare `curl` look broken |
| `mode` | `list`, `summarize`, `generate` | the last two need a model; refuse with 501 + `supported_modes` if you have none |
| `site` | a site token, or `all` | unknown tokens are a 400 naming `available_sites` |
| `prev` | prior queries, for follow-ups | without `decontextualized_query`, search the raw query and say so in `_meta.decontextualization` |
| `decontextualized_query` | the caller's own resolution of a follow-up | when present, it is what gets searched; report it back as `decontextualized_query` |

GET with query parameters, or POST with a JSON body. `query` as a JSON OBJECT
is the v0.55 signal that selects named SSE events; anything else is legacy.

## Non-streaming response

```json
{
  "query": "...", "decontextualized_query": "...", "mode": "list", "site": "...",
  "results": [
    { "url": "https://...", "name": "...", "site": "example.com",
      "score": 87, "description": "...",
      "schema_object": { "@context": "https://schema.org", "@type": "WebPage", "@id": "...", "isPartOf": { "@id": "https://example.com/#website" } } }
  ],
  "_meta": { "version": "...", "score": "0-100, relevance as a percentage of the maximum a 2-term query could score", "description": "extractive" }
}
```

Six fields per result. `schema_object` is the one that makes the answer usable
by a machine; grade it as present only when it is an object with a `@type`.

## Streaming response

Legacy dialect: unnamed frames, `data: {"message_type": "result", ...}`, ending
with a `complete` message. v0.55 dialect: `event: start`, `event: result` per
item, `event: complete`, each with a JSON `data:` line. Content type is
`text/event-stream` either way.

## What a knock cannot see

A request with no query learns a status and a content type. It cannot see that
`schema_object` is missing on 8 of 10 results, that scores are unnormalised,
that `mode=generate` is silently served as `list`, or that the streaming
default is off. Every one of those is a 200 that looks right.

## Cost

Asking a server a question costs it a retrieval, and in `generate` mode a model
call. The reference site rate-limits its own grader to 4 per minute per client
and caches an hour per origin AND query (keying on origin alone would show one
visitor's answer to another visitor's question). If you build a public grader,
inherit both.

## Where the reference does it

- endpoint, parameter parsing, refusals, projection: `src/worker/nlweb.ts`
- the MCP tool that shares the function: `src/worker/lib/tools.ts` (`ask`)
- the per-field grader: `src/worker/lens-nlweb.ts`
- the knock classifier and the story of it grading a real server as absent:
  `src/worker/lens.ts`, `lensProbeNlweb`
