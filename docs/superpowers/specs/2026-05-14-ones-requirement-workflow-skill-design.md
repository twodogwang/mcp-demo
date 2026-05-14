# ONES Requirement Workflow Skill Design

**Date:** 2026-05-14

## Goal

构建一个通用的 ONES 需求开发工作流 skill，从用户给出需求号或 bug 号开始，完成需求取数、需求档案落地、执行口径整理、按需 bug 排查、修复前分析，并在正式写代码前停在人工确认点。

MCP 在这套体系里只作为只读取数工具。skill 负责编排、归档、分析、人工闸门和后续代码修改。

## Non-Goals

- 不把 MCP 改造成完整工作流引擎
- 不使用现有 `requirements` MCP
- 不默认拉取需求下的 bug 列表
- 不自动决定某个 bug 是否属于本次修复范围
- 不自动根据 Figma 链接决定页面和设计稿映射
- 不让 Figma 参与业务口径或文案口径判断

## Architecture

整体分三层：

- `MCP 工具层`：提供 ONES 文档、需求、任务、bug、评论等只读事实
- `Skill 编排层`：识别意图、调用工具、落档、计算 baseline、生成 brief、控制人工确认点
- `需求档案层`：把需求、变更、bug episode、视觉映射和分析结果沉淀到仓库文档目录

现有 wiki 文档工具保持文档域 schema，不改造成需求实体结构。新增的需求/bug 工具属于工作项域，工作项域内部使用统一返回协议。

## Intent Model

skill 不固定用户句式，只固定语义类别。V1 支持这些意图：

- `sync_requirement`：同步需求并落档
- `analyze_requirement`：基于已有或新同步内容分析需求
- `sync_requirement_change`：同步 ONES 需求正文变更并重算 baseline
- `list_requirement_bugs`：人工触发查看某需求下 bug 列表
- `view_bug`：人工触发查看并排查某个 bug
- `repair_bug`：人工触发进入某个 bug 的修复流程
- `sync_figma_visual_reference`：人工触发同步某页面/变体对应的 Figma 视觉参考

参数要求：

- 需求类意图必须解析到 `requirement_number_or_id`
- bug 类意图必须解析到 `bug_number_or_id`
- Figma 视觉参考类意图必须解析到 `page_key + variant_key`，并且 `figma-map.yaml` 中已有人工填写的链接

## Workflow State Machines

### Requirement Entry

需求入口只处理需求主档案，不默认进入 bug 域。

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

约束：

- 不默认拉 bug 列表
- 不默认查看 bug
- 不默认创建 bug 子目录
- 不自动访问 Figma
- 只更新需求主档案、Figma 映射初始表和 baseline

### Requirement Body Change

ONES 需求正文后续变更必须通过人工触发同步。

```text
resolve_requirement
-> collect_requirement_detail
-> snapshot_requirement_source
-> diff_against_latest_snapshot
-> recompute_working_baseline
-> await_human_action
```

如果新需求正文和已采纳的人工变更冲突，skill 只记录冲突，不自动裁决。

### Bug List

需求下 bug 列表只能人工触发。

```text
resolve_requirement
-> list_requirement_bugs
-> present_bug_list
-> await_human_action
```

该流程默认只展示列表，不为每个 bug 创建档案。

### Bug View

查看 bug 是只读排查流程，不改代码。

```text
resolve_bug
-> resolve_parent_requirement
-> build_or_update_requirement_archive_if_missing
-> sync_bug_into_archive
-> classify_bug_episode
-> analyze_bug
-> stop_for_owner_decision
```

`stop_for_owner_decision` 的含义是：已经完成排查，但还没有确认由当前会话修复。

### Bug Repair

修复 bug 也不能直接写代码，必须先排查，再经人工确认进入实现。

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

人工闸门：

- `stop_for_owner_decision`：确认这个 bug 是否由当前会话继续修
- `await_human_confirmation`：确认 repair brief 后才允许改代码

### Figma Visual Reference

