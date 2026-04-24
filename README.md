# ONES Doc MCP

用于内网环境的 ONES 文档读取 MCP Server。只需配置 ONES 地址和登录账号密码，即可通过 MCP 获取文档搜索结果与文档正文。

## 环境要求

- Node.js 20.19.0+
- 可访问 ONES 内网地址
- ONES 账号（建议最小只读权限）

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

- `ONES_BASE_URL`：ONES 内网根地址
- `ONES_USERNAME`：登录账号
- `ONES_PASSWORD`：登录密码
- `ONES_TIMEOUT_MS`：请求超时（可选，默认 `15000`）
- `ONES_MAX_CONTENT_CHARS`：正文最大长度（可选，默认 `20000`）
- `ONES_OCR_PROVIDER`：OCR 提供方（可选，当前支持 `http`）
- `ONES_OCR_ENDPOINT`：OCR 服务地址（可选）
- `ONES_OCR_API_KEY`：OCR 服务鉴权 token（可选）
- `ONES_OCR_TIMEOUT_MS`：OCR 请求超时（可选，默认 `15000`）

## 安装与使用

直接运行：

```bash
npx -y @bakarhythm/get-doc-content
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "ones-doc": {
      "command": "npx",
      "args": ["-y", "@bakarhythm/get-doc-content"],
      "env": {
        "ONES_BASE_URL": "https://ones.example.internal",
        "ONES_USERNAME": "your_username",
        "ONES_PASSWORD": "your_password"
      }
    }
  }
}
```

本地调试页面结构：

```bash
npm run debug:page -- "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/KkVZSkGh" --raw-chars 1200
```

也可以使用本地调试配置文件：

```bash
cp debug-page.config.example.json debug-page.config.json
npm run debug:page
npm run debug:page -- table-page
npm run debug:page -- req-12345 --raw-chars 2000
npm run debug:page -- table-page --full-raw
npm run debug:page -- table-page --raw-chars all
```

`debug-page.config.json` 不会提交到 git，可用于保存本地常用 URL：

```json
{
  "defaultRef": "table-page",
  "rawChars": 1200,
  "refs": {
    "table-page": "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/KkVZSkGh",
    "req-12345": "#12345"
  }
}
```

这个脚本会直接复用仓库里的 ONES 登录和解析逻辑，打印：
- `parsed_ref`
- `doc.source_format`
- 顶层节点类型统计
- 资源与 OCR 状态
- 原始内容预览

如果你要保存完整原始内容，不要只用默认预览长度，改用：

```bash
npm run debug:page -- table-page --full-raw > tmp/debug-page-table-page.txt 2>&1
```

或：

```bash
npm run debug:page -- table-page --raw-chars all > tmp/debug-page-table-page.txt 2>&1
```

本地评估 LLM 是否能理解结构化返回值：

```bash
cp llm-eval.config.example.json llm-eval.config.json
npm run eval:llm
npm run eval:llm -- --variant raw
npm run eval:llm -- --case table-page-summary
```

这个脚本会：
- 按配置里的 `ref` 实时拉取 ONES 文档
- 选择 `llm_view` / `raw` / `full` 作为模型输入
- 调用 OpenAI Responses API 回答问题
- 按 `requiredPhrases` / `forbiddenPhrases` 输出简单通过率报告

需要额外配置：

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=
```

`llm-eval.config.json` 示例：

```json
{
  "model": "gpt-5.2",
  "variant": "llm_view",
  "maxOutputTokens": 800,
  "refs": {
    "table-page": "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/KkVZSkGh"
  },
  "cases": [
    {
      "name": "table-page-summary",
      "ref": "table-page",
      "question": "请总结这份文档的核心需求，并明确指出是否涉及表格中的规则信息。",
      "requiredPhrases": ["表格"],
      "forbiddenPhrases": ["无法判断"]
    }
  ]
}
```

建议用法：
- 先跑 `variant=llm_view`
- 再跑 `variant=raw`
- 比较同一批 case 的通过率、缺失项和误报项

如果当前没有可用模型额度，可以先做人审。仓库里已提供：

- 人工审查手册：[docs/review/llm-view-manual-review-template.md](/Users/shakugannoshana/Documents/ex/mcp-demo/.worktrees/structured-ones-doc-views/docs/review/llm-view-manual-review-template.md)
- 审查记录样例：[docs/review/llm-view-manual-review-example.json](/Users/shakugannoshana/Documents/ex/mcp-demo/.worktrees/structured-ones-doc-views/docs/review/llm-view-manual-review-example.json)

## MCP 工具

### 1) `search_docs`

按关键词搜索文档。

示例参数：

```json
{"query":"ONES 登录","limit":5}
```

### 2) `get_doc`

通过上下文引用获取文档，并返回面向 LLM 的结构化视图，按需附带 Markdown 人类阅读视图。

`ref` 支持：
- 完整 ONES 文档 URL（优先）
- `#12345` 需求号

可选参数：
- `view`：`"llm"` | `"human"` | `"both"`，默认 `llm`
- `include_raw`：是否返回原始 ONES 内容，默认 `false`
- `include_resources`：是否返回资源清单及 OCR 元数据，默认 `true`

当 `ref` 为 `#12345` 时：
- 服务会先查询需求关联文档；
- 按 `updated_at` 取最新一篇（缺失时回退 `created_at`）；
- 返回该文档正文。

示例：

```json
{"ref":"https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID"}
```

```json
{"ref":"#12345"}
```

```json
{"ref":"#12345","view":"both","include_raw":true,"include_resources":true}
```

返回结构示例：

```json
{
  "doc": {
    "id": "D-2",
    "title": "Latest Doc",
    "source_format": "html",
    "updated_at": "2026-02-02T00:00:00Z"
  },
  "llm_view": {
    "type": "document",
    "source_format": "html",
    "children": [
      { "type": "paragraph", "children": [{ "type": "text", "value": "Latest Content" }], "path": "root/0" }
    ],
    "resources": [
      {
        "id": "res-image-0",
        "type": "image",
        "src": "https://img.example/1.png",
        "alt": "示意图",
        "ocr": {
          "status": "ok",
          "text": "图片里的文字",
          "blocks": [{ "text": "图片里的文字", "bbox": [0, 0, 10, 10] }]
        }
      }
    ]
  },
  "human_view": {
    "format": "markdown",
    "content": "# 标题\n\n正文"
  },
  "raw": {
    "content": "<h1>标题</h1><p>正文</p>"
  }
}
```

说明：
- 默认只返回 `llm_view`，适合直接给 LLM 消费。
- `human_view` 为 Markdown，复杂表格会保留可读降级提示，完整结构仍以 `llm_view` 为准。
- OCR 是 best-effort 的。未配置 OCR 时资源仍会返回；单张图片 OCR 失败不会导致整篇文档失败。

## 常见问题

1. 登录失败（`AUTH_FAILED`）
- 检查 `ONES_BASE_URL`、账号密码是否正确。

2. 输入无效（`INVALID_DOC_REF`）
- `get_doc.ref` 仅支持完整 URL 或 `#数字`。

3. 无关联文档（`NO_LINKED_DOC`）
- 该需求号下没有关联文档，或当前账号无权限读取。

4. 接口探测失败（`DISCOVERY_FAILED`）
- 说明当前 ONES 实例接口与候选路径不匹配，需要补充候选规则。
