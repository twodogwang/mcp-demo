# Structured ONES Document Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `get_doc` return a default LLM-oriented structured document view that preserves tables, nested tables, images, and OCR results, while allowing optional human-readable Markdown output.

**Architecture:** Keep ONES raw payload as the source of truth, normalize it into a document AST, then derive `llm_view` and optional `human_view` from that AST. HTML and rich-text JSON get separate parsers, OCR enriches image resources as best-effort metadata, and `get_doc` selects which views to return through an explicit `view` parameter.

**Tech Stack:** TypeScript, Node.js 20+, MCP SDK, Vitest, native `fetch`, optional OCR HTTP provider configured by env vars.

---

## Context

Current behavior:

- `src/index.ts` exposes `search_docs` and `get_doc`.
- `src/ones-client.ts` fetches ONES payloads and collapses document content into plain text.
- `src/normalizer.ts` strips HTML / rich-text structure, which loses table nesting, images, and layout semantics.
- Existing tests already cover tool registration, ONES client happy paths, and mocked MCP integration.

Target behavior:

- `get_doc` accepts `view: "llm" | "human" | "both"` and defaults to `"llm"`.
- `llm_view` is a structured AST-like payload close to the source structure.
- `human_view` is generated only when requested.
- Image OCR is best-effort and never fails the whole document fetch.

## Planned File Structure

**Create**

- `src/documents/model.ts`
  Defines document AST node types, resource types, OCR payloads, `GetDocView`, and assembled response shapes.
- `src/documents/source.ts`
  Extracts ONES raw content/body, detects source format (`html`, `richtext-json`, `plain`), and returns a source descriptor.
- `src/documents/parse-html.ts`
  Parses HTML into AST nodes while preserving headings, paragraphs, lists, links, tables, nested tables, and images.
- `src/documents/parse-rich-text.ts`
  Parses ONES rich-text JSON into the same AST, preserving table/image blocks where available.
- `src/documents/render-markdown.ts`
  Renders AST to Markdown for optional `human_view`, with graceful degradation for unsupported complex tables.
- `src/ocr/ocr-client.ts`
  Defines OCR provider config, request/response types, and a best-effort OCR runner for image resources.
- `tests/documents/source.test.ts`
  Covers format detection and raw payload extraction.
- `tests/documents/parse-html.test.ts`
  Covers HTML parsing, nested tables, and image extraction.
- `tests/documents/parse-rich-text.test.ts`
  Covers rich-text block parsing into AST.
- `tests/documents/render-markdown.test.ts`
  Covers Markdown rendering from AST.
- `tests/ocr/ocr-client.test.ts`
  Covers OCR success, timeout/failure handling, and skip behavior when OCR config is missing.

**Modify**

- `src/config.ts`
  Add OCR-related env handling and keep defaults explicit.
- `src/index.ts`
  Extend `get_doc` schema and return the selected view payload.
- `src/ones-client.ts`
  Replace plain-text normalization path with document-source parsing, AST assembly, OCR enrichment, and view selection.
- `README.md`
  Document the new `get_doc` contract and OCR-related env vars.
- `tests/mcp-tools.test.ts`
  Assert the new `get_doc` input schema and default view behavior.
- `tests/ones-client.test.ts`
  Preserve re-login behavior while updating client return shape expectations.
- `tests/ones-client-requirement.test.ts`
  Assert requirement-linked documents now return structured output.
- `tests/integration/mcp-e2e.test.ts`
  Cover end-to-end `view=llm`, optional `view=human`, nested tables, images, and OCR metadata.

## Implementation Notes

- Do not remove `normalizeContent` in the same pass. Keep it as a fallback for unsupported source fragments until the new parsers cover the observed shapes.
- Keep OCR opt-in by configuration but best-effort at runtime:
  - No OCR config: return image resource without `ocr`.
  - OCR failure/timeout: return `ocr.status = "failed"` and continue.
- Avoid silently flattening tables. If Markdown cannot faithfully render a complex table, emit a readable placeholder in `human_view` and keep the real structure in `llm_view`.

