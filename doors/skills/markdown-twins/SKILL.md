---
name: markdown-twins
description: 'Give every page a Markdown twin at <path>.md and negotiate Accept: text/markdown correctly at the page''s own URL, including the equal-q tie that Claude Code, Copilot CLI and Microsoft Copilot send and that q-ranking servers silently lose. Use this whenever someone wants their site readable by LLM agents, asks about llms-full.txt or "markdown for agents", wants to pass acceptmarkdown.com, sees an agent getting HTML from a page that "supports markdown", or asks "what do AI tools get when they read my page". Ships a replay of seven real agent clients plus a browser control and the conformance checks; falls back to the tie-rule and trap references.'
---

# markdown-twins

Two doors: a `.md` twin at the page's path, and negotiation at the page's
own URL. The replay measures both from the client's side, which is the only
side that matters.

## Replay first

```bash
node <plugin-root>/skills/markdown-twins/scripts/replay.mjs https://example.com/some/page
```

It sends the `Accept` header seven shipping agent clients actually send,
plus a browser control, and reports what each got, then runs five checks:
the two acceptmarkdown.com-style ones (ranked q respected, Vary names
Accept), the `q=0` refusal that separates a parse from a substring match,
`rel=alternate` discovery for clients that send no preference, and the
decoded byte delta. Read the control row first; if a browser gets Markdown,
the site has one representation and nothing is negotiated. Then read
`reach`: **a site can pass every check and reach 4 of 7**, because three
clients tie the two types at `q=1`. `references/tie-rule.md` is that story
and the rule that fixes it.

## Building it

1. **Twins are build output, never committed.** A twin is a pure function of
   the page's bytes, so generate it at build time from the SOURCE tree and
   fail the build if fewer than expected generate; a lost twin is silent
   (the page keeps serving HTML). The converter must treat `script` and
   `style` as opaque and render interactive controls as nothing;
   `references/traps.md` says why each rule exists.
2. **Rendered pages get a hand twin**, with the facts it states pinned
   against the code that makes them true.
3. **Negotiate at the page URL** with the tie rule: best q wins, ties go to
   the first-listed type, `*/*` never breaks a tie. Drop `q=0`. Answer HEAD
   with the same headers a GET would carry.
4. **The negotiated response is `no-store`**; the `.md` URL is the cacheable
   one. A URL-keyed cache in front of a negotiating route will otherwise hand
   HTML to an agent from a browser's cache entry, intermittently, which is
   the hardest shape of bug to believe in.
5. **Advertise the twin**: `Link: <...md>; rel="alternate"; type="text/markdown"`
   or a `<link>`, and give the two big sections their own `llms.txt` so an
   agent finds the twin without the root index (`discovery-files`).

The reference implementation, converter and negotiation both, is cited by
path in the plugin's `references/site-paths.md`.

## Done when

The replay reads 7 of 7 with the browser control on HTML and all five checks
passing, on a page that carries a script block (so the twin's opacity rule is
exercised) and on the homepage. Then run `agent-audit`; its Markdown row is
this same measurement from the outside.
