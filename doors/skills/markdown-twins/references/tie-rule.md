# The tie rule, and why a checklist cannot see it

RFC 9110 gives order within `Accept` no significance. Three shipping agent
clients (Claude Code, Copilot CLI, Microsoft Copilot) send
`text/markdown, text/html, */*`: both types at `q=1`, nothing in the header
breaks the tie. A server that ranks strictly by q passes every conformance
check and hands those three HTML.

The reference site scored full marks on the checklist and handed Claude Code
HTML until 2026-08-27. The fix is a convention rather than a rule: **a tie
goes to whichever type was listed first**, and `*/*` matches only types named
EXACTLY, because a wildcard expresses no preference BETWEEN two named types
and so cannot break a tie between them. The alternative to that convention is
not neutrality; it is silently preferring HTML, which is also a choice, and
the one that costs an agent the point of asking.

Two controls prove the rule has teeth. The `q-ranked` row
(`text/html;q=1.0, text/markdown;q=0.5`) must come back HTML, or the server
is matching on the presence of the substring and would give Markdown to a
browser that merely lists it last. The `q=0` row (`text/markdown;q=0`) is an
explicit refusal and must also come back HTML; a substring match fails this
one and a parse passes it.

Implementation, from the reference site's `wantsMarkdown`
(`references/site-paths.md`, Accept negotiation row): parse the header into
`(type, q, index)`, drop `q=0`, take the best q, and among ties take the
lowest index with an exact type match.

# The two doors an agent uses, and the one it cannot

`Accept` negotiation at the page's own URL is the door a client that sends a
preference uses. A `.md` twin at `<path>.md` is the door a client that sends
NO preference uses, if it can find it: put `rel="alternate"
type="text/markdown"` in the `Link` header or a `<link>`, so a client
following RFC 8288 has a path. And a negotiated response must be
`no-store`, because a shared cache keys on the URL: the reference site
measured `/bot` answering `text/markdown` on a cache BYPASS and `text/html`
on a HIT twenty-five minutes later, from the same build. The `.md` URL is the
cacheable representation; the negotiated one is not.
