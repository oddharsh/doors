---
name: page-basics
description: Build the page-level basics every agent-readiness scanner charges every site for, whatever it is: text in the raw HTML with one H1 and stepped headings, a real 404 (with a Markdown body when asked), HTTP redirects instead of meta refresh or JavaScript, content pages without a login wall, canonical/lang/og head tags, one JSON-LD identity block (Person for a personal site, a complete Organization for a company), about/contact/privacy pages, pages under an agent's context budget, and a findable title. Use this when is-agentic.com or agent-score reports content-no-js, agent-friendly-404, redirect-hygiene, docs-auth-gate, metadata-completeness, json-ld, org-schema-completeness, trust-anchors, content-efficiency, page-token-budget, pricing-info or brand-search-accuracy, when someone asks "why do agents see an empty page", "do I need JSON-LD", "what should my 404 return", or when make-agent-ready hands over a page card. The probe is agent-score's; this skill is how to build what it measures.
---

# page-basics

Six of these checks are Essential on is-agentic.com for every site, and on a
site with no API those six share 80 points: about 13 each. None of them needs
a new protocol. They are the page itself, served the way an agent that does
not run JavaScript reads it.

## Measure first

```bash
node <plugin-root>/skills/agent-score/scripts/score.mjs https://example.com
```

Read the rows named in the description; each carries the evidence (character
counts, the heading order, the 404 status, the missing head tags). Run
`--control` once if you changed the script. After each fix below, run it again
on the deployed origin.

## What to build, in order

1. **Text in the HTML.** Server-render or prerender every content page so the
   raw response has 500+ characters of real text. One `<h1>`, first; then
   `<h2>`, `<h3>` in order, never skipping a level, never a page that is all one
   level. Keep readable text at 5%+ of the bytes: a 2 MB hydration blob around
   2 KB of prose is the usual failure (stripe.com and github.com both read 1 to
   2%). Static-site generators pass this by default; SPAs need SSR, prerender,
   or a static fallback for every route.
2. **A real 404.** Unknown paths answer 404, from the server or edge, never 200
   with the app shell (vercel.com's soft 404 is its largest open item). Then,
   when the request's `Accept` prefers `text/markdown`, answer the same 404 with
   `Content-Type: text/markdown` and three lines: what happened, and links to
   `/sitemap.xml`, `/llms.txt` and the home or docs page. That second half is
   the other half of the credit: on 25 of 41 is-agentic reports the status was
   right and the Markdown body missing (5 more served a soft 404).

   ```js
   // Worker or any fetch handler: after routing found nothing
   const md = /text\/markdown/.test(request.headers.get("accept") || "");
   return md
     ? new Response("# Not found\n\nTry [the sitemap](/sitemap.xml) or [llms.txt](/llms.txt).\n", { status: 404, headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" } })
     : new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8", vary: "Accept" } });
   ```
3. **Redirects in HTTP.** Every `<meta http-equiv="refresh">` and every
   `location.href =` stub becomes a 301/308 (or 302/307) from the server or
   edge, and apex/www plus http/https collapse into one hop. openai.com and
   cloudflare.com both failed on old campaign pages that redirect in the
   document; the sitemap is where a scanner finds them.
4. **No login wall on content.** Docs, help and content pages answer 200
   without a session. If something must stay gated, a public page says what it
   covers and how to get in.
5. **Four head signals on every page:** `<html lang>`, `<link rel="canonical">`
   with the absolute URL, `og:type` (`website`, `article` on posts) and
   `og:image`.
6. **One JSON-LD identity block** on the homepage, of the type the site really
   is, with `name`, `url`, `description` and `sameAs` for owned profiles.

   ```html
   <script type="application/ld+json">
   {"@context":"https://schema.org","@type":"Person","name":"Ada Example","url":"https://ada.example/",
    "description":"Writes about compilers.","sameAs":["https://github.com/ada","https://ada.example/@ada"],
    "worksFor":{"@type":"Organization","name":"Example Co","url":"https://example.co/"}}
   </script>
   ```

   A company uses `Organization` (or `LocalBusiness`) and gives it a
   `contactPoint` (`email` or `telephone`, `contactType`) and an `address`
   (`PostalAddress`; city and country are enough when no street address is
   public): that is the `org-schema-completeness` check. **A personal site
   describes a Person.** is-agentic still charges the completeness check (about
   2.5 points) when it finds any Organization node, including a `worksFor`; give
   that node a `contactPoint` and `address` only from facts the organization
   publishes, or leave the points on the table. Never invent an Organization.
7. **About, contact, privacy.** Real pages at `/about`, `/contact`, `/privacy`,
   500+ characters each, linked from the homepage. A privacy page on a site that
   collects nothing says exactly that, and what the server logs.
8. **Pages under ~100K characters of text** (about 25K tokens). Split a long
   reference into pages, index them, and list the index in `llms.txt`.
9. **Pricing, where something is sold.** A `/pricing` page linked from the
   homepage, or `schema.org/Offer` with `price` and `priceCurrency`. Not counted
   for a personal or content site.
10. **A findable title.** The brand plus the main product term in `<title>` and
    the H1 ("Acme payments API", not "Home"). is-agentic grades a live web
    search here, which markup moves only at the margin; treat a partial as one
    sample.

## Traps

- **A catch-all 200 fakes every page.** If unknown paths answer 200, `/about`
  and `/privacy` "exist" to a naive check and the 404 check fails. Fix the 404
  first; the rest reads true after it.
- **Vary: Accept on the 404 too.** A CDN that caches the HTML 404 hands it to
  the agent that asked for Markdown.
- **Prerender only the homepage and the scanner samples the sitemap.** Six
  sampled pages decide `redirect-hygiene`, `docs-auth-gate` and
  `page-token-budget`; fix the template, not one URL.
- **JSON-LD that does not parse is worse than none.** Validate the block in CI
  (`JSON.parse` on the extracted text is enough).

## Reference implementation

The reference site passes all six page Essentials. Of the page Recommended
rows it misses Organization completeness (an Organization node in its JSON-LD
has no contactPoint or address) and brand search (a search sample). The 404 clamp is `src/worker/lib/assets.ts`; negotiation is
`src/worker/lib/http.ts`; paths in `../../references/site-paths.md`.
