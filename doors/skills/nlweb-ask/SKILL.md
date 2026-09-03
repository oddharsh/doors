---
name: nlweb-ask
description: Build or grade an NLWeb /ask endpoint, the natural-language door that returns schema.org objects and doubles as an MCP tool. Use this whenever someone mentions NLWeb, an /ask endpoint, "let agents ask my site questions", answering natural-language queries over a site's own content, schema.org results for agents, or asks whether their /ask is "compliant". Also use it when an audit says a site has /ask, because a knock proves nothing: this skill sends a real question and grades the answer field by field.
---

# nlweb-ask

NLWeb is a thin convention: answer natural language at `/ask`, return a list of
results that each carry a schema.org object, and expose the same function over
MCP as a tool named `ask`. It is the door an agent uses when it has a question
rather than a URL. It is also the door most often faked by accident: a 46-site
survey found four of six "agent-native" origins whose `/ask` answered 410, 412,
429 or 401 to every request. A door that opens onto nothing still reads as a
door from outside.

## Run the probe first

```bash
node scripts/ask.mjs https://example.com
node scripts/ask.mjs https://example.com --q "how do I book a call"
node scripts/ask.mjs https://example.com --json
```

Three requests, and each answers a different question:

1. **Bare knock** (`/ask` with no query). A conforming server MUST refuse a
   missing query, and the SHAPE of the refusal is the most identifying thing the
   door can say: a 400 that names `query` is a server that speaks the protocol,
   and so is a `text/event-stream` (streaming is the spec's default). A 410, 412,
   429 or 401 with no parameter named is a wall refusing the REQUEST, which is
   what those four origins were. The probe classifies that way because the
   reference site's own lens once graded a real NLWeb server as absent on both
   counts.
2. **List mode** (`?query=…&streaming=0&mode=list`). One real question in the
   cheapest mode, pinned explicitly: `generate` is somebody's model call. The
   answer is graded per field, on every result: `url`, `name`, `site`, `score`,
   `description`, `schema_object`, and whether the schema object carries a
   `@type`. A server can return an immaculate paragraph and no schema at all, and
   an agent pointed at it has a paragraph where structured data was promised.
3. **Streaming default** (no `streaming=` parameter). Names the framing and the
   dialect: named SSE events (`start`/`result`/`complete`, the v0.55 shape) or
   legacy unnamed `data:` frames carrying `message_type`.

The score line flags a range past 100. NLWeb scores are 0 to 100 and should be
normalised against what the query COULD have scored, never against the response's
own top hit, or every query hands out a 100 and the number only compares inside
one answer.

## Building one

Read `references/contract.md` for the parameter and result contract. The shape
that keeps it honest, learned on the reference site:

- **Refuse, don't degrade.** `mode=summarize` and `mode=generate` need a
  language model. Without one, answer 501 naming `supported_modes` rather than
  quietly serving `list`. Same for a `prev` follow-up with no
  `decontextualized_query`: search the raw query AND say so in `_meta`.
- **Say what the description is.** The spec annotates `description` as generated
  by a model. If yours is extractive, put `extractive` in `_meta.description`.
- **Select the dialect by request shape, not by header.** The reference server
  reads `query` arriving as an OBJECT as the v0.55 signal and answers named
  events; a string query gets legacy frames. No `Accept` value selects it.
- **Project `schema_object` from the record's kind**: page to `WebPage`, post to
  `BlogPosting`, tool to `WebAPI`, joined by `@id` to the site's `WebSite` node,
  and assert that node exists, since a dangling `@id` is a silent dead reference.
- **Never put `/ask` behind a URL-keyed cache.** The answer is per query.
- **One implementation, two doors.** The MCP tool `ask` calls the same function
  as the HTTP route, so the two cannot rank differently under one name.

## Reference implementation

`src/worker/nlweb.ts` is the endpoint and the projection; `src/worker/lens-nlweb.ts`
is the per-field grader this probe ports, and its header is the argument for
grading answers rather than knocking. Paths in `../../references/site-paths.md`.
