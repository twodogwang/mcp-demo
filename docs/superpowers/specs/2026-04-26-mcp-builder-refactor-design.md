# MCP Builder Refactor Design

**Date:** 2026-04-26

## Goal

将当前 ONES 文档 MCP 服务重构为更符合 `mcp-builder` 最佳实践的实现：使用现代 `McpServer.registerTool` 注册工具，拆分入口职责，统一结构化输出与错误处理，并为未来接入 `Streamable HTTP` 预留清晰边界。

## Constraints

- 默认传输仍为 `stdio`
- 保持现有对外工具名不变：`search_docs`、`get_doc`
- 不主动扩展业务能力，重点重构协议层与结构层
- 文本 `content` 继续保留 JSON 字符串形式，保证旧客户端兼容

## Current Problems

- `src/index.ts` 同时承担入口、运行时初始化、工具定义、协议分发四种职责
- 工具通过 `setRequestHandler` 手动分发，不符合当前 SDK 推荐用法
- 工具缺少 `structuredContent`、`outputSchema`、`annotations`
- 未来如果要接 `Streamable HTTP`，现有实现会把 transport 和 tool 层耦合在一起

## Target Structure

- `src/index.ts`
  默认启动入口，只负责进程级异常处理和 `stdio` 启动
- `src/server/create-mcp-server.ts`
  创建 `McpServer` 实例并注册工具
- `src/tools/search-docs.ts`
  `search_docs` 的 schema、输出和 handler
- `src/tools/get-doc.ts`
  `get_doc` 的 schema、输出和 handler
- `src/schemas/`
  工具输入/输出 schema
- `src/services/runtime.ts`
  懒加载并缓存 `config`、`EndpointDiscovery`、`SessionManager`、`OnesClient`
- `src/transports/stdio.ts`
  `stdio` transport 启动逻辑
- `src/transports/http.ts`
  `Streamable HTTP` 预留边界，本次不作为默认入口启用

## Tool Contract

### search_docs

- 输入保持 `query`、`limit`
- 返回：
  - `content`: JSON 字符串
  - `structuredContent`: `{ items, count, limit }`
- annotations:
  - `readOnlyHint: true`
  - `destructiveHint: false`
  - `idempotentHint: true`
  - `openWorldHint: true`

### get_doc

- 输入保持 `ref`、`view`、`include_raw`、`include_resources`
- 返回：
  - `content`: JSON 字符串
  - `structuredContent`: 当前 `DocDetail` 顶层结构
- annotations 同上

## Error Handling

- 服务端日志继续记录详细错误
- 工具层不直接裸抛内部异常，而是返回 `isError: true`
- 输出面向调用方的可操作错误文案：
  - 配置缺失
  - 认证失败
  - 引用格式错误
  - 未找到关联文档
  - 上游请求失败

## Transport Strategy

- 本次保留 `stdio` 为正式运行路径
- 通过 `server factory + transport adapter` 解耦，为未来的 `Streamable HTTP` 接入保留结构位置
- 不提前引入部署和安全面的 HTTP 运行时复杂度

## Testing Strategy

- 用 SDK 的 `InMemoryTransport` + `Client` 做工具契约测试
- 覆盖工具列表、输入默认值、结构化输出、错误输出
- 保持现有业务层测试为主，尽量避免无关回归

## Risks

- SDK 切换到 `McpServer` 后，测试方式需要从“直接读入口 helper”转为“真实 MCP 调用”
- `outputSchema` 需要与 `structuredContent` 一致，否则会在运行时校验失败
- 入口拆分后需要确保未配置 ONES 环境变量时仍可安全创建 server
