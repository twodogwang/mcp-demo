# GitHub Actions 自动发布设计

**目标**

基于现有 npm Trusted Publishing 配置，使用 GitHub Actions 在推送语义化版本 tag 时自动发布 `@bakarhythm/get-doc-content` 到 npm。

**现状**

- 仓库已存在工作流 [`.github/workflows/publish-npm.yml`](/Users/shakugannoshana/Documents/ex/mcp-demo/.github/workflows/publish-npm.yml)。
- 当前工作流已经基于 `push.tags = v*.*.*` 触发。
- 工作流已启用 `id-token: write`，并使用 `npm publish --provenance`，满足 npm Trusted Publishing 模式。
- README 已有发布说明，但版本示例仍停留在 `0.1.x` 阶段，未明确 `1.0.0` 之后的推荐发布路径。

**方案对比**

1. 保持 `tag push` 自动发布
   - 优点：与 `bumpp` 最契合，路径最短，改动最小。
   - 缺点：要求本地版本号、提交和 tag 管理规范。

2. 改为 GitHub Release 触发发布
   - 优点：发布动作更显式。
   - 缺点：多一步手工操作，不符合当前想要的“自动发布”。

3. 同时支持 `tag push` 和 `workflow_dispatch`
   - 优点：出现异常时可手动补发。
   - 缺点：会增加流程分支，当前没有强需求。

**采用方案**

采用方案 1，继续使用 `tag push` 自动发布。

**设计要点**

- 不改变现有 GitHub Actions 触发模型。
- 保留版本一致性校验：`tag` 去掉前缀 `v` 后必须与 `package.json.version` 一致。
- 文档中明确推荐发版命令以 `bumpp` 为入口。
- 文档中更新示例到 `1.0.0` 语义化版本阶段，避免继续沿用 `0.1.x` 示例造成误导。

**验收标准**

- README 能清楚说明自动发布前置条件和操作步骤。
- 工作流定义与 README 描述一致。
- 本地验证工作流 YAML 无语法问题，测试与构建通过。
