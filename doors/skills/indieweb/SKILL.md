---
name: indieweb
description: 'Add or repair the IndieWeb basics on a personal site or blog: a representative h-card, two-way rel=me identity links, h-entry markup on posts, and webmentions both received (with verification and moderation) and sent. Use this whenever someone mentions IndieWeb, microformats, h-card, h-entry, rel=me, Mastodon verification, webmentions, "make my blog part of the IndieWeb", "let people reply to my posts from their own site", or wants their personal site to carry identity without a platform. Ships a presence check that reads the served HTML the way a receiver would; falls back to a manual checklist and indiewebify.me.'
---

# indieweb

Identity and replies without a platform in the middle. Four pieces, each small,
each read by software from the page you already serve.

## Check first

```bash
node <plugin-root>/skills/indieweb/scripts/check.mjs https://example.com --post /a-recent-post
```

Reads the homepage for an h-card, `rel=me` links and a webmention endpoint,
and one post for `h-entry` and its own endpoint advertisement. Presence only:
the script says so, and `references/checklist.md` links the validator for the
rest. Run it before editing so you add what is missing rather than what a
checklist lists.

## Then add, in this order

1. **h-card** on the element that already shows your name and link. `p-name`,
   `u-url` to the site itself, `u-photo` if there is one. Visible markup; no
   hidden blocks.
2. **rel=me** on your profile links, and the link back from each profile. The
   second half is the part people forget and the part verifiers require.
3. **Webmention endpoint** advertised on every page that can be mentioned, via
   the `Link` header if the server allows it (one place, every page) or a
   `<link>` in each template. Receive fail-closed: verify the source links to
   the target, hold for moderation, never publish on receipt.
4. **h-entry** on each post: title, content, published date, author.
5. Sending, if the site links out from posts: discover each target's endpoint
   and POST `source`/`target`, capped per run.

The reference implementation for all of this is a Cloudflare Worker with a D1
moderation queue, cited by path in the plugin's `references/site-paths.md`;
the shape (verify, hold, moderate, cap) transfers to any stack.

## Do not

Do not advertise an endpoint that 404s, and do not point `rel=me` at a
profile that does not link back and call it verified. Both pass a glance and
fail the first sender or verifier that tries them.

Run the check again at the end; every row should read `yes` except IndieAuth,
which is optional and should stay `no` until something needs it.
