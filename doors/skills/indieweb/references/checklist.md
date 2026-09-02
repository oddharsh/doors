# IndieWeb basics for a personal site, and what each one is for

The point of every item here is the same: a page should say who wrote it and
how to reach them in a way software can read, so that the web's links carry
identity and replies without a platform in the middle. Validate with
[indiewebify.me](https://indiewebify.me) once the pieces are in; the check
script here tests presence, not correctness.

## h-card on the homepage

A microformats2 `h-card` with at least `p-name`, `u-url` (pointing at the site
itself) and ideally `u-photo`. This is the "representative h-card": the thing a
reader shows as the author, and the thing `rel=me` verification anchors on.
Mark it up on the element that already carries your name and link rather than
adding hidden markup; microformats are classes on the visible page.

## rel=me

Links from the homepage to your profiles elsewhere, each with `rel="me"`, and
a link BACK from each profile to the homepage. Two-way `rel=me` is how a
verifier (Mastodon's checkmark, IndieAuth) proves the accounts are one person.
One-way links are a hint; two-way is a claim.

## Webmention

- Receiving: advertise the endpoint on every page that can be mentioned, in
  either the HTTP `Link` header or a `<link rel="webmention">`. Senders
  discover per-URL, so the homepage alone covers only mentions of the homepage.
- Verify before publishing: fetch the source, confirm it really links to the
  target, and moderate. The reference site's receiver fails closed, holds
  mentions for approval, and its outbound sender reads its own pages through
  the same dispatcher it serves them with, so it cannot cite a page it does
  not render (`references/site-paths.md`, IndieWeb row).
- Sending: for each outbound link in a new post, discover the target's
  endpoint and POST `source` and `target`. Cap sends per run; a runaway sender
  is how a personal site becomes somebody else's spam problem.

## h-entry on posts

Each post root carries `h-entry`, with `p-name` (title), `e-content` (body),
`dt-published`, and an author reference (`p-author` as an embedded h-card, or
`u-author` pointing at the homepage). Readers and mention receivers use these
to show a reply as a reply rather than as a bare URL.

## IndieAuth, optional

`rel="authorization_endpoint"` lets you sign in elsewhere AS your site. Skip it
until something needs it; an endpoint nobody uses is a door left open.

## The rule

Same as every other skill in this plugin: do not advertise what you do not
serve. A `<link rel="webmention">` pointing at a 404 is worse than no link,
because senders retry.
