# Traps, each from a measurement

- **Script bodies never reach the twin.** A page that carries a
  `<script type="application/json">` with a quiz's answer key, or any inline
  state, would publish it as prose through a converter that walks script
  bodies. Treat `script` and `style` as opaque and drop them. Assert it over
  every page, and count what the assertion checked: the reference site's
  first version of that test read the wrong field names, asserted nothing,
  and reported a pass.
- **Interactive controls render nothing.** A `<button>` in a live demo is not
  content; its label without its behaviour is a claim an agent reads as fact.
  The prose around the demo still converts.
- **Read the source tree, not the staged one.** A twin generated from
  minified, rewritten output carries hashed asset paths and stripped
  whitespace; generate from what the author wrote.
- **A HEAD is not a GET.** A negotiating handler that bails on
  `method !== "GET"` makes `curl -I` report HTML on a page whose GET returns
  Markdown, which reads exactly like the caching bug above and is not it.
  Decide the headers once and drop the body for HEAD.
- **A page that is rendered per request has no file to convert.** Give it a
  hand-written twin, and pin the facts it states against the code that makes
  them true, so bumping a version in the code fails the build until the twin
  agrees. The reference site pins three of seven this way and says which four
  can drift.
- **A route with no page gets neither tier.** A bare redirect has no HTML to
  convert and nothing fixed for a hand twin to state; render its Markdown
  live from the same data, or drop the agent flag rather than advertise a
  surface an agent cannot read.
- **Measure the byte delta DECODED.** `Content-Length` is usually absent on a
  chunked or compressed response, and where present describes compressed
  bytes while the sample beside it is decoded; comparing the two measures two
  quantities and calls the difference a saving. An agent spends context on
  characters. Measured: a 135 KB docs page against 3.5 KB of Markdown, 38x.