Figma 只作为手动维护的视觉参考，不参与需求 baseline。

```text
select_page_variant
-> read_figma_map
-> validate_mapped_item
-> fetch_figma_visual_context
-> write_visual_reference
-> await_human_action
```

只有当 `figma-map.yaml` 中某项满足 `status=mapped` 且 `figma_url` 非空时，skill 才能使用 Figma。

## MCP Tool Contracts

### Existing Document Domain

现有文档域工具保持原 schema：

```json
{
  "doc": {},
  "llm_view": {},
  "human_view": {},
  "raw": {}
}
```

这类工具继续服务 wiki 文档读取、分块、摘要和 section 读取，不需要返回工作项实体外壳。

### New Work Item Domain

新增需求/bug 工具共享统一实体外壳：

```json
{
  "entity_type": "requirement",
  "task_id": "8k9CT5AtRvC41qxJ",
  "number": 47520,
  "summary": "后台管理系统数据权限重构",
  "task_type": {
    "id": "15eiaFu6",
    "name": "需求"
  },
  "status": {
    "id": "status-id",
    "name": "进行中"
  },
  "owner": {
    "id": "user-id",
    "name": "张三"
  },
  "assignee": {
    "id": "user-id",
    "name": "李四"
  },
  "team": {
    "id": "63FL1oSZ",
    "name": "团队名称"
  },
  "parent_task_id": null,
  "url": "https://1s.oristand.com/project/#/team/63FL1oSZ/task/8k9CT5AtRvC41qxJ",
  "updated_at": "2026-05-14T10:20:30+08:00"
}
```

V1 最小工具面：

- `resolve_requirement`
- `get_requirement_detail`
- `get_execution_tasks`
- `resolve_bug`
- `get_bug_detail`
- `get_bug_parent_requirement`
- `list_requirement_bugs`
- `get_task_messages`

工具边界：

- MCP 只返回事实，不输出修复建议
- MCP 不计算 baseline
- MCP 不判断某个 execution task 是否为主任务
- MCP 不默认拉 bug
- MCP 返回标准字段时保留 `raw_payload`

## Skill Internal Source Model

skill 内部把不同 MCP 来源归一为 source record：

```ts
type SourceRecord = {
  source_kind:
    | "requirement_detail"
    | "wiki_doc"
    | "execution_task"
    | "bug_detail"
    | "task_message"
    | "manual_change"
    | "figma_visual_reference";
  source_ref: string;
  title: string;
  body_markdown?: string;
  body_structured?: unknown;
  metadata?: Record<string, unknown>;
  captured_at: string;
  raw: unknown;
};
```

baseline 合并规则：

- `requirement_detail` 默认可进入 baseline
- `wiki_doc` 默认进入 notes，不自动进入 baseline
- `execution_task` 默认进入 notes，不自动进入 baseline
- `task_message` 默认进入 notes，只有人工采纳后才可进入 baseline
- `manual_change` 只有 `status=accepted` 才可进入 baseline
- `bug_detail` 只进入 bug 档案，不进入需求 baseline
- `figma_visual_reference` 只服务 UI 实现，不进入需求 baseline
- agent 自己的推断永不直接进入 baseline

## Requirement Archive Structure

需求档案根目录：

```text
docs/ones-workflow/requirements/
```

单个需求目录：

```text
docs/ones-workflow/requirements/
  47520-data-permission-refactor/
    manifest.json
    sources/
      requirement/
        current.json
        snapshots/
          2026-05-14T102030+0800.json
      execution-tasks/
        current.json
        snapshots/
          2026-05-14T102130+0800.json
      wiki/
        index.json
      messages/
        index.json
    baseline/
      working-baseline.md
      sync-log.md
      conflicts.md
    changes/
      manual/
        change-2026-05-14-01.yaml
    notes/
      requirement-brief.md
      code-analysis.md
    visual/
      figma-map.yaml
      references/
    bugs/
```

`working-baseline.md` 固定结构：

