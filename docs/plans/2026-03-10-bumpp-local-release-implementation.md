# MCP Package Git Init and Bumpp Release Prep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 初始化当前目录为 git 仓库，并将项目改造成可安装发布的 MCP npm 包，完成本地 `bumpp` 版本发布流程准备（不 push）。

**Architecture:** 通过 `package.json` 的 CLI 发布元数据（`bin/files/prepack/publishConfig`）把项目转换为可安装包；通过 `.gitignore` 和首个提交建立版本基础；通过 `bumpp` 提供本地版本号、commit、tag 自动化。最终以 `npm pack --dry-run` 和 `npm pack` 验证可发布工件。

**Tech Stack:** Git, Node.js/npm, TypeScript, bumpp, vitest

---

执行规范：实现时遵循 `@superpowers/test-driven-development` 与 `@superpowers/verification-before-completion`。

### Task 1: 初始化 git 仓库与忽略规则

**Files:**
- Create: `.gitignore`
- Create: `.git/`（命令生成）

**Step 1: Write the failing test**

新增一个脚本化校验（手工命令等价）：

```bash
test -d .git && test -f .gitignore
```

**Step 2: Run test to verify it fails**

Run: `test -d .git && echo ok || echo missing_git`  
Expected: 输出 `missing_git`

**Step 3: Write minimal implementation**

```bash
git init
cat > .gitignore <<'EOF'
node_modules/
dist/
.env
*.tgz
.DS_Store
EOF
```

**Step 4: Run test to verify it passes**

Run: `test -d .git && test -f .gitignore && echo ok`  
Expected: 输出 `ok`

**Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: initialize git repository with base ignore rules"
```

### Task 2: 改造 package 元数据为可安装 MCP 包

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`
- Modify: `README.md`

**Step 1: Write the failing test**

```ts
// tests/package-meta.test.ts
import { describe, it, expect } from "vitest";
import pkg from "../package.json";

describe("package metadata", () => {
  it("is installable CLI package", () => {
    expect(pkg.name).toBe("@bakarhythm/get-doc-content");
    expect(pkg.bin).toHaveProperty("get-doc-content");
    expect(pkg.publishConfig?.access).toBe("public");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/package-meta.test.ts -t "is installable CLI package"`  
Expected: FAIL（name/bin/publishConfig 不匹配）

**Step 3: Write minimal implementation**

关键变更：

```json
{
  "name": "@bakarhythm/get-doc-content",
  "version": "0.1.0",
  "main": "dist/src/index.js",
  "bin": {
    "get-doc-content": "dist/src/index.js"
  },
  "files": ["dist", "README.md", ".env.example"],
  "publishConfig": { "access": "public" }
}
```

并在 `src/index.ts` 顶部添加：

```ts
#!/usr/bin/env node
```

README 增加安装示例：
- `npx -y @bakarhythm/get-doc-content`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/package-meta.test.ts -t "is installable CLI package"`  
Expected: PASS

**Step 5: Commit**

```bash
git add package.json src/index.ts README.md tests/package-meta.test.ts
git commit -m "feat: convert project to installable mcp npm package"
```

### Task 3: 接入 bumpp 本地版本发布脚本

**Files:**
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
// tests/release-script.test.ts
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("release scripts", () => {
  it("defines bumpp local release scripts", () => {
    expect(pkg.scripts).toHaveProperty("release:patch");
    expect(pkg.scripts).toHaveProperty("release:minor");
    expect(pkg.scripts).toHaveProperty("release:major");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/release-script.test.ts -t "defines bumpp local release scripts"`  
Expected: FAIL（scripts 不存在）

**Step 3: Write minimal implementation**

在 `package.json` 添加：

```json
{
  "scripts": {
    "clean": "rm -rf dist",
    "build": "npm run clean && tsc -p tsconfig.json",
    "prepack": "npm run build",
    "release:patch": "bumpp --all --commit --tag --no-push --no-verify --release patch",
    "release:minor": "bumpp --all --commit --tag --no-push --no-verify --release minor",
    "release:major": "bumpp --all --commit --tag --no-push --no-verify --release major"
  }
}
```

并安装：

Run: `npm i -D bumpp`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/release-script.test.ts -t "defines bumpp local release scripts"`  
Expected: PASS

**Step 5: Commit**

```bash
git add package.json package-lock.json tests/release-script.test.ts
git commit -m "chore: add bumpp local release scripts"
```

### Task 4: 打包验证与本地发布演练

**Files:**
- Modify: `README.md`（补充 bumpp 使用说明）

**Step 1: Write the failing test**

手工验证命令：

Run: `npm pack --dry-run`  
Expected: 只包含 `dist`, `README.md`, `.env.example`, `package.json`

**Step 2: Run test to verify it fails**

若包含多余文件（如 `tests`、`src`），视为失败。

**Step 3: Write minimal implementation**

按 dry-run 输出修正 `files` 或脚本配置，直到内容符合预期。

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test
npm run build
npm pack --dry-run
npm pack
```

Expected:
- tests 全通过
- build 成功
- dry-run 内容正确
- 生成 `bakarhythm-get-doc-content-<version>.tgz`

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add local bumpp release and packaging instructions"
```

### Task 5: 执行一次本地 bumpp 版本发布

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Write the failing test**

Run: `git tag --list`  
Expected: 无目标版本 tag

**Step 2: Run test to verify it fails**

Run: `npm run release:patch`  
Expected: 若命令失败，记录报错（例如 git identity 未配置）

**Step 3: Write minimal implementation**

处理失败前置条件：
- 若缺 git 用户信息：
  - `git config user.name "bakarhythm"`
  - `git config user.email "bakarhythm@example.com"`

然后重试：
- `npm run release:patch`

**Step 4: Run test to verify it passes**

Run:

```bash
git log --oneline -n 3
git tag --list | tail -n 5
```

Expected:
- 出现 bumpp 版本提交
- 出现新 tag（例如 `v0.1.1`）
- 未执行 push

**Step 5: Commit**

`release:patch` 已自动 commit，无需手动补充 commit。

