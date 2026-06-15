---
name: ones-requirement-workflow
description: Use when a user works from ONES requirement or bug numbers, ONES requirement archives, feature scenarios, Figma MCP visual references, requirement changes, or bug repair episodes tied to ONES-driven development.
---

# ONES Requirement Workflow

Use this skill to move from an ONES requirement or bug reference to real implementation. ONES MCP tools are read-only fact providers; this skill owns workflow orchestration, archive updates, feature/scenario decomposition, Figma MCP visual references, human gates, implementation planning, code changes, and write-back records.

## Core Rules

- Answer in Chinese unless the user explicitly asks otherwise.
- Write user-facing archive documents in Chinese, especially briefs, decisions, frontend plans, technical plans, coverage checks, and human-gate questions. Keep code identifiers, API paths, enum values, and source titles unchanged when translating would reduce precision.
- Do not use the `requirements` MCP server for this workflow.
- Treat ONES MCP tools as read-only fact providers. Do not put workflow state, implementation decisions, or repair decisions into MCP.
- Do not automatically list bugs for a requirement. Bug lists are only fetched when the user explicitly asks.
- Do not automatically decide that a bug belongs to the current repair scope.
- Do not edit code before the required human gate for the active flow has passed.
- Figma is a pixel-level implementation input. If a scenario is mapped to Figma, use Figma MCP to read the concrete node context before planning or implementing that scenario.
- Do not use screenshots, PRD images, OCR, browser screenshots, or informal descriptions as substitutes for Figma node data.
- Do not let Figma provide business rules, field semantics, permission rules, API logic, or final copy. Those come from ONES requirement sources and accepted decisions.

## Supported Intents

Classify the user's request by intent, not by exact phrasing.

- `sync_requirement`: sync a requirement and update the archive.
- `complete_requirement_sources`: extract and sync missing PRD/wiki/resource/message source material for a requirement archive.
- `draft_feature_scenarios`: split a requirement into implementable features, scenarios, acceptance points, and UI variants.
- `sync_figma_references`: read mapped Figma nodes with Figma MCP and write visual implementation references.
- `analyze_codebase`: inspect existing code against feature scenarios.
- `draft_frontend_plan`: write the frontend implementation plan.
- `coverage_check`: verify requirement/scenario/Figma/code-task coverage before implementation.
- `implement_requirement`: implement after plan confirmation.
- `sync_requirement_change`: sync changed ONES requirement body and update affected scenarios/decisions/plans.
- `list_requirement_bugs`: list bugs under a requirement, only when explicitly asked.
- `view_bug`: inspect and triage a specific bug without changing code.
- `repair_bug`: prepare and, after confirmation, fix a specific bug.

Required parameters:

- Requirement intents require `requirement_number_or_id`.
- Bug intents require `bug_number_or_id`.
- Figma reference intents require a scenario with `status=mapped` and a valid `figma_url` or `file_key + node_id` in `analysis/feature-scenarios.md`.

If a required parameter is missing, ask one concise clarification question.

## Archive Location

Store requirement archives under the repository:

```text
docs/ones-workflow/requirements/
```

Use a stable directory name:

```text
<requirement-number>-<short-kebab-summary>/
```

Do not overwrite user-maintained fields when updating archive files.

## Archive Structure

Use this structure for active requirement work:

```text
docs/ones-workflow/requirements/<requirement>/
  manifest.json
  sources/
    requirement/
    execution-tasks/
    wiki/
    materials/
    messages/
  analysis/
    requirement-brief.md
    feature-scenarios.md
    code-analysis.md
    coverage-check.md
  plans/
    frontend-plan.md
  decisions/
    decisions.md
    conflicts.md
    sync-log.md
  visual/
    references/<feature-key>/<scenario-key>/
      manifest.json
      figma-context.json
      visual-reference.md
      assets/
    verification/<feature-key>/<scenario-key>/
      browser-screenshot.png
      comparison.md
  bugs/
```

