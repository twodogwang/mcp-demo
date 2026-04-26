# MCP Builder Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ONES 文档 MCP 服务重构为基于 `McpServer.registerTool` 的分层实现，同时保持现有工具名和默认 `stdio` 使用方式不变。

**Architecture:** 新增 server factory、tool modules、runtime loader 和 transport adapter，入口只负责启动。工具统一返回 `content + structuredContent`，并通过 `outputSchema` 和 `annotations` 明确契约。

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, Zod, Vitest

---

## Planned File Structure

- Create: `src/server/create-mcp-server.ts`
- Create: `src/services/runtime.ts`
- Create: `src/transports/stdio.ts`
- Create: `src/transports/http.ts`
- Create: `src/tools/search-docs.ts`
- Create: `src/tools/get-doc.ts`
- Create: `src/schemas/search-docs.ts`
- Create: `src/schemas/get-doc.ts`
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `tests/mcp-tools.test.ts`
- Create: `tests/runtime.test.ts`

### Task 1: Lock the MCP contract with failing tests

**Files:**
- Modify: `tests/mcp-tools.test.ts`
- Create: `tests/runtime.test.ts`

- [ ] **Step 1: Write failing tests for the new MCP server contract**

Cover:
- in-memory client can list `search_docs` and `get_doc`
- `get_doc` schema still requires `ref` and defaults `view` to `llm`
- tools expose `annotations` and `outputSchema`
- tool calls return `structuredContent`

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- tests/mcp-tools.test.ts tests/runtime.test.ts`
Expected: FAIL because new server/runtime modules do not exist yet

### Task 2: Extract schemas, runtime, and tool modules

**Files:**
- Create: `src/services/runtime.ts`
- Create: `src/schemas/search-docs.ts`
- Create: `src/schemas/get-doc.ts`
- Create: `src/tools/search-docs.ts`
- Create: `src/tools/get-doc.ts`

- [ ] **Step 1: Implement runtime loader with lazy initialization**
- [ ] **Step 2: Move tool input/output schema to dedicated schema files**
- [ ] **Step 3: Implement tool registration helpers with structured output and error mapping**

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/mcp-tools.test.ts tests/runtime.test.ts`
Expected: PASS

### Task 3: Replace manual request handlers with McpServer

**Files:**
- Create: `src/server/create-mcp-server.ts`
- Modify: `src/index.ts`
- Create: `src/transports/stdio.ts`
- Create: `src/transports/http.ts`

- [ ] **Step 1: Add server factory and register both tools with `McpServer.registerTool`**
- [ ] **Step 2: Shrink `src/index.ts` to entrypoint-only startup**
- [ ] **Step 3: Add stdio adapter and HTTP placeholder adapter**

- [ ] **Step 4: Run MCP-focused tests**

Run: `npm test -- tests/mcp-tools.test.ts tests/runtime.test.ts`
Expected: PASS

### Task 4: Verify compatibility and update docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to describe structured output behavior and transport architecture**
- [ ] **Step 2: Run broader regression tests**

Run: `npm test -- tests/mcp-tools.test.ts tests/runtime.test.ts tests/ones-client.test.ts tests/integration/mcp-e2e.test.ts`
Expected: PASS
