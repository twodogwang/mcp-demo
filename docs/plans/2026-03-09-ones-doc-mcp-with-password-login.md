# ONES Doc MCP with Password Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个可在内网运行的 MCP Server，通过 ONES 账号密码自动登录并抓取文档搜索与详情内容（只读）。

**Architecture:** 服务采用 Node.js + TypeScript。通过 `SessionManager` 执行登录并缓存 Cookie，会话过期时在 ONES API 客户端内自动重登并重试一次。MCP 仅暴露 `search_docs` 与 `get_doc` 两个工具，返回经过清洗和截断的安全文本。

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `zod`, `vitest`, `dotenv`

---

执行规范：实现时遵循 `@superpowers/test-driven-development` 与 `@superpowers/verification-before-completion`。

### Task 1: 初始化项目与测试基线

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `src/health.ts`
- Test: `tests/health.test.ts`

**Step 1: Write the failing test**

```ts
// tests/health.test.ts
import { describe, it, expect } from "vitest";
import { getServerMeta } from "../src/health";

describe("getServerMeta", () => {
  it("returns deterministic server metadata", () => {
    expect(getServerMeta()).toEqual({
      name: "ones-doc-mcp",
      version: "0.1.0",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/health.test.ts -t "returns deterministic server metadata"`  
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```ts
// src/health.ts
export function getServerMeta() {
  return { name: "ones-doc-mcp", version: "0.1.0" };
}
```

同时补齐最小脚手架：
- `package.json` scripts: `build`, `dev`, `test`, `start`
- `tsconfig.json` 启用 `moduleResolution: "bundler"` 与 `strict: true`
- `vitest.config.ts` 指定 `environment: "node"`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/health.test.ts -t "returns deterministic server metadata"`  
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example src/health.ts tests/health.test.ts
git commit -m "chore: bootstrap typescript mcp project with vitest baseline"
```

### Task 2: 实现登录与 Cookie 会话管理

**Files:**
- Create: `src/config.ts`
- Create: `src/auth/session-manager.ts`
- Test: `tests/auth/session-manager.test.ts`

**Step 1: Write the failing test**

```ts
// tests/auth/session-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../../src/auth/session-manager";

describe("SessionManager", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("logs in and returns cookie string", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("ok", {
        status: 200,
        headers: { "set-cookie": "sid=abc; Path=/; HttpOnly" },
      });
    }) as any);

    const sm = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: "u",
      password: "p",
      loginPath: "/api/account/login",
    });

    const cookie = await sm.getValidCookie();
    expect(cookie).toBe("sid=abc");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/auth/session-manager.test.ts -t "logs in and returns cookie string"`  
Expected: FAIL with class/module not found

**Step 3: Write minimal implementation**

```ts
// src/auth/session-manager.ts
type SessionConfig = {
  baseUrl: string;
  username: string;
  password: string;
  loginPath: string;
};

export class SessionManager {
  private cookie = "";
  constructor(private readonly cfg: SessionConfig) {}

  async getValidCookie(): Promise<string> {
    if (this.cookie) return this.cookie;
    const res = await fetch(`${this.cfg.baseUrl}${this.cfg.loginPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.cfg.username,
        password: this.cfg.password,
      }),
    });
    if (!res.ok) throw new Error("AUTH_FAILED");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const first = setCookie.split(";")[0].trim();
    if (!first) throw new Error("AUTH_COOKIE_MISSING");
    this.cookie = first;
    return this.cookie;
  }

  invalidate() {
    this.cookie = "";
  }
}
```

`src/config.ts` 负责加载并校验：
- `ONES_BASE_URL`
- `ONES_USERNAME`
- `ONES_PASSWORD`
- `ONES_LOGIN_PATH`
- `ONES_SEARCH_PATH`
- `ONES_DOC_PATH_TEMPLATE`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/auth/session-manager.test.ts -t "logs in and returns cookie string"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/auth/session-manager.ts tests/auth/session-manager.test.ts
git commit -m "feat: add password login and cookie session manager"
```