Legacy archives may still contain `baseline/working-baseline.md` or `visual/figma-map.yaml`. Do not extend those files for new workflow state. When updating a legacy archive, migrate useful confirmed content into `analysis/feature-scenarios.md` or `decisions/decisions.md`.

## Requirement Flow

For requirement sync or analysis:

```text
get_requirement_detail_by_ref
-> get_execution_tasks_by_ref
-> extract_requirement_materials_by_ref
-> build_or_update_requirement_archive
-> draft_requirement_brief
-> draft_feature_scenarios
-> await_feature_scenario_confirmation
```

Rules:

- Update only the requirement main archive, source files, `analysis/requirement-brief.md`, and `analysis/feature-scenarios.md`.
- Do not call bug-list tools in this flow.
- Do not create bug subdirectories in this flow.
- Do not access Figma in this flow.
- Stop at `await_feature_scenario_confirmation`, report what is ready, and ask the user to confirm the scenario decomposition before continuing.

At `await_feature_scenario_confirmation`, ask 1-3 concrete questions covering:

- Whether `analysis/feature-scenarios.md` correctly captures the business features and scenarios.
- Whether any missing Figma mappings should be filled before code analysis or frontend planning.
- Which next action the user wants: source completion, Figma MCP reference sync, codebase analysis, or frontend plan.

Do not silently proceed beyond this gate.

## Source Completion

`complete_requirement_sources` should call `extract_requirement_materials_by_ref` to discover wiki pages, external links, rich resources, and next actions. Fetch ONES wiki pages with document-domain tools when discovered.

Rules:

- Record external links such as Axure or Tencent Docs as source references; do not scrape them unless a separate approved tool exists.
- Call `get_task_messages_by_ref` only when the user asks for comments/messages or when the source completeness check says messages are needed for the current decision.
- Material completeness hints go to sources/notes only. They are not implementation facts.

## Feature Scenarios

`analysis/feature-scenarios.md` is the core bridge from long requirement material to implementation. It replaces the old mixed-purpose `working-baseline.md` and the separate `figma-map.yaml`.

Use this hierarchy:

```text
Requirement
-> Feature
-> Scenario / acceptance branch
-> UI Variant
-> Figma node(s)
-> Code analysis / plan / implementation task
```

Write each feature and scenario with stable keys:

```md
# Feature Scenarios

## F1 Buyer 发起提现申请
Source: `sources/wiki/pages/KkVZSkGh.md#1.1`, `sources/wiki/pages/KkVZSkGh.md#2.1.1`

### S1 默认申请页
- Scenario key: `default-apply-page`
- Page: PHP Buyer端 / 余额提现申请页
- Acceptance:
  - 用户可从资金管理进入提现申请页。
  - 页面展示基础提现信息、收款账号区域和提交入口。
- UI Variant: `php-buyer-withdrawal-apply/default`
- Figma:
  - status: `unmapped`
  - figma_url:
  - file_key:
  - node_id:
  - purpose: `base_layout`

### S2 非首次提现展示平台手续费
- Scenario key: `repeat-withdrawal-fee`
- Page: PHP Buyer端 / 余额提现申请页
- Acceptance:
  - 当月重复提现时展示预计平台手续费和收费规则提醒。
- UI Variant: `php-buyer-withdrawal-apply/repeat-with-fee`
- Figma:
  - status: `unmapped`
  - figma_url:
  - file_key:
  - node_id:
  - purpose: `fee_state`
