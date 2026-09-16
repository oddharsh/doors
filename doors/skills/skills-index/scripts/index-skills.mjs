#!/usr/bin/env node
// index-skills.mjs — write /.well-known/agent-skills/index.json from a directory
// of skills, with the digest the RFC requires computed from the bytes that will
// ship, so the index cannot disagree with the artifacts.
//
//   node index-skills.mjs <dir>                               print the index
//   node index-skills.mjs <dir> --out public/.well-known/agent-skills/index.json
//   node index-skills.mjs <dir> --base https://example.com    absolute urls (default: /.well-known/agent-skills/<name>/SKILL.md)
//   node index-skills.mjs <dir> --check <index.json>          exit 1 if the committed index disagrees with the bytes
//
// <dir> holds one subdirectory per skill, each with a SKILL.md whose YAML
// frontmatter carries `name` and `description`. The entry's name is the
// directory name and the description is the frontmatter's, so there is one
// place to edit. `--check` is the shape to run in CI: a SKILL.md edited without
// re-running this script is exactly the drift a client is told to refuse.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const args = process.argv.slice(2); const dir = args.find((a) => !a.startsWith("--"));
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
if (!dir) { console.error("usage: index-skills.mjs <dir> [--out file] [--base https://host] [--check index.json]"); process.exit(2); }
const base = (opt("--base") || "").replace(/\/$/, "");

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return null;
  const fm = {}; for (const line of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line); if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, ""); }
  return fm;
}
const skills = [];
for (const name of readdirSync(dir).sort()) {
  const p = join(dir, name, "SKILL.md"); let st; try { st = statSync(p); } catch { continue; } if (!st.isFile()) continue;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) { console.error(`skip ${name}: a skill name is lowercase letters, digits and hyphens`); continue; }
  const bytes = readFileSync(p); const fm = frontmatter(bytes.toString("utf8"));
  if (!fm?.description) { console.error(`skip ${name}: SKILL.md has no frontmatter description`); continue; }
  if (fm.name && fm.name !== name) console.error(`warn ${name}: frontmatter name is "${fm.name}"; the index uses the directory name`);
  skills.push({ name, type: "skill-md", description: fm.description, url: `${base}/.well-known/agent-skills/${name}/SKILL.md`, digest: "sha256:" + createHash("sha256").update(bytes).digest("hex") });
}
const index = { $schema: SCHEMA, skills };
const text = JSON.stringify(index, null, 2) + "\n";
const check = opt("--check");
if (check) {
  let committed; try { committed = JSON.parse(readFileSync(check, "utf8")); } catch (e) { console.error(`cannot read ${check}: ${e.message}`); process.exit(1); }
  const want = new Map(skills.map((s) => [s.name, s.digest])); const have = new Map((committed.skills || []).map((s) => [s.name, s.digest]));
  const drift = [...want].filter(([n, d]) => have.get(n) !== d).map(([n]) => n).concat([...have.keys()].filter((n) => !want.has(n)));
  if (drift.length) { console.error(`${check} disagrees with ${dir} on: ${drift.join(", ")} (re-run without --check and commit the result)`); process.exit(1); }
  console.log(`${check}: ${skills.length} skill${skills.length === 1 ? "" : "s"}, every digest agrees with the bytes`); process.exit(0);
}
const out = opt("--out");
if (out) { writeFileSync(out, text); console.log(`wrote ${out}: ${skills.length} skill${skills.length === 1 ? "" : "s"}`); } else process.stdout.write(text);