### Task 3: 封装 ONES 客户端与自动重登重试

**Files:**
- Create: `src/ones-client.ts`
- Test: `tests/ones-client.test.ts`

**Step 1: Write the failing test**

```ts
// tests/ones-client.test.ts
import { describe, it, expect, vi } from "vitest";
import { OnesClient } from "../src/ones-client";

it("re-login once on 401 then succeeds", async () => {
  const getValidCookie = vi.fn()
    .mockResolvedValueOnce("sid=old")
    .mockResolvedValueOnce("sid=new");
  const invalidate = vi.fn();

  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock as any);

  const client = new OnesClient(
    { baseUrl: "https://ones.example.internal", searchPath: "/api/wiki/search", docPathTemplate: "/api/wiki/docs/{docId}" },
    { getValidCookie, invalidate } as any
  );

  const result = await client.searchDocs("k", 5);
  expect(result).toEqual([]);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(getValidCookie).toHaveBeenCalledTimes(2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ones-client.test.ts -t "re-login once on 401 then succeeds"`  
Expected: FAIL with class/module not found

**Step 3: Write minimal implementation**

```ts
// src/ones-client.ts (核心逻辑示意)
if (res.status === 401 && retryable) {
  this.sessions.invalidate();
  return this.request(path, init, false);
}
```

完整实现要求：
- `request(path, init, retryable=true)` 统一注入 `Cookie`
- 命中 401 时仅重试一次
- 提供 `searchDocs(query, limit)` 与 `getDoc(docId)` 两个方法
- 非 2xx 抛 `UPSTREAM_ERROR`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ones-client.test.ts -t "re-login once on 401 then succeeds"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/ones-client.ts tests/ones-client.test.ts
git commit -m "feat: add ones client with single retry after re-login"
```

### Task 4: 文档内容清洗与截断

**Files:**
- Create: `src/normalizer.ts`
- Test: `tests/normalizer.test.ts`

**Step 1: Write the failing test**

```ts
// tests/normalizer.test.ts
import { describe, it, expect } from "vitest";
import { normalizeContent } from "../src/normalizer";