```

Figma statuses:

- `unmapped`: scenario needs a visual reference but no Figma node is filled.
- `mapped`: a valid Figma URL or `file_key + node_id` is manually filled.
- `visual_blocked`: Figma should exist but MCP cannot read it or the link is invalid.
- `not_needed`: no UI or no distinct visual state for this scenario.
- `ignored`: intentionally not implemented or not in this iteration.

Do not split every Figma image into a separate feature. Features represent deliverable business capability; scenarios represent states, branches, and acceptance cases.

## Figma MCP Reference Flow

For scenarios with `Figma.status=mapped`:

```text
read_feature_scenarios
-> validate_mapped_figma_nodes
-> fetch_figma_node_context_with_mcp
-> write_visual_reference
-> await_human_action
```

Rules:

- Use Figma MCP, not screenshots or informal descriptions, to read node context.
- Store raw or structured node information in `visual/references/<feature-key>/<scenario-key>/figma-context.json`.
- Store implementable visual instructions in `visual/references/<feature-key>/<scenario-key>/visual-reference.md`.
- `visual-reference.md` may contain only layout, spacing, component appearance, visual states, interaction display, responsive notes, assets, and implementation-relevant visual details.
- If Figma MCP is unavailable or a mapped node cannot be read, mark the scenario `visual_blocked` and ask the user whether to fix the mapping or continue without pixel-level implementation for that scenario.
- A frontend plan may not claim pixel-level restoration for a scenario unless its Figma MCP reference was successfully written.

## Decisions And Manual Changes

Use `decisions/decisions.md` for human confirmations, oral changes, conflict decisions, and accepted clarifications.

Minimum entry format:

```md
## decision-YYYY-MM-DD-01
- Related: `F1/S2`
- Source type: manual | message | conflict_resolution | scope_confirmation
- Status: proposed | accepted | rejected
- Summary:
- Evidence:
- Accepted by:
- Accepted at:
```

Only `status=accepted` decisions may affect scenarios, plans, or implementation scope. Agent inference never becomes a decision by itself.

When source material conflicts with accepted decisions, record it in `decisions/conflicts.md` and ask the user to decide. Do not resolve conflicts silently.

## Code Analysis And Frontend Plan

After feature scenarios are confirmed:

```text
analyze_codebase
-> write analysis/code-analysis.md
-> draft_frontend_plan
-> write plans/frontend-plan.md
-> coverage_check
-> await_plan_confirmation
```

Rules:

- `analysis/code-analysis.md` maps scenarios to existing routes, pages, components, APIs, state, permissions, and likely changed files.
- `plans/frontend-plan.md` must reference feature/scenario IDs such as `F1/S2`, not just free-form PRD text.
- `plans/frontend-plan.md` must reference relevant `visual-reference.md` files for mapped UI scenarios.
- `analysis/coverage-check.md` must check every scenario for plan coverage, code task coverage, visual reference status when needed, and open risks.
- Plan documents are drafts until the user explicitly confirms them. Mark them as awaiting human confirmation and do not treat them as accepted implementation scope before that confirmation.
- Stop at `await_plan_confirmation` before implementation.

## Requirement Change Flow

For ONES requirement body changes:

```text
get_requirement_detail_by_ref
-> snapshot_requirement_source
-> diff_against_latest_snapshot
-> update_requirement_brief
-> update_feature_scenarios
-> update_decisions_or_conflicts
-> await_feature_scenario_confirmation
```

If new requirement content conflicts with accepted manual decisions, record the conflict in `decisions/conflicts.md` and ask the user to decide.

## Bug List Flow

Only list bugs when the user explicitly asks.

```text
list_requirement_bugs_by_ref
-> present_bug_list
-> await_human_action
```

Do not create one archive directory per listed bug. A bug archive is created only when the user asks to view or repair that specific bug.

## Bug View Flow

Viewing a bug is read-only triage.

```text
get_bug_detail_by_ref
-> get_bug_parent_requirement_by_ref
-> build_or_update_requirement_archive_if_missing
-> sync_bug_into_archive
-> classify_bug_episode
-> analyze_bug
-> stop_for_owner_decision
```

At `stop_for_owner_decision`, report the triage result and stop. The user must explicitly decide whether the current session should repair the bug.

## Bug Repair Flow

Repairing a bug still begins with triage and must stop before implementation.

```text
get_bug_detail_by_ref
-> get_bug_parent_requirement_by_ref
-> build_or_update_requirement_archive_if_missing
-> sync_bug_into_archive
-> classify_bug_episode
-> read_bug_knowledge
-> analyze_target_code
-> prepare_repair_brief
-> await_human_confirmation
-> implement
-> verify
-> write_back
```

The two human gates are mandatory:

- `stop_for_owner_decision`: the user confirms this bug should be repaired in the current session.
- `await_human_confirmation`: the user confirms the repair brief before code changes.

The repair brief should include scope, likely root cause, files likely to change, verification plan, and known risks. Keep it concise.

## Bug Episode Handling

Manage bug work by repair episodes, not by bug description revisions.

Create bug archive only for a selected bug:

```text
bugs/
  <bug-number>-<short-kebab-summary>/
    manifest.json
    current/
      bug.json
      bug.md
    episodes/
      ep-01/
        intake.md
        triage.md
        repair-brief.md
        implementation-summary.md
        verification.md
    knowledge.md
    audit/
      events.jsonl
