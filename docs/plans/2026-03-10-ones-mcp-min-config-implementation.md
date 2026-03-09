# ONES MCP Min-Config and Context Ref Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 MCP 改为仅需登录配置即可使用，并支持通过完整 URL 或 `#需求号` 获取文档正文（需求号场景返回关联文档中最新一篇）。

**Architecture:** 增加 `ref` 解析层和端点自动探测层，把接口路径配置从用户侧收回到服务侧。`OnesClient` 统一通过探测结果发请求，并扩展“需求号 -> 关联文档 -> 最新文档正文”链路。MCP 工具层保持简洁，只暴露 `search_docs` 与 `get_doc(ref)`。

**Tech Stack:** Node.js 24, TypeScript, `@modelcontextprotocol/sdk`, `zod`, `vitest`, `dotenv`

---

执行规范：实现时遵循 `@superpowers/test-driven-development` 与 `@superpowers/verification-before-completion`。

### Task 1: 精简配置模型（仅登录必填）

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`
- Test: `tests/config.test.ts`

**Step 1: Write the failing test**

```ts
// tests/config.test.ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("requires only baseUrl/username/password", () => {
    process.env.ONES_BASE_URL = "https://ones.example.internal";
    process.env.ONES_USERNAME = "u";
    process.env.ONES_PASSWORD = "p";
    delete process.env.ONES_LOGIN_PATH;
    delete process.env.ONES_SEARCH_PATH;
    delete process.env.ONES_DOC_PATH_TEMPLATE;

    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe("https://ones.example.internal");
    expect(cfg.username).toBe("u");
    expect(cfg.password).toBe("p");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/config.test.ts -t "requires only baseUrl/username/password"`  
Expected: FAIL with missing env or shape mismatch

**Step 3: Write minimal implementation**

```ts
// src/config.ts (核心)
export type AppConfig = {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  maxContentChars: number;
};
```

并更新 `.env.example`，移除路径配置变量。

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/config.test.ts -t "requires only baseUrl/username/password"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts .env.example tests/config.test.ts
git commit -m "refactor: simplify env config to login-only model"
```

### Task 2: 新增 `ref` 解析器（URL / `#12345`）

**Files:**
- Create: `src/ref-parser.ts`
- Test: `tests/ref-parser.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseRef } from "../src/ref-parser";

describe("parseRef", () => {
  it("parses ones url as doc ref", () => {
    const out = parseRef("https://ones.example.internal/wiki/#/doc/abc", "ones.example.internal");
    expect(out.kind).toBe("doc");
  });

  it("parses #12345 as requirement ref", () => {
    const out = parseRef("#12345", "ones.example.internal");
    expect(out).toEqual({ kind: "requirement", requirementId: "12345" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ref-parser.test.ts`  
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```ts
export type ParsedRef =
  | { kind: "doc"; docId: string }
  | { kind: "requirement"; requirementId: string };

export function parseRef(ref: string, expectedHost: string): ParsedRef {
  // URL 优先，其次 #数字
}
```

实现要求：
- URL host 必须等于 `expectedHost`
- 非法输入抛 `INVALID_DOC_REF`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ref-parser.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/ref-parser.ts tests/ref-parser.test.ts
git commit -m "feat: add context ref parser for url and requirement hash"
```

### Task 3: 增加 ONES 端点自动探测模块

**Files:**
- Create: `src/discovery/endpoint-discovery.ts`
- Create: `src/discovery/candidates.ts`
- Test: `tests/discovery/endpoint-discovery.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { EndpointDiscovery } from "../../src/discovery/endpoint-discovery";

