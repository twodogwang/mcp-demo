# GitHub Actions Auto Publish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 保持 GitHub tag 自动发布 npm 的模式，并补齐 `1.0.0` 阶段的发布文档说明。

**Architecture:** 继续使用现有 `publish-npm.yml` 作为唯一自动发布入口，tag 触发后执行安装、测试、构建、版本校验和 npm 发布。实现侧只做最小改动，重点放在校正文档和验证发布链路描述与工作流一致。

**Tech Stack:** GitHub Actions, npm Trusted Publishing, Node.js, bumpp, Markdown

---

### Task 1: 核对工作流是否满足自动发布要求

**Files:**
- Modify: `.github/workflows/publish-npm.yml`
- Test: `npm run test`

**Step 1: 检查现有触发器和权限**

确认以下配置存在且符合预期：

```yaml
on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: read
  id-token: write
```

**Step 2: 如无必要，不做结构性改动**

保持：

```yaml
- run: npm ci
- run: npm test
- run: npm run build
- run: npm publish --access public --provenance
```

**Step 3: 运行测试确认未受影响**

Run: `npm run test`
Expected: `23 passed`

### Task 2: 更新 README 的自动发布说明

**Files:**
- Modify: `README.md`
- Test: `npm run build`

**Step 1: 更新发布章节的版本示例**

将旧的 `0.1.x` 示例改为面向 `1.0.0` 之后的语义化版本示例。

**Step 2: 明确自动发布流程**

补充清晰流程：

```bash
npx bumpp 1.0.0 --all
git push origin main
git push origin v1.0.0
```

并说明后续常规发布可使用：

```bash
npm run release:patch
npm run release:minor
npm run release:major
git push origin main --follow-tags
```

**Step 3: 运行构建确认文档改动未引入其他问题**

Run: `npm run build`
Expected: exit code `0`

### Task 3: 做最终验证

**Files:**
- Verify: `.github/workflows/publish-npm.yml`
- Verify: `README.md`

**Step 1: 跑完整测试**

Run: `npm run test`
Expected: all tests pass

**Step 2: 跑完整构建**

Run: `npm run build`
Expected: exit code `0`

**Step 3: 人工复核发布链路**

确认以下结论成立：

- push `v*.*.*` tag 会触发工作流
- 工作流会校验 `tag` 与 `package.json.version`
- 发布使用 npm Trusted Publishing，不依赖 `NPM_TOKEN`

**Step 4: Commit**

```bash
git add README.md .github/workflows/publish-npm.yml docs/plans/2026-03-11-github-actions-auto-publish-design.md docs/plans/2026-03-11-github-actions-auto-publish.md
git commit -m "chore: document github actions npm release flow"
```
