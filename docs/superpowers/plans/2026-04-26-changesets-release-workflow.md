# Changesets Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前基于本地 `bumpp` 打 tag 的发布流程改造成基于 Changesets 的 Release PR 工作流，并在合并 Release PR 后自动发布 npm、创建 tag 和 GitHub Release。

**Architecture:** 保持包发布目标不变，但把版本推进和 changelog 生成从“本地脚本 + tag 触发”改为“changeset 文件 + GitHub Actions 维护 Release PR”。工作流分成贡献阶段、版本汇总阶段和自动发布阶段，减少本地手工动作并提升发布可追溯性。

**Tech Stack:** TypeScript package metadata, GitHub Actions, Changesets, npm Trusted Publishing, Vitest

---

## Planned File Structure

- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/publish-npm.yml`
- Modify: `README.md`
- Modify: `tests/release-script.test.ts`
- Create: `tests/release-workflow.test.ts`

## Implementation Notes

- 保留自动发布，但入口从 `push tag` 改为 `push main`
- 不再要求本地手工打 tag
- 继续使用 npm Trusted Publishing，不回退到长期 `NPM_TOKEN` 方案
- `README` 需要明确说明什么时候必须写 changeset，什么时候可以不写
- 不执行 `build`，除非用户明确要求；验证以 `npm test` 为主

### Task 1: 先用测试钉住新的发布契约

**Files:**
- Modify: `tests/release-script.test.ts`
- Create: `tests/release-workflow.test.ts`

- [ ] **Step 1: 写失败测试，描述新的脚本与 workflow 契约**

覆盖：
- `package.json` 包含 `changeset`、`version-packages`、`release`
- 不再强依赖 `release:patch|minor|major`
- `publish-npm.yml` 改为监听 `main`
- workflow 使用 `changesets/action`
- workflow 需要 `contents: write`、`pull-requests: write`、`id-token: write`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/release-script.test.ts tests/release-workflow.test.ts`
Expected: FAIL，因为当前还是 bumpp/tag-push 模式

### Task 2: 切换 package metadata 到 Changesets

**Files:**
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 用最小改动接入 Changesets**

实现：
- 添加 `@changesets/cli` devDependency
- 新增脚本：
  - `changeset`
  - `version-packages`
  - `release`
- 保留 `prepack`、`build`、`test` 等已有脚本

- [ ] **Step 2: 配置 `.changeset/config.json`**

要求：
- `baseBranch: "main"`
- `access: "public"`
- 使用默认 changelog 方案即可

- [ ] **Step 3: 添加 `.changeset/README.md`**

说明：
- 什么时候要写 changeset
- 什么时候可以不写
- 发布流程如何从 changeset 走到 Release PR

- [ ] **Step 4: 重新运行测试**

Run: `npm test -- tests/release-script.test.ts tests/release-workflow.test.ts`
Expected: 部分 PASS，workflow 相关仍可能 FAIL

### Task 3: 改造 GitHub Actions 为 Release PR + 自动发布

**Files:**
- Modify: `.github/workflows/publish-npm.yml`

- [ ] **Step 1: 将触发方式从 `push tags` 改为 `push branches: [main]`**

- [ ] **Step 2: 使用 `changesets/action@v1` 维护 Release PR**

要求：
- 配置 PR title / commit message
- 设置 `contents: write` 与 `pull-requests: write`
- 保留 `id-token: write` 以支持 Trusted Publishing

- [ ] **Step 3: 配置发布命令与自动 GitHub Release**

目标：
- 合并 Release PR 后自动发 npm
- 自动创建 tag
- 自动创建 GitHub Release

- [ ] **Step 4: 重新运行 workflow 测试**

Run: `npm test -- tests/release-script.test.ts tests/release-workflow.test.ts`
Expected: PASS

### Task 4: 更新 README 并跑完整回归

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README 的发版说明**

补充：
- Changesets 工作流
- 本地不再手工打 tag
- 如何查看 Release PR / GitHub Release / Actions 日志
- 什么时候必须写 changeset

- [ ] **Step 2: 跑与发布流程相关的增量测试**

Run: `npm test -- tests/release-script.test.ts tests/release-workflow.test.ts tests/package-meta.test.ts`
Expected: PASS

- [ ] **Step 3: 跑完整测试**

Run: `npm test`
Expected: PASS
