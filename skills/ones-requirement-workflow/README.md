# ONES Requirement Workflow Skill

Project-local Codex skill for ONES-driven development work.

Current workflow centers on `analysis/feature-scenarios.md`, Figma MCP node-based visual references, `plans/frontend-plan.md`, `analysis/coverage-check.md`, and human confirmation gates before implementation.

## Files

- `SKILL.md`: the skill instructions.
- `evals/evals.json`: pressure prompts and expectations for behavior review.
- `scripts/validate-skill.mjs`: static validation for frontmatter, eval shape, and required workflow rules.

## Validate

Run:

```bash
npm run skill:validate
```

This validates only the project-local skill. It does not install or sync the skill to the global Codex skills directory.

## Install Later

When the project-local version is accepted, copy this directory to the Codex skills directory or use the repository's preferred skill installation process.