```

Episode classification:

- First time handling this bug: `new_episode`.
- Same bug with materially expanded scope: `new_episode`.
- Same bug with follow-up work on the same symptom/root cause path: `continue_latest_episode`.

Maintain `knowledge.md` with:

```md
# Bug Knowledge

## Stable Facts
## Confirmed Root Causes
## Files Touched Before
## Verification That Already Worked
## Dead Ends
## Follow-up Risks
```

Use this file before repeating investigation on a previously handled bug.

## MCP Contract Expectations

Existing wiki document tools keep their document-domain structure:

```json
{
  "doc": {},
  "llm_view": {},
  "human_view": {},
  "raw": {}
}
```

Work-item tools should use a normalized entity shell with standard fields such as:

```json
{
  "entity_type": "requirement",
  "task_id": "8k9CT5AtRvC41qxJ",
  "number": 47520,
  "summary": "后台管理系统数据权限重构",
  "task_type": { "id": "15eiaFu6", "name": "需求" },
  "status": { "id": "status-id", "name": "进行中" },
  "owner": { "id": "user-id", "name": "张三" },
  "assignee": { "id": "user-id", "name": "李四" },
  "team": { "id": "63FL1oSZ", "name": "团队名称" },
  "parent_task_id": null,
  "url": "https://1s.oristand.com/project/#/team/63FL1oSZ/task/8k9CT5AtRvC41qxJ",
  "updated_at": "2026-05-14T10:20:30+08:00"
}
```

Primary read-only work-item tools for normal workflow entry:

- `get_requirement_detail_by_ref`
- `get_execution_tasks_by_ref`
- `extract_requirement_materials_by_ref`
- `list_requirement_bugs_by_ref`
- `get_task_messages_by_ref`
- `get_related_wiki_pages_by_ref`
- `get_task_rich_resources_by_ref`
- `get_bug_detail_by_ref`
- `get_bug_parent_requirement_by_ref`

Compatibility and debugging tools:

- `resolve_requirement`
- `get_requirement_detail`
- `get_execution_tasks`
- `resolve_bug`
- `get_bug_detail`
- `get_bug_parent_requirement`
- `list_requirement_bugs`
- `get_task_messages`
- `extract_requirement_materials`
- `get_related_wiki_pages`
- `get_task_rich_resources`
- `download_ones_resource`

Use compatibility/debugging tools only when a task id is already known, a `*_by_ref` lookup returns ambiguous candidates, or the workflow needs to isolate whether number resolution or detail loading failed.

If one of these tools is unavailable, report the missing capability and continue with the closest available read-only source. Do not fall back to the separate `requirements` MCP.

## Before Code Changes

Before editing code from this workflow, ensure:

- The active requirement or bug archive exists.
- `analysis/feature-scenarios.md` exists and has passed user confirmation.
- Required Figma MCP references are written, or visual gaps are explicitly accepted by the user.
- `analysis/code-analysis.md`, `plans/frontend-plan.md`, and `analysis/coverage-check.md` exist for requirement implementation.
- For bug repair, the selected episode and `repair-brief.md` exist.
- The user has confirmed the frontend plan or repair brief.

After implementation, update:

- Requirement work: implementation notes, `analysis/coverage-check.md`, and visual verification records when UI scenarios were implemented.
- Bug work: episode `implementation-summary.md`, `verification.md`, and `knowledge.md`.
