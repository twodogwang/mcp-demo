# Changesets 工作流

这个仓库使用 Changesets 管理版本和发版说明。

## 什么时候需要写 changeset

以下情况需要补一个 changeset：

- MCP 工具新增、删除、重命名
- 工具输入输出结构发生调用方可感知的变化
- 安装方式、运行入口、环境变量、默认 transport 行为有变化
- 会影响调用方升级判断的 bugfix 或行为修正

以下情况通常不需要写 changeset：

- 仅测试、文档、注释调整
- 纯内部重构，调用方行为不变
- 只改 CI、仓库治理或本地开发体验

## 工作流

1. 开发完成后运行 `npm run changeset`
2. 提交生成的 `.changeset/*.md`
3. 合并到 `main` 后，GitHub Actions 会自动维护 Release PR
4. 合并 Release PR 后，Actions 会自动发布 npm、创建 tag 和 GitHub Release
