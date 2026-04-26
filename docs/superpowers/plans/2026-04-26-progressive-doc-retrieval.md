# Progressive Document Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ONES 文档 MCP 增加渐进式读取能力，让调用方先拿目录，再按章节或分块读取，并可选使用自动策略为 LLM 组织上下文。

**Architecture:** 在现有 `ParsedDocument` AST 之上增加 outline、section 和 chunk 推导层，避免重写 ONES 解析器。`OnesClient` 负责把同一份源文档映射成不同检索视图，MCP 工具层只暴露稳定的 read-only 工具和结构化输出。

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, Zod, Vitest

---

## Planned File Structure

- Create: `src/documents/outline.ts`
- Create: `src/documents/chunks.ts`
- Modify: `src/documents/model.ts`
- Modify: `src/ones-client.ts`
- Create: `src/schemas/get-doc-outline.ts`
- Create: `src/schemas/get-doc-section.ts`
- Create: `src/schemas/get-doc-chunks.ts`
- Create: `src/schemas/get-doc-context.ts`
- Create: `src/tools/get-doc-outline.ts`
- Create: `src/tools/get-doc-section.ts`
- Create: `src/tools/get-doc-chunks.ts`
- Create: `src/tools/get-doc-context.ts`
- Modify: `src/server/create-mcp-server.ts`
- Modify: `README.md`
- Create: `tests/documents/outline.test.ts`
- Create: `tests/documents/chunks.test.ts`
- Create: `tests/ones-client-progressive.test.ts`
- Modify: `tests/mcp-tools.test.ts`

## Implementation Notes

- 保持现有 `get_doc` 不变，作为兼容接口。
- 新能力默认不做本地持久化，副本留给调用方自己管理。
- `get_doc_context` 的 `mode="auto"` 使用确定性规则，不在 server 内再次调用模型。
- `get_doc_chunks` 用 cursor 分页，返回 `has_more` 和 `next_cursor`。
- 不执行 `build`，除非用户明确要求；验证以 `npm test` 为主。

### Task 1: 定义渐进式文档模型和推导工具

**Files:**
- Modify: `src/documents/model.ts`
- Create: `src/documents/outline.ts`
- Create: `src/documents/chunks.ts`
- Test: `tests/documents/outline.test.ts`
- Test: `tests/documents/chunks.test.ts`

- [ ] **Step 1: 写目录推导的失败测试**

覆盖：
- 按 heading 生成 section id/path/level/title
- 无 heading 时生成 synthetic root section
- 统计 section 的 `estimated_chars`、`table_count`、`image_count`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/documents/outline.test.ts tests/documents/chunks.test.ts`
Expected: FAIL，因为 `outline.ts` / `chunks.ts` 还不存在

- [ ] **Step 3: 在 `model.ts` 增加渐进式检索类型**

至少包含：
- `DocumentSectionOutline`
- `DocumentOutline`
- `DocumentSectionDetail`
- `DocumentChunkDetail`
- `DocumentContextStrategy`

- [ ] **Step 4: 实现 `outline.ts` 的最小逻辑**

实现：
- `buildDocumentOutline(parsed, meta)`
- `getSectionSlice(parsed, outline, sectionId)`
- heading 层级路径生成

- [ ] **Step 5: 实现 `chunks.ts` 的最小逻辑**

实现：
- `buildDocumentChunks(outline, maxChars)`
- `getChunkSlice(parsed, chunkSpec)`
- `parseChunkCursor(cursor)`

- [ ] **Step 6: 重新运行测试确认通过**

Run: `npm test -- tests/documents/outline.test.ts tests/documents/chunks.test.ts`
Expected: PASS

### Task 2: 扩展 OnesClient 提供 outline / section / chunks / auto-context

**Files:**
- Modify: `src/ones-client.ts`
- Test: `tests/ones-client-progressive.test.ts`

- [ ] **Step 1: 写 OnesClient 失败测试**

覆盖：
- `getDocOutline()` 返回目录摘要
- `getDocSection()` 返回单节内容和元信息
- `getDocChunks()` 返回分块内容和 cursor
- `getDocContext()` 在 `mode="auto"` 下选择 `targeted_sections` 或 `full_chunks`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/ones-client-progressive.test.ts`
Expected: FAIL，因为新方法还不存在

- [ ] **Step 3: 提取 OnesClient 的共享文档加载层**

在 `src/ones-client.ts` 内新增一个共享加载方法，返回：
- doc metadata
- source format
- raw
- parsed AST
- normalized resources

避免 `getDoc` / `getDocOutline` / `getDocSection` / `getDocChunks` 重复取数和解析。

- [ ] **Step 4: 实现四个公开方法**

实现：
- `getDocOutline(...)`
- `getDocSection(...)`
- `getDocChunks(...)`
- `getDocContext(...)`

`mode="auto"` 先按以下规则实现：
- 文档估算长度 `<= maxChars`：`full_document`
- 问题命中 `整篇|全文|所有|完整|冲突|一致性|全面|全量`：`full_chunks`
- 问题命中 section 标题关键词：`targeted_sections`
- 否则：`outline_only`

- [ ] **Step 5: 重新运行测试确认通过**

Run: `npm test -- tests/ones-client-progressive.test.ts`
Expected: PASS

### Task 3: 暴露新的 MCP 工具和 schema

**Files:**
- Create: `src/schemas/get-doc-outline.ts`
- Create: `src/schemas/get-doc-section.ts`
- Create: `src/schemas/get-doc-chunks.ts`
- Create: `src/schemas/get-doc-context.ts`
- Create: `src/tools/get-doc-outline.ts`
- Create: `src/tools/get-doc-section.ts`
- Create: `src/tools/get-doc-chunks.ts`
- Create: `src/tools/get-doc-context.ts`
- Modify: `src/server/create-mcp-server.ts`
- Modify: `tests/mcp-tools.test.ts`

- [ ] **Step 1: 写 MCP 工具契约失败测试**

覆盖：
- `listTools()` 中包含四个新工具
- `get_doc_chunks` 暴露 cursor/has_more/next_cursor 输出
- `get_doc_context` 暴露 `strategy`、`reason`、`truncated`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/mcp-tools.test.ts`
Expected: FAIL，因为新工具还未注册

- [ ] **Step 3: 实现四组 schema**

要求：
- 输入使用 Zod
- 输出定义顶层结构
- description 明确说明使用场景

- [ ] **Step 4: 实现四个 tool 注册器**

要求：
- 使用 `structuredContent`
- 使用统一 `readOnlyToolAnnotations`
- 工具内复用 `parseRef` 和 `Runtime`
- 错误走 `createToolErrorResult`

- [ ] **Step 5: 在 server factory 注册新工具**

更新 `src/server/create-mcp-server.ts`，保持旧工具名和旧接口继续可用。

- [ ] **Step 6: 重新运行测试确认通过**

Run: `npm test -- tests/mcp-tools.test.ts`
Expected: PASS

### Task 4: 更新文档并跑回归

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README 的工具说明和推荐工作流**

补充：
- `get_doc_outline`
- `get_doc_section`
- `get_doc_chunks`
- `get_doc_context`
- 推荐的“outline -> section/chunks -> local persistence” 使用方式

- [ ] **Step 2: 运行增量回归**

Run: `npm test -- tests/documents/outline.test.ts tests/documents/chunks.test.ts tests/ones-client-progressive.test.ts tests/mcp-tools.test.ts tests/integration/mcp-e2e.test.ts`
Expected: PASS

- [ ] **Step 3: 运行完整测试**

Run: `npm test`
Expected: PASS
