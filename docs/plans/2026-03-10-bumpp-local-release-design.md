# 使用 bumpp 的本地发布准备设计文档

**日期：** 2026-03-10  
**目标：** 将当前项目初始化为 git 仓库，并改造为可安装的 MCP npm 包，采用 `bumpp` 在本地完成版本管理（不 push），后续交由 GitHub Action 发布。

## 1. 设计范围

1. 初始化 git 仓库并补齐 `.gitignore`。
2. 将包名改为 `@bakarhythm/get-doc-content`。
3. 改造 `package.json` 使其可作为 CLI MCP 包被安装执行。
4. 接入 `bumpp` 作为本地版本与 tag 管理工具。
5. 执行本地打包验证（`npm pack --dry-run` / `npm pack`）。

## 2. 发布模型

### 本地阶段（本次实现）

1. 质量门禁：
  - `npm run test`
  - `npm run build`
2. 打包校验：
  - `npm pack --dry-run`
  - `npm pack`
3. 版本操作：
  - `bumpp --all --commit --tag --no-push --no-verify --release patch|minor|major`

### CI 阶段（后续 GitHub Action）

1. 基于 tag 触发。
2. 执行 `npm ci`、`npm run test`、`npm run build`。
3. 执行 `npm publish --access public`。

## 3. 包结构与安装方式

### 必要元数据

- `name`: `@bakarhythm/get-doc-content`
- `bin`: `get-doc-content -> dist/src/index.js`
- `main`: `dist/src/index.js`
- `files`: 仅发布 `dist`、`README.md`、`.env.example`
- `publishConfig.access`: `public`

### 用户安装运行

1. 直接运行：
  - `npx -y @bakarhythm/get-doc-content`
2. MCP 客户端配置：
  - `command: "npx"`
  - `args: ["-y", "@bakarhythm/get-doc-content"]`

## 4. bumpp 策略

新增脚本：

- `release:patch`
- `release:minor`
- `release:major`

都采用：

- `--all`：同步更新 lockfile 等版本信息
- `--commit`：自动提交版本变更
- `--tag`：自动打 tag
- `--no-push`：不推送远程
- `--no-verify`：不走 git hooks（本地可控）

## 5. 风险与控制

1. **npm scope 权限不足**  
   - 现象：发布时报 403。  
   - 控制：本次先做本地打包与版本流程，不强制在线发布成功。

2. **首个 git commit 失败（未配置 user.name/user.email）**  
   - 控制：若失败，提示用户设置后重试，或本地临时配置。

3. **包内容污染（带入测试和中间产物）**  
   - 控制：`files` 白名单 + `npm pack --dry-run` 检查。

## 6. 验收标准

1. 目录已存在 `.git`，且有初始提交。
2. `npm run test` / `npm run build` 全部通过。
3. `npm pack --dry-run` 输出中只包含预期发布文件。
4. `npm pack` 生成可分发 tarball。
5. 能执行 `npm run release:patch` 完成本地版本提交与 tag（不 push）。