### Task 1: Define the external contract and config surface

**Files:**
- Create: `src/documents/model.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Test: `tests/mcp-tools.test.ts`

- [ ] **Step 1: Write the failing tool-schema test**

```ts
it("get_doc accepts view/include_raw/include_resources and defaults to llm", () => {
  const getDoc = buildToolList().find((t) => t.name === "get_doc");
  const schema = getDoc?.inputSchema as {
    properties?: Record<string, { enum?: string[]; default?: unknown }>;
    required?: string[];
  };

  expect(schema.required).toEqual(["ref"]);
  expect(schema.properties?.view?.enum).toEqual(["llm", "human", "both"]);
  expect(schema.properties?.view?.default).toBe("llm");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp-tools.test.ts`
Expected: FAIL because `get_doc` has no `view` field yet.

- [ ] **Step 3: Add shared response/request types and config fields**

```ts
export type GetDocView = "llm" | "human" | "both";

export type GetDocOptions = {
  view: GetDocView;
  includeRaw: boolean;
  includeResources: boolean;
};

export type OcrConfig = {
  provider: string | null;
  endpoint: string | null;
  apiKey: string | null;
  timeoutMs: number;
};
```

- [ ] **Step 4: Update `get_doc` input schema and config loader**

```ts
properties: {
  ref: { type: "string" },
  view: {
    type: "string",
    enum: ["llm", "human", "both"],
    default: "llm",
  },
  include_raw: { type: "boolean", default: false },
  include_resources: { type: "boolean", default: true },
}
```

- [ ] **Step 5: Run the focused test again**

Run: `npx vitest run tests/mcp-tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/documents/model.ts src/config.ts src/index.ts tests/mcp-tools.test.ts
git commit -m "feat: define structured get_doc contract"
```

### Task 2: Build raw-source extraction and AST foundations

**Files:**
- Create: `src/documents/source.ts`
- Create: `tests/documents/source.test.ts`
- Modify: `src/ones-client.ts`
- Test: `tests/documents/source.test.ts`

- [ ] **Step 1: Write failing source-detection tests**

```ts
it("detects html source from content string", () => {
  expect(detectDocumentSource({ content: "<table><tr><td>A</td></tr></table>" }).format)
    .toBe("html");
});

it("detects richtext-json source from blocks payload", () => {
  expect(
    detectDocumentSource({
      content: JSON.stringify({ blocks: [{ type: "text", text: [{ insert: "A" }] }] }),
    }).format,
  ).toBe("richtext-json");
});
```

- [ ] **Step 2: Run the new source tests**

Run: `npx vitest run tests/documents/source.test.ts`
Expected: FAIL because `detectDocumentSource` does not exist.

- [ ] **Step 3: Implement source extraction**

```ts
export type DocumentSource = {
  raw: string;
  format: "html" | "richtext-json" | "plain";
};

export function detectDocumentSource(payload: Record<string, unknown>): DocumentSource {
  const raw = typeof payload.content === "string"
    ? payload.content
    : typeof payload.body === "string"
      ? payload.body
      : "";

  if (looksLikeRichTextJson(raw)) return { raw, format: "richtext-json" };
  if (/<[a-z][\s\S]*>/i.test(raw)) return { raw, format: "html" };
  return { raw, format: "plain" };
}
```

- [ ] **Step 4: Thread the source descriptor into `OnesClient` without changing final output yet**

```ts
const source = detectDocumentSource(data);
```

- [ ] **Step 5: Run the source tests**

Run: `npx vitest run tests/documents/source.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/documents/source.ts tests/documents/source.test.ts src/ones-client.ts
git commit -m "feat: detect raw document source formats"
```

### Task 3: Parse HTML into a structure-preserving AST

**Files:**
- Create: `src/documents/parse-html.ts`
- Create: `tests/documents/parse-html.test.ts`
- Modify: `src/documents/model.ts`
- Test: `tests/documents/parse-html.test.ts`

- [ ] **Step 1: Write failing HTML parser tests for tables and images**

```ts
it("preserves nested tables and image nodes", () => {
  const doc = parseHtmlDocument(`
    <h1>权限矩阵</h1>
    <table>
      <tr>
        <td>
          <p>管理员</p>
          <table><tr><td>子表</td></tr></table>
        </td>
        <td><img src="https://img.example/1.png" alt="流程图"></td>
      </tr>
    </table>
  `);

  expect(doc.children[1]?.type).toBe("table");
  expect(doc.resources[0]).toMatchObject({
    type: "image",
    src: "https://img.example/1.png",
    alt: "流程图",
  });
});
```

- [ ] **Step 2: Run the parser test**

Run: `npx vitest run tests/documents/parse-html.test.ts`
Expected: FAIL because `parseHtmlDocument` does not exist.

- [ ] **Step 3: Implement AST node types and HTML parser**

```ts
export type DocumentNode =
  | { type: "heading"; level: number; children: InlineNode[]; path: string }
  | { type: "paragraph"; children: InlineNode[]; path: string }
  | { type: "table"; rows: TableRowNode[]; path: string }
  | { type: "image"; resourceRef: string; path: string };

export function parseHtmlDocument(raw: string): ParsedDocument {
  const root = parseFragment(raw);
  return walkHtmlRoot(root);
}
```

- [ ] **Step 4: Preserve cell nesting instead of flattening**

```ts
type TableCellNode = {
  colspan: number;
  rowspan: number;
  children: DocumentNode[];
};
```

- [ ] **Step 5: Run the focused HTML parser test**

Run: `npx vitest run tests/documents/parse-html.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/documents/model.ts src/documents/parse-html.ts tests/documents/parse-html.test.ts
git commit -m "feat: parse html documents into structured ast"
```

### Task 4: Parse rich-text JSON into the same AST and add Markdown rendering

**Files:**
- Create: `src/documents/parse-rich-text.ts`
- Create: `src/documents/render-markdown.ts`
- Create: `tests/documents/parse-rich-text.test.ts`
- Create: `tests/documents/render-markdown.test.ts`
- Test: `tests/documents/parse-rich-text.test.ts`
- Test: `tests/documents/render-markdown.test.ts`

- [ ] **Step 1: Write failing rich-text parser tests**

```ts
it("maps rich-text blocks into headings, paragraphs, and images", () => {
  const doc = parseRichTextDocument(JSON.stringify({
    blocks: [
      { type: "heading", level: 1, text: [{ insert: "标题" }] },
      { type: "text", text: [{ insert: "正文" }] },
      { type: "image", attrs: { src: "https://img.example/2.png", alt: "示意图" } },
    ],
  }));

  expect(doc.children.map((node) => node.type)).toEqual(["heading", "paragraph", "image"]);
});
```

- [ ] **Step 2: Write failing Markdown renderer tests**

```ts
it("renders simple ast to markdown and degrades complex tables", () => {
  const markdown = renderMarkdown({
    type: "document",
    children: [
      { type: "heading", level: 1, children: [{ type: "text", text: "标题" }], path: "0" },
      { type: "table", rows: [], path: "1" },
    ],
    resources: [],
  });

  expect(markdown).toContain("# 标题");
  expect(markdown).toContain("[复杂表格");
});
```

- [ ] **Step 3: Run the parser and renderer tests**

Run: `npx vitest run tests/documents/parse-rich-text.test.ts tests/documents/render-markdown.test.ts`
Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the rich-text parser**

```ts
export function parseRichTextDocument(raw: string): ParsedDocument {
  const payload = JSON.parse(raw) as { blocks?: unknown[] };
  return walkRichTextBlocks(payload.blocks ?? []);
}
```

- [ ] **Step 5: Implement optional Markdown rendering**

```ts
export function renderMarkdown(doc: ParsedDocument): string {
  return doc.children.map(renderNode).filter(Boolean).join("\n\n");
}
```

- [ ] **Step 6: Run the focused tests**

Run: `npx vitest run tests/documents/parse-rich-text.test.ts tests/documents/render-markdown.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/documents/parse-rich-text.ts src/documents/render-markdown.ts tests/documents/parse-rich-text.test.ts tests/documents/render-markdown.test.ts
git commit -m "feat: add rich text parsing and markdown rendering"
```

### Task 5: Add OCR enrichment as a best-effort resource layer

**Files:**
- Create: `src/ocr/ocr-client.ts`
- Create: `tests/ocr/ocr-client.test.ts`
- Modify: `src/config.ts`
- Test: `tests/ocr/ocr-client.test.ts`

- [ ] **Step 1: Write failing OCR tests**

```ts
it("returns failed status instead of throwing when provider errors", async () => {
  const runOcr = createOcrRunner({
    provider: "http",
    endpoint: "https://ocr.example/api",
    apiKey: "secret",
    timeoutMs: 1000,
  });

  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

  await expect(runOcr({ id: "img-1", src: "https://img.example/1.png" }))
    .resolves.toMatchObject({ status: "failed" });
});
```

- [ ] **Step 2: Run the OCR test**

Run: `npx vitest run tests/ocr/ocr-client.test.ts`
Expected: FAIL because the OCR runner does not exist.

- [ ] **Step 3: Implement OCR config and runner**

```ts
export type OcrResult =
  | { status: "ok"; text: string; blocks: Array<{ text: string; bbox?: number[] }> }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

export function createOcrRunner(cfg: OcrConfig) {
  return async (image: { id: string; src: string }) => {
    if (!cfg.provider || !cfg.endpoint) {
      return { status: "skipped", reason: "ocr_not_configured" } as const;
    }
    try {
      return await requestOcr(cfg, image);
    } catch (error) {
      return { status: "failed", error: String(error) } as const;
    }
  };
}
```

- [ ] **Step 4: Run the focused OCR tests**

Run: `npx vitest run tests/ocr/ocr-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ocr/ocr-client.ts src/config.ts tests/ocr/ocr-client.test.ts
git commit -m "feat: add best effort ocr resource enrichment"
```

### Task 6: Assemble `llm_view` / `human_view` in `OnesClient`

**Files:**
- Modify: `src/ones-client.ts`
- Modify: `tests/ones-client.test.ts`
- Modify: `tests/ones-client-requirement.test.ts`
- Test: `tests/ones-client.test.ts`
- Test: `tests/ones-client-requirement.test.ts`

- [ ] **Step 1: Write failing client-shape tests**

```ts
expect(doc).toMatchObject({
  doc: { id: "D-1", title: "Doc 1", source_format: "html" },
  llm_view: {
    type: "document",
    children: [{ type: "paragraph" }],
  },
});
expect(doc.human_view).toBeUndefined();
```

- [ ] **Step 2: Run the client tests**

Run: `npx vitest run tests/ones-client.test.ts tests/ones-client-requirement.test.ts`
Expected: FAIL because `OnesClient` still returns `{ id, title, content, updated_at }`.

- [ ] **Step 3: Refactor `OnesClient` to assemble parsed document views**

```ts
const source = detectDocumentSource(data);
const parsed = source.format === "html"
  ? parseHtmlDocument(source.raw)
  : source.format === "richtext-json"
    ? parseRichTextDocument(source.raw)
    : fallbackPlainDocument(source.raw);

const resources = input.includeResources
  ? await enrichResourcesWithOcr(parsed.resources, this.ocrRunner)
  : [];
```

- [ ] **Step 4: Return only the requested views**

```ts
return {
  doc: meta,
  ...(options.view === "llm" || options.view === "both" ? { llm_view } : {}),
  ...(options.view === "human" || options.view === "both" ? { human_view } : {}),
  ...(options.includeRaw ? { raw: { content: source.raw } } : {}),
};
```

- [ ] **Step 5: Run the focused client tests**

Run: `npx vitest run tests/ones-client.test.ts tests/ones-client-requirement.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ones-client.ts tests/ones-client.test.ts tests/ones-client-requirement.test.ts
git commit -m "feat: return structured document views from ones client"
```

### Task 7: Update MCP handler, end-to-end coverage, and docs

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/integration/mcp-e2e.test.ts`
- Modify: `README.md`
- Test: `tests/integration/mcp-e2e.test.ts`

- [ ] **Step 1: Write failing integration assertions for `view=llm` and `view=both`**

```ts
expect(result.content[0]?.type).toBe("text");
const payload = JSON.parse(result.content[0]?.text ?? "{}");
expect(payload.llm_view.type).toBe("document");
expect(payload.human_view).toBeUndefined();
```

and

```ts
const payload = JSON.parse(result.content[0]?.text ?? "{}");
expect(payload.human_view?.format).toBe("markdown");
expect(payload.llm_view.resources?.[0]?.ocr?.status).toBe("ok");
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/integration/mcp-e2e.test.ts`
Expected: FAIL because the MCP handler still passes only `ref`.

- [ ] **Step 3: Parse optional request fields in `src/index.ts` and forward them to `OnesClient`**

```ts
const input = z.object({
  ref: z.string().min(1),
  view: z.enum(["llm", "human", "both"]).default("llm"),
  include_raw: z.boolean().default(false),
  include_resources: z.boolean().default(true),
}).parse(request.params.arguments ?? {});
```

- [ ] **Step 4: Update `README.md` with examples and OCR env vars**

```md
ONES_OCR_PROVIDER=http
ONES_OCR_ENDPOINT=https://ocr.example/api
ONES_OCR_API_KEY=...
ONES_OCR_TIMEOUT_MS=10000
```

- [ ] **Step 5: Run the focused integration test**

Run: `npx vitest run tests/integration/mcp-e2e.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/index.ts tests/integration/mcp-e2e.test.ts README.md
git commit -m "feat: expose llm and human document views"
```

### Task 8: Cleanup, fallback verification, and release notes

**Files:**
- Modify: `src/normalizer.ts`
- Modify: `README.md`
- Test: `tests/normalizer.test.ts`

- [ ] **Step 1: Write a failing fallback test**

```ts
it("keeps plain text fallback available for unsupported fragments", () => {
  expect(normalizeContent("plain text only", 20)).toBe("plain text only");
});
```

- [ ] **Step 2: Run the fallback test**

Run: `npx vitest run tests/normalizer.test.ts`
Expected: PASS or FAIL depending on current fallback behavior; if PASS, keep the test as a safety net.

- [ ] **Step 3: Add a code comment clarifying fallback-only status**

```ts
// Fallback for unsupported fragments while structured parsers cover the main path.
```

- [ ] **Step 4: Run smoke-level verification**

Run: `npm run test`
Expected: PASS with no regressions in auth/discovery/search behavior.

- [ ] **Step 5: Commit**

```bash
git add src/normalizer.ts tests/normalizer.test.ts README.md
git commit -m "chore: document structured parser fallback behavior"
```

## Verification Checklist

- `search_docs` behavior remains unchanged.
- `get_doc` defaults to `view=llm`.
- `view=human` returns Markdown only when requested.
- `view=both` returns both views in one payload.
- HTML tables keep row/column/cell nesting.
- Nested tables remain nested inside table cells.
- Image resources are extracted even when OCR is skipped or fails.
- OCR failures do not fail the whole request.
- Requirement-hash lookup still returns the latest linked document.
- Wiki page URLs still resolve correctly.

## Risks To Watch

- ONES rich-text blocks may use shapes not covered by the first parser pass. Keep raw payload optional for debugging and add fixtures as soon as new shapes are observed.
- HTML parsing in Node has no DOM by default. Pick one parser strategy early and keep tests fixture-driven to avoid brittle behavior.
- OCR response payloads vary by provider. Normalize the provider response at the boundary and keep provider-specific fields out of the document model.
- Large documents may make MCP responses too big. If that shows up in testing, add a follow-up plan for pagination or selective expansion instead of flattening structure.
