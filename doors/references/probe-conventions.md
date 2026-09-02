# How the probes here are built, and why each has a control

Every script in this plugin follows three rules that the reference site learned
the expensive way. They are stated once here so each SKILL.md can point at them.

## 1. A check that has never gone red is decoration

Before a probe reports on a stranger's site it has to be shown that it can fail.
Each script therefore carries a control: `agent-audit` fetches the homepage as a
browser and as itself before grading anything, because a site that refuses the
instrument makes every "absent" below it uninterpretable; the Markdown replay
carries a browser row that must come back HTML; the dictionary check offers a
known-wrong dictionary tag and expects plain brotli back. When the control fails
the script says the target is unmeasurable, which is a different answer from
"has nothing".

## 2. Verdicts, never booleans

A door is `yes`, `likely`, `maybe`, `no`, or `unknown`, with a one-line detail
that names the evidence. `unknown` means the origin did not answer (5xx, timeout)
and is not evidence of absence. A locked door (401 with a challenge) is a door:
it is reported as present and unreadable, because the thing being graded is
whether an agent can find the entrance, not whether we were let in.

## 3. Identify honestly

Every request carries a user-agent naming this plugin and the site that
authored it. The probes never wear another bot's name to get past a wall; the
one exception in the reference site (the bot-views tier) is documented there as
an exception and is not reproduced here.

## Reading a result

- Treat a `no` on a door as a to-do only if the control passed.
- Treat `maybe` as "go look": it is a shape that matches, at a status that does
  not settle it (a JSON 405 at `/mcp` is probably a POST-only server).
- The scripts print a table for people and, with `--json`, a document for
  agents. Both come from one run; nothing is fetched twice.