describe("normalizeContent", () => {
  it("strips html and truncates by max chars", () => {
    const input = "<h1>Title</h1><p>Hello <b>World</b></p>";
    const out = normalizeContent(input, 12);
    expect(out).toBe("Title Hello");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/normalizer.test.ts -t "strips html and truncates by max chars"`  
Expected: FAIL with function not found

**Step 3: Write minimal implementation**

```ts
// src/normalizer.ts
export function normalizeContent(raw: string, maxChars = 20000): string {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, maxChars);
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/normalizer.test.ts -t "strips html and truncates by max chars"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/normalizer.ts tests/normalizer.test.ts
git commit -m "feat: add content normalizer for html stripping and truncation"
```

### Task 5: 暴露 MCP 工具 search_docs / get_doc

**Files:**
- Create: `src/index.ts`
- Modify: `src/ones-client.ts`
- Test: `tests/mcp-tools.test.ts`

**Step 1: Write the failing test**

```ts
// tests/mcp-tools.test.ts
import { describe, it, expect } from "vitest";
import { buildToolList } from "../src/index";

describe("mcp tool list", () => {
  it("exposes search_docs and get_doc", () => {
    const tools = buildToolList();
    expect(tools.map(t => t.name)).toEqual(["search_docs", "get_doc"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/mcp-tools.test.ts -t "exposes search_docs and get_doc"`  
Expected: FAIL with function not found

**Step 3: Write minimal implementation**

```ts
// src/index.ts (片段)
export function buildToolList() {
  return [
    { name: "search_docs", description: "Search ONES docs", inputSchema: {/* ... */} },
    { name: "get_doc", description: "Get ONES doc detail", inputSchema: {/* ... */} },
  ];
}
```

完整实现要求：
- 使用 `@modelcontextprotocol/sdk` 的 stdio transport
- 参数校验使用 `zod`
- `search_docs` 返回数组（id/title/updated_at）
- `get_doc` 返回单文档（id/title/content/updated_at）

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/mcp-tools.test.ts -t "exposes search_docs and get_doc"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/ones-client.ts tests/mcp-tools.test.ts
git commit -m "feat: expose ones doc tools via mcp server"
```

### Task 6: 错误映射、日志脱敏与稳定性

**Files:**
- Create: `src/errors.ts`
- Create: `src/logger.ts`
- Modify: `src/auth/session-manager.ts`
- Modify: `src/ones-client.ts`
- Test: `tests/security-logging.test.ts`

**Step 1: Write the failing test**

```ts
// tests/security-logging.test.ts
import { it, expect } from "vitest";
import { redactSecrets } from "../src/logger";

it("redacts cookie and password fields", () => {
  const line = redactSecrets("cookie=sid=abc; password=123456");
  expect(line).toContain("cookie=[REDACTED]");
  expect(line).toContain("password=[REDACTED]");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/security-logging.test.ts -t "redacts cookie and password fields"`  
Expected: FAIL with function not found

**Step 3: Write minimal implementation**

```ts
// src/logger.ts
export function redactSecrets(input: string): string {
  return input
    .replace(/cookie=[^;\s]+/gi, "cookie=[REDACTED]")
    .replace(/password=[^;\s]+/gi, "password=[REDACTED]");
}
```

同时完善：
- `AUTH_FAILED` / `NOT_FOUND` / `UPSTREAM_ERROR` 统一错误对象
- 日志仅记录 `requestId`, `path`, `status`, `durationMs`

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/security-logging.test.ts -t "redacts cookie and password fields"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/errors.ts src/logger.ts src/auth/session-manager.ts src/ones-client.ts tests/security-logging.test.ts
git commit -m "feat: add sanitized logging and domain errors"
```

### Task 7: 端到端联调脚本与交付文档

**Files:**
- Create: `scripts/smoke.mjs`
- Create: `README.md`
- Modify: `.env.example`

**Step 1: Write the failing test**

```ts
// tests/smoke-script.test.ts
import { describe, it, expect } from "vitest";
import { buildSmokeCommand } from "../scripts/smoke";

describe("smoke command", () => {
  it("builds search_docs invocation command", () => {
    expect(buildSmokeCommand("ONES")).toContain("search_docs");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke-script.test.ts -t "builds search_docs invocation command"`  
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```js
// scripts/smoke.mjs (示意)
export function buildSmokeCommand(query) {
  return JSON.stringify({ tool: "search_docs", arguments: { query, limit: 3 } });
}
```

README 必须覆盖：
- 环境变量说明
- 本地启动：`npm run dev`
- 构建运行：`npm run build && npm run start`
- 常见错误排查（登录失败、接口路径不匹配、Cookie 过期）

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke-script.test.ts -t "builds search_docs invocation command"`  
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/smoke.mjs README.md .env.example tests/smoke-script.test.ts
git commit -m "docs: add smoke script and runbook for ones mcp"
```

### Task 8: 最终验证与发布前检查

**Files:**
- Modify: `README.md`（补充最终验证记录）

**Step 1: Write the failing test**

为最终验证增加一个集成测试（如不存在）：

```ts
// tests/integration/mcp-e2e.test.ts
it("search_docs then get_doc works with mocked ones upstream", async () => {
  // mock 登录、搜索、详情全链路
  expect(true).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/mcp-e2e.test.ts`  
Expected: FAIL before implementation of full mock chain

**Step 3: Write minimal implementation**

补齐 mock 链路与断言：
- 首次请求触发登录
- search 返回 docId
- get_doc 返回清洗后的内容

**Step 4: Run test to verify it passes**

Run: `npm run test`  
Expected: ALL PASS

再执行：
Run: `npm run build`  
Expected: Build success, no TypeScript errors

**Step 5: Commit**

```bash
git add tests/integration/mcp-e2e.test.ts README.md
git commit -m "test: add e2e verification for ones mcp login-search-get flow"
```

