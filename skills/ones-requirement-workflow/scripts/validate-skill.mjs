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
  "await_feature_scenario_confirmation",
  "await_plan_confirmation",
  "stop_for_owner_decision",
  "await_human_confirmation",
  "complete_requirement_sources",
  "get_requirement_detail_by_ref",
  "get_execution_tasks_by_ref",
  "extract_requirement_materials_by_ref",
  "list_requirement_bugs_by_ref",
  "get_bug_detail_by_ref",
  "get_bug_parent_requirement_by_ref",
  "download_ones_resource",
  "analysis/feature-scenarios.md",
  "Figma MCP",
  "visual/references/<feature-key>/<scenario-key>",
  "decisions/decisions.md",
  "analysis/coverage-check.md",
  "plans/frontend-plan.md",
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

const hasBlockedRunEval = evals.evals.some((item) =>
  String(item.prompt).includes("#794") &&
  item.expectations.some((expectation) =>
    expectation.includes("does not create a fabricated archive"),
  ),
);

if (!hasBlockedRunEval) {
  fail("evals.json must cover the blocked #794 tool-unavailable scenario.");
}

const hasHumanGateEval = evals.evals.some((item) =>
  item.expectations.some((expectation) =>
    expectation.includes("human gate") ||
    expectation.includes("human decision") ||
    expectation.includes("await_feature_scenario_confirmation") ||
    expectation.includes("await_plan_confirmation"),
  ),
);

if (!hasHumanGateEval) {
  fail("evals.json must cover the user-facing human gate interaction.");
}

const hasFigmaMcpEval = evals.evals.some((item) =>
  item.expectations.some((expectation) =>
    expectation.includes("Figma MCP") &&
    expectation.includes("node"),
  ),
);

if (!hasFigmaMcpEval) {
  fail("evals.json must cover Figma MCP node-based visual references.");
}

const hasFeatureScenarioEval = evals.evals.some((item) =>
  item.expectations.some((expectation) =>
    expectation.includes("feature scenarios") ||
    expectation.includes("feature/scenario"),
  ),
);

if (!hasFeatureScenarioEval) {
  fail("evals.json must cover feature/scenario decomposition.");
}

const hasByRefEval = evals.evals.some((item) =>
  item.expectations.some((expectation) => expectation.includes("by_ref")),
);

if (!hasByRefEval) {
  fail("evals.json must cover by_ref work-item tool entry points.");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("ones-requirement-workflow skill validation ok");