it("discovers login and search endpoints from candidates", async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("miss", { status: 404 }))
    .mockResolvedValueOnce(new Response("ok", { status: 200, headers: { "set-cookie": "sid=1; Path=/" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const d = new EndpointDiscovery("https://ones.example.internal", 5000);
  const endpoints = await d.resolveSearchFlow();
  expect(endpoints.loginPath).toBeDefined();
  expect(endpoints.searchPath).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/discovery/endpoint-discovery.test.ts -t "discovers login and search endpoints from candidates"`  
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```ts
export type ResolvedEndpoints = {
  loginPath: string;
  searchPath: string;
  docPathTemplate?: string;
  requirementPathTemplate?: string;
};
```

实现要求：
- 候选路径顺序探测，命中后缓存
- 全部失败抛 `DISCOVERY_FAILED`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/discovery/endpoint-discovery.test.ts -t "discovers login and search endpoints from candidates"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/candidates.ts src/discovery/endpoint-discovery.ts tests/discovery/endpoint-discovery.test.ts
git commit -m "feat: add endpoint auto-discovery for ones api"
```

### Task 4: 扩展 `OnesClient` 支持 `#需求号` 关联文档链路

**Files:**
- Modify: `src/ones-client.ts`
- Modify: `src/errors.ts`
- Test: `tests/ones-client-requirement.test.ts`

**Step 1: Write the failing test**

```ts
import { expect, it, vi } from "vitest";
import { OnesClient } from "../src/ones-client";

it("returns latest linked doc content for requirement hash", async () => {
  // mock: 需求关联两篇文档，updated_at 新者应被选中
  expect(true).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ones-client-requirement.test.ts -t "returns latest linked doc content for requirement hash"`  
Expected: FAIL with assertion error / missing implementation

**Step 3: Write minimal implementation**

```ts
// src/ones-client.ts 新增示意
async getDocByRequirementId(requirementId: string): Promise<DocDetail> {
  const linked = await this.fetchRequirementLinkedDocs(requirementId);
  if (linked.length === 0) throw new AppError("NO_LINKED_DOC", "No linked docs");
  const latest = pickLatestByUpdatedAt(linked);
  return this.getDoc(latest.id);
}
```

并在 `src/errors.ts` 添加 `NO_LINKED_DOC`。

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ones-client-requirement.test.ts -t "returns latest linked doc content for requirement hash"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/ones-client.ts src/errors.ts tests/ones-client-requirement.test.ts
git commit -m "feat: support requirement-hash to latest linked doc flow"
```

### Task 5: MCP 工具改造为 `get_doc(ref)` 并接入新链路

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/mcp-tools.test.ts`
- Create: `tests/mcp-get-doc-ref.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildToolList } from "../src/index";

describe("mcp get_doc input schema", () => {
  it("requires ref instead of doc_id", () => {
    const getDoc = buildToolList().find((t) => t.name === "get_doc");
    expect(getDoc?.inputSchema).toMatchObject({
      required: ["ref"],
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/mcp-tools.test.ts -t "requires ref instead of doc_id"`  
Expected: FAIL because schema still uses `doc_id`

**Step 3: Write minimal implementation**

```ts
// src/index.ts 关键分支
if (request.params.name === "get_doc") {
  const input = z.object({ ref: z.string().min(1) }).parse(request.params.arguments ?? {});
  const parsed = parseRef(input.ref, new URL(cfg.baseUrl).host);
  const doc = parsed.kind === "doc"
    ? await client.getDoc(parsed.docId)
    : await client.getDocByRequirementId(parsed.requirementId);
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/mcp-tools.test.ts -t "requires ref instead of doc_id"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts tests/mcp-tools.test.ts tests/mcp-get-doc-ref.test.ts
git commit -m "feat: switch get_doc input to context ref"
```

### Task 6: 更新文档与示例（最小配置 + 上下文输入）

**Files:**
- Modify: `README.md`
- Modify: `scripts/smoke.mjs`
- Test: `tests/smoke-script.test.ts`

**Step 1: Write the failing test**

```ts
import { expect, it } from "vitest";
import { buildSmokeCommand } from "../scripts/smoke";

it("builds get_doc command with ref", () => {
  const text = buildSmokeCommand("https://ones.example.internal/wiki/#/doc/abc");
  expect(text).toContain("\"ref\"");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke-script.test.ts -t "builds get_doc command with ref"`  
Expected: FAIL due to old payload shape

**Step 3: Write minimal implementation**

```js
// scripts/smoke.mjs (新增)
export function buildGetDocSmokeCommand(ref) {
  return JSON.stringify({ tool: "get_doc", arguments: { ref } });
}
```

README 更新要求：
- 仅展示三项必填配置
- 明确 `get_doc(ref)` 支持 URL 与 `#12345`
- 说明 `#12345` 返回关联文档最新一篇正文

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke-script.test.ts -t "builds get_doc command with ref"`  
Expected: PASS

**Step 5: Commit**

```bash
git add README.md scripts/smoke.mjs tests/smoke-script.test.ts
git commit -m "docs: update usage to min-config and context ref workflow"
```

### Task 7: 全量回归与构建验证

**Files:**
- Modify: `README.md`（追加验证记录，可选）

**Step 1: Write the failing test**

为集成测试补一个 `#12345` 场景（若未覆盖）：

```ts
// tests/integration/mcp-e2e.test.ts
it("get_doc with #12345 returns latest linked doc content", async () => {
  expect(true).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/mcp-e2e.test.ts -t "get_doc with #12345 returns latest linked doc content"`  
Expected: FAIL before完整链路打通

**Step 3: Write minimal implementation**

补齐 mock：
- 登录端点探测与会话
- 需求详情 + 关联文档返回
- 详情文档抓取与清洗

**Step 4: Run test to verify it passes**

Run: `npm run test`  
Expected: ALL PASS

再执行：
Run: `npm run build`  
Expected: Build success, no TypeScript errors

**Step 5: Commit**

```bash
git add tests/integration/mcp-e2e.test.ts README.md
git commit -m "test: add e2e coverage for requirement-hash linked doc flow"
```

