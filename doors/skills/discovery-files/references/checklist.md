# Discovery files, by hand

When the sweep cannot run, this is what it checks and why each line is there.

## llms.txt

- At `/llms.txt`, plain text or Markdown, never an HTML page. A catch-all
  router that answers every path with the homepage makes the file "present"
  and useless; check the content type.
- Lead with one line saying what the site is, then sections of links with a
  short description each. The reference site keeps the root file short and
  publishes a **per-section** `llms.txt` (`/garage/llms.txt`, `/lwe/llms.txt`)
  that indexes that section's pages, so an agent looking for one page does not
  pull the whole root index.
- `llms-full.txt` is optional and expensive to keep honest; the reference site
  serves one, generated, rather than hand-maintained.
- Every path in it must answer. That is the whole reason the sweep exists.

## sitemap.xml

- `<urlset>` or `<sitemapindex>`, same-origin `<loc>` entries, and a
  `Cache-Control` long enough that crawlers do not re-fetch it per page.
- Rendered pages count; build output counts; anything that only exists behind
  a query string does not belong in it.

## robots.txt

- Present, even if permissive, so policy is stated rather than defaulted.
- **Allow your own crawler by name** if you run one (the reference site names
  `AadharshBot`); an agent reading the file learns who the site trusts.
- Naming AI crawlers is a policy decision. This skill reports what a file says
  and does not recommend blocking or allowing unless asked. `Disallow: /` for a
  named bot is a complete block; a bare `Disallow:` is an explicit allow.
- `robots.txt` governs crawlers and says nothing about a browser, which is why
  the audit's browser control is reported as `n/a` against it.

## The rule under all three

Never advertise a door you do not serve. A dangling entry passes a scanner and
breaks the first agent that follows it, which is worse than the entry missing.
The reference site publishes DNS-AID's `_index` record and deliberately not
`_a2a`, because it has no Agent2Agent server, for exactly this reason.

## Field note: the first thing the sweep caught

Run against the reference site on 2026-09-02, the sweep reported one broken
advertised URL: `/garage/llms.txt` promised `/garage/dyno.md`, which answered
404. The page is Worker-rendered from a data branch, so no source walk could
produce its twin, and the section index linked every registered surface as
`<path>.md` regardless. Nothing in that repository's own checks could see it,
because the index is built from the page registry and the twins from the tree,
and no assertion joined the two.

The fix ([oddharsh/site#714](https://github.com/oddharsh/site/pull/714)) is the
pattern to copy when you generate an index: pass the generator the set of files
the build actually holds, list anything outside it under its HTML URL with a
heading that says so, and pin the join with a test whose control hands the
generator an empty set and expects it to promise nothing. A generator that
links by registration alone is the shape this sweep exists to catch.