```md
# Working Baseline

## Scope
- ...
  - source: sources/requirement/current.json

## Explicit Non-Scope
- ...
  - source: changes/manual/change-2026-05-14-01.yaml
  - status: accepted

## Accepted Clarifications
- ...
  - source: sources/messages/index.json#msg-id

## Open Questions
- ...
  - source: unresolved
```

人工变更文件最少字段：

```yaml
id: change-2026-05-14-01
related_requirement: 47520
source_type: manual
summary: 这次只处理管理后台，不处理客户端展示
status: proposed
accepted_by:
accepted_at:
evidence:
```

## Bug Archive Structure

bug 目录只在人工查看或处理具体 bug 时创建。

```text
bugs/
  127599-buyer-transfer-button/
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

bug 不以描述版本为核心管理，而以修复轮次管理。

episode 分类：

- 首次处理同一个 bug：`new_episode`
- 同一个 bug 再次进入且问题范围明显扩大：`new_episode`
- 同一个 bug 再次进入且只是补修上次遗漏：`continue_latest_episode`

分类输出：

```json
{
  "bug_id": "127599",
  "decision": "continue_latest_episode",
  "based_on_episode": "ep-01",
  "reason": "same symptom family and same root cause path"
}
```

`knowledge.md` 固定结构：

```md
# Bug Knowledge

## Stable Facts
## Confirmed Root Causes
## Files Touched Before
## Verification That Already Worked
## Dead Ends
## Follow-up Risks
```

## Figma Visual Mapping

Figma 只提供样式、像素还原基准和交互展示。Figma 不提供文案、业务规则、字段语义、权限规则或接口逻辑。

核心文件：

```text
visual/
  figma-map.yaml
```

结构：

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

  - page_key: buyer-management
    page_name: Buyer管理
    variant_key: bd-director-permission
    variant_name: BD总监权限态
    source_reason: 需求提到 BD 总监编辑权限
    figma_url:
    status: unmapped
    notes:
```

`status` 只允许：

- `unmapped`
- `mapped`
- `ignored`

生成与合并规则：

- skill 可根据需求正文生成初始 `page_key`、`page_name`、`variant_key`、`variant_name`、`source_reason`
- skill 不自动填写 `figma_url`
- skill 不自动把状态改为 `mapped`
- 以 `page_key + variant_key` 作为稳定键
- 重新同步需求时只追加新项，不覆盖人工填写的 `figma_url`、`status`、`notes`
- 已标记 `ignored` 的项必须保留
- 需求里不再出现的项不删除，只追加 `stale_hint`

视觉参考输出：

```text
visual/
  references/
    buyer-management/
      bd-director-permission/
        manifest.json
        screenshot.png
        visual-reference.md
```

`visual-reference.md` 只允许记录：

- 布局
- 间距
- 组件外观
- 视觉状态
- 交互展示
- 响应式表现

## Human Gates

V1 必须保留这些人工确认点：

- 需求主流程完成后停在 `await_human_action`
- bug 排查完成后停在 `stop_for_owner_decision`
- bug 修复写代码前停在 `await_human_confirmation`
- Figma 映射只能人工填写，skill 不能自动绑定页面和设计稿
- manual change 只有人工标记 `accepted` 后才能进入 baseline

## Testing Strategy

设计文档阶段不要求实现测试。后续实现时建议覆盖：

- 工作项域 schema 输出稳定性
- 需求入口不默认拉 bug
- bug list 只在人工触发时调用
- bug repair 在写代码前必须产出 repair brief 并等待确认
- `figma-map.yaml` merge 不覆盖人工字段
- Figma 不进入 `working-baseline.md`

## Risks

- ONES 的需求、执行任务、bug 关系可能需要多跳解析，MCP 返回应保留 `resolution_path`
- 同一个需求可能存在多个执行任务，skill 不应假定只有一个主任务
- bug 是否属于本次修复范围必须由人工决定
- Figma 映射如果人工未维护，skill 只能按需求和现有代码实现 UI
- baseline 如果缺少来源标记，后续变更会难以追溯
