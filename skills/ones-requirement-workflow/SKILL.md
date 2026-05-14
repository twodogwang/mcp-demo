---
name: ones-requirement-workflow
description: Use this skill whenever the user asks to work from an ONES requirement number or bug number into development work: syncing a requirement, reading ONES requirement content, building a requirement archive, analyzing requirement scope, checking a specific bug, preparing a bug repair brief, or starting implementation from ONES context. This skill is also required when the user mentions ONES requirement workflow, requirement dossier/archive, bug episode, working baseline, or Figma links tied to ONES requirements.
---

# ONES Requirement Workflow

Use this skill to move from an ONES requirement or bug reference to development-ready context. Keep ONES MCP tools as read-only data sources; use this skill for workflow orchestration, archive updates, baseline decisions, bug episode handling, and human confirmation gates.

## Core Rules

- Answer in Chinese unless the user explicitly asks otherwise.
- Do not use the `requirements` MCP server for this workflow.
- Treat ONES MCP tools as read-only fact providers. Do not put baseline computation, repair decisions, or workflow state into MCP.
- Do not automatically list bugs for a requirement. Bug lists are only fetched when the user explicitly asks.
- Do not automatically decide that a bug belongs to the current repair scope.
- Do not edit code before the required human gate for the active flow has passed.
- Do not let Figma provide copy, business rules, field semantics, permission rules, or API logic. Figma is only a visual reference for style, pixel restoration, and interaction display.

## Supported Intents

Classify the user's request by intent, not by exact phrasing.

- `sync_requirement`: sync a requirement and update the archive.
- `analyze_requirement`: analyze requirement scope and implementation context.
- `sync_requirement_change`: sync changed ONES requirement body and recompute baseline.
- `list_requirement_bugs`: list bugs under a requirement, only when explicitly asked.
- `view_bug`: inspect and triage a specific bug without changing code.
- `repair_bug`: prepare and, after confirmation, fix a specific bug.
- `sync_figma_visual_reference`: use a manually mapped Figma link for a page variant.

Required parameters:

- Requirement intents require `requirement_number_or_id`.
- Bug intents require `bug_number_or_id`.
- Figma visual reference intent requires `page_key` and `variant_key` from `visual/figma-map.yaml`.

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

## Requirement Flow

For requirement sync or analysis:

```text
resolve_requirement
-> collect_requirement_detail
-> collect_execution_tasks
-> infer_page_variant_candidates
-> merge_figma_map
-> build_or_update_requirement_archive
-> compute_working_baseline
-> await_human_action
```

Rules:

- Update only the requirement main archive, baseline, notes, and initial Figma map.
- Do not call bug-list tools in this flow.
- Do not create bug subdirectories in this flow.
- Do not access Figma in this flow.
- Stop at `await_human_action` and report what is ready.

## Requirement Change Flow

For ONES requirement body changes:

```text
resolve_requirement
-> collect_requirement_detail
-> snapshot_requirement_source
-> diff_against_latest_snapshot
-> recompute_working_baseline
-> await_human_action
```

If new requirement content conflicts with accepted manual changes, record the conflict in `baseline/conflicts.md` and ask the user to decide. Do not resolve conflicts silently.

## Bug List Flow

Only list bugs when the user explicitly asks.

```text
resolve_requirement
-> list_requirement_bugs
-> present_bug_list
-> await_human_action
```

Do not create one archive directory per listed bug. A bug archive is created only when the user asks to view or repair that specific bug.

## Bug View Flow

Viewing a bug is read-only triage.

```text
resolve_bug
-> resolve_parent_requirement
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
resolve_bug
-> resolve_parent_requirement
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

## Baseline Rules

`working-baseline.md` is the current execution口径, not a dump of every source.

Allowed inputs:

- `requirement_detail`: may enter baseline by default.
- `wiki_doc`: goes to notes by default.
- `execution_task`: goes to notes by default.
- `task_message`: goes to notes by default; may enter baseline only after human acceptance.
- `manual_change`: may enter baseline only when `status=accepted`.
- `bug_detail`: enters bug archive only.
- `figma_visual_reference`: serves UI implementation only.
- Agent inference: never enters baseline directly.

Every baseline item must include a source reference.

Use this structure:

```md
# Working Baseline

## Scope
## Explicit Non-Scope
## Accepted Clarifications
## Open Questions
```

## Manual Changes

Put manually supplied changes under:

```text
changes/manual/
```

Minimum fields:

```yaml
id: change-YYYY-MM-DD-01
related_requirement: 47520
source_type: manual
summary: ""
status: proposed
accepted_by:
accepted_at:
evidence:
```

Only `status=accepted` content can enter `working-baseline.md`.

## Figma Visual Mapping

Figma links are manually maintained. The skill may generate an initial page and variant table from requirement content, but it must not fill links automatically.

Core file:

```text
visual/
  figma-map.yaml
```

Structure:

```yaml
requirement: 47520
version: 1
items:
  - page_key: buyer-management
    page_name: Buyer管理
    variant_key: default
    variant_name: 默认态
    source_reason: 需求提到 Buyer 管理页面
    figma_url:
    status: unmapped
    notes:
```

Allowed statuses:

- `unmapped`
- `mapped`
- `ignored`

Merge rules:

- Stable key is `page_key + variant_key`.
- Add newly inferred items as `unmapped`.
- Preserve human-filled `figma_url`, `status`, and `notes`.
- Preserve `ignored` entries.
- If an existing item no longer appears in the requirement, do not delete it; add a `stale_hint`.

Only use Figma when the selected item has `status=mapped` and a non-empty `figma_url`.

Visual reference output:

```text
visual/
  references/
    <page-key>/
      <variant-key>/
        manifest.json
        screenshot.png
        visual-reference.md
```

`visual-reference.md` may contain only layout, spacing, component appearance, visual states, interaction display, and responsive notes.

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

Expected read-only work-item tools:

- `resolve_requirement`
- `get_requirement_detail`
- `get_execution_tasks`
- `resolve_bug`
- `get_bug_detail`
- `get_bug_parent_requirement`
- `list_requirement_bugs`
- `get_task_messages`

If one of these tools is unavailable, report the missing capability and continue with the closest available read-only source. Do not fall back to the separate `requirements` MCP.

## Before Code Changes

Before editing code from this workflow, ensure:

- The active requirement or bug archive exists.
- `working-baseline.md` exists or the missing baseline has been explicitly accepted by the user.
- For bug repair, the selected episode and `repair-brief.md` exist.
- The user has confirmed the repair brief.
- Any Figma usage is backed by a manually mapped `figma-map.yaml` entry.

After implementation, update the relevant archive files:

- Requirement work: `notes/code-analysis.md` or implementation notes as appropriate.
- Bug work: episode `implementation-summary.md`, `verification.md`, and `knowledge.md`.
