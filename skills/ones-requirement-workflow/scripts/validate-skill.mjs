import fs from "node:fs";
import path from "node:path";

const skillRoot = path.resolve(import.meta.dirname, "..");
const skillPath = path.join(skillRoot, "SKILL.md");
const evalsPath = path.join(skillRoot, "evals", "evals.json");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    fail(`Missing ${label}: ${needle}`);
  }
}

const skill = fs.readFileSync(skillPath, "utf8");
const evals = JSON.parse(fs.readFileSync(evalsPath, "utf8"));

if (!skill.startsWith("---\n")) {
  fail("SKILL.md must start with YAML frontmatter.");
}

const frontmatterEnd = skill.indexOf("\n---", 4);
if (frontmatterEnd === -1) {
  fail("SKILL.md frontmatter is not closed.");
}

const frontmatter = skill.slice(4, frontmatterEnd);
assertIncludes(frontmatter, "name: ones-requirement-workflow", "skill name");
assertIncludes(frontmatter, "description:", "skill description");

[
  "Do not use the `requirements` MCP server",
  "Do not automatically list bugs",
  "await_human_action",
  "stop_for_owner_decision",
  "await_human_confirmation",
  "figma-map.yaml",
  "Only use Figma when the selected item has `status=mapped`",
  "`working-baseline.md` is the current",
].forEach((needle) => assertIncludes(skill, needle, "required workflow rule"));

if (evals.skill_name !== "ones-requirement-workflow") {
  fail("evals.json skill_name must match frontmatter name.");
}

if (!Array.isArray(evals.evals) || evals.evals.length < 4) {
  fail("evals.json must include at least 4 evals.");
}

const ids = new Set();
for (const item of evals.evals) {
  if (ids.has(item.id)) {
    fail(`Duplicate eval id: ${item.id}`);
  }
  ids.add(item.id);

  for (const field of ["prompt", "expected_output", "files", "expectations"]) {
    if (!(field in item)) {
      fail(`Eval ${item.id} is missing ${field}.`);
    }
  }

  if (!Array.isArray(item.expectations) || item.expectations.length === 0) {
    fail(`Eval ${item.id} must include expectations.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("ones-requirement-workflow skill validation ok");
