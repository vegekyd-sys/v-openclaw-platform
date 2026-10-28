// Capture V's skill catalog metadata for lab/candidate/skills-catalog.mjs, read-only.
//
// For every skill directory under V's skill roots it records the root, the directory name and the
// SKILL.md frontmatter block verbatim (name, description, metadata/requires). Bodies are not copied:
// the candidate only needs what decides eligibility and what the catalog renders. Bundled and
// custodian skills come from the runtime itself, so they are listed but not captured.
//
// It also records which skills.entries keys V's config switches on or off (the flag only, never an
// apiKey or other value).
//
// Usage (on V):  sudo -u openclaw node skills-catalog-capture.mjs > v-skills-catalog-capture.json
import fs from "node:fs";
import path from "node:path";

const home = process.env.HOME ?? "/home/openclaw";
const workspace = process.argv[2] ?? path.join(home, "makaron-openclaw/.openclaw-local/workspace");
// Highest precedence last, as workspace-skill-loader merges them.
const roots = [
  ["openclaw-extra", path.join(home, ".openclaw/plugin-skills")],
  ["openclaw-managed", path.join(home, ".openclaw/skills")],
  ["agents-skills-personal", path.join(home, ".agents/skills")],
  ["agents-skills-project", path.join(workspace, ".agents/skills")],
  ["openclaw-workspace", path.join(workspace, "skills")],
];
const frontmatter = (file) => {
  const text = fs.readFileSync(file, "utf8");
  return /^---\r?\n[\s\S]*?\r?\n---/u.exec(text)?.[0] ?? null;
};
const skills = [];
for (const [source, root] of roots) {
  if (!fs.existsSync(root)) continue;
  for (const dir of fs.readdirSync(root).sort()) {
    const file = path.join(root, dir, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    skills.push({ source, dir, frontmatter: frontmatter(file) });
  }
}
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH ?? path.join(home, ".openclaw/openclaw.json"), "utf8"));
const skillsEntries = Object.fromEntries(Object.entries(config.skills?.entries ?? {}).map(([key, entry]) => [key, { enabled: entry?.enabled }]));
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), workspace, roots, skillsEntries, skills }));
