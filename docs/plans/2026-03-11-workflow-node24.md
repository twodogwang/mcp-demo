# Workflow Node 24 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 npm 发布工作流使用的 Node.js 版本从 `22.14.0` 升级到 `24`，并将变更推送到 GitHub。

**Architecture:** 只修改 GitHub Actions 工作流中的 `actions/setup-node` 版本字段，不改动构建、测试或发布逻辑。完成后运行现有测试与构建命令验证仓库未受影响，再提交并推送。

**Tech Stack:** GitHub Actions, Node.js, npm, Vitest

---

### Task 1: 更新工作流 Node 版本

**Files:**
- Modify: `.github/workflows/publish-npm.yml`

**Step 1: 修改 Node 版本**

将：

```yaml
node-version: "22.14.0"
```

改为：

```yaml
node-version: "24"
```

**Step 2: 仅保留必要改动**

不要修改 workflow 的其他步骤、权限和触发器。

### Task 2: 验证仓库状态

**Files:**
- Verify: `.github/workflows/publish-npm.yml`

**Step 1: 运行测试**

Run: `npm run test`
Expected: all tests pass

**Step 2: 运行构建**

Run: `npm run build`
Expected: exit code `0`

### Task 3: 提交并推送

**Files:**
- Commit: `.github/workflows/publish-npm.yml`
- Commit: `docs/plans/2026-03-11-workflow-node24.md`

**Step 1: 提交**

```bash
git add .github/workflows/publish-npm.yml docs/plans/2026-03-11-workflow-node24.md
git commit -m "chore: upgrade publish workflow to node 24"
```

**Step 2: 推送**

```bash
git push origin main
```
