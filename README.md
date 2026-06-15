# ONES Doc MCP

用于内网环境的 ONES 文档读取 MCP Server。支持两种鉴权方式：

- 账号密码登录
- 浏览器已登录态复用

## 环境要求

- Node.js 20.19.0+
- 可访问 ONES 内网地址
- ONES 账号或已登录浏览器会话

## 环境变量

复制 `.env.example` 为 `.env` 并填写。以下两组选一种即可：

- `ONES_BASE_URL`：ONES 内网根地址
- `ONES_USERNAME`：登录账号，账号密码模式必填
- `ONES_PASSWORD`：登录密码，账号密码模式必填
- `ONES_TEAM_ID`：默认 ONES 项目团队 ID；纯 `#12345` 这类工作项编号入口需要，完整 task URL 可从 URL 里解析 team id
- `ONES_AUTH_TOKEN`：浏览器会话里的 Bearer token，会话复用模式可选但建议提供
- `ONES_COOKIE`：浏览器会话里的 Cookie，会话复用模式可选但建议提供
- `ONES_ORIGIN`：请求使用的 Origin，可选，默认回落到 `ONES_BASE_URL`
- `ONES_REFERER`：请求使用的 Referer，可选，默认回落到 `${ONES_BASE_URL}/project/`
- `ONES_USER_AGENT`：请求使用的 User-Agent，可选；账号密码模式下未配置时默认使用企微风格 UA
- `ONES_TIMEOUT_MS`：请求超时，可选，默认 `15000`
- `ONES_MAX_CONTENT_CHARS`：正文最大长度，可选，默认 `20000`
- `ONES_OCR_PROVIDER`：OCR 提供方，可选，当前支持 `http`
- `ONES_OCR_ENDPOINT`：OCR 服务地址，可选
- `ONES_OCR_API_KEY`：OCR 服务鉴权 token，可选
- `ONES_OCR_TIMEOUT_MS`：OCR 请求超时，可选，默认 `15000`

示例中的敏感信息请替换为你自己的值，不要把真实账号密码提交到仓库或直接写进公开文档：

- `ONES_BASE_URL=https://ones.example.internal`
- `ONES_USERNAME=your_username@example.com`
- `ONES_PASSWORD=your_password_here`

或者：

- `ONES_BASE_URL=https://ones.example.internal`
- `ONES_AUTH_TOKEN=your_browser_bearer_token`
- `ONES_COOKIE=ones-lt=...; ones-ids-sid=...`
- `ONES_USER_AGENT=Mozilla/5.0 ...`

## 单独包用法

这个包本质上是一个基于 `stdio` 的 MCP Server。单独运行时会等待 MCP 客户端连接，不会像普通 CLI 那样输出交互式菜单。

仓库内部已经按 transport 分层，默认入口仍只启用 `stdio`；未来如果需要接入 `Streamable HTTP`，可以在不改工具实现的前提下扩展新的 transport。

### 直接通过 npm 包运行

```bash
npx -y @bakarhythm/get-doc-content
```

### 运行本地构建产物

```bash
npm install
npm run build
node dist/src/index.js
```

### 本地开发模式

```bash
npm install
npm run dev
```

## MCP 用法

### 在 Codex 中使用

`~/.codex/config.toml` 示例：

```toml
[mcp_servers.getDocContent]
type = "stdio"
command = "npx"
args = ["-y", "@bakarhythm/get-doc-content@latest"]

[mcp_servers.getDocContent.env]
ONES_BASE_URL = "https://ones.example.internal"
ONES_USERNAME = "your_username@example.com"
ONES_PASSWORD = "your_password_here"
```

如果你的 ONES 租户依赖浏览器登录态，也可以直接注入会话：

```toml
[mcp_servers.getDocContent.env]
ONES_BASE_URL = "https://ones.example.internal"
ONES_AUTH_TOKEN = "your_browser_bearer_token"
ONES_COOKIE = "ones-lt=...; ones-ids-sid=..."
ONES_USER_AGENT = "Mozilla/5.0 ..."
```

如果你想优先验证本地修复，而不是使用 npm 上的已发布版本，也可以直接指向本地构建产物：

```toml
[mcp_servers.getDocContent]
type = "stdio"
command = "node"
args = ["/absolute/path/to/mcp-demo/dist/src/index.js"]

[mcp_servers.getDocContent.env]
ONES_BASE_URL = "https://ones.example.internal"
ONES_USERNAME = "your_username@example.com"
ONES_PASSWORD = "your_password_here"
```

### 在通用 MCP 客户端中使用

```json
{
  "mcpServers": {
    "getDocContent": {
      "command": "npx",
      "args": ["-y", "@bakarhythm/get-doc-content"],
      "env": {
        "ONES_BASE_URL": "https://ones.example.internal",
        "ONES_USERNAME": "your_username@example.com",
        "ONES_PASSWORD": "your_password_here"
      }
    }
  }
}
```

启动成功后，MCP 客户端应能看到以下工具：

- `search_docs`
- `get_doc`
- `get_doc_outline`
- `get_doc_section`
- `get_doc_chunks`
- `get_doc_context`
- `resolve_requirement`
- `get_requirement_detail`
- `get_execution_tasks`
- `resolve_bug`
- `get_bug_detail`
- `get_bug_parent_requirement`
- `list_requirement_bugs`
- `get_task_messages`
- `extract_requirement_materials`
- `get_related_wiki_pages`
- `get_task_rich_resources`
- `download_ones_resource`

这些工具都会继续返回可读的 JSON 文本内容，同时也会提供 MCP `structuredContent` 供支持结构化结果的客户端直接消费。

## 调试与评估

### 调试页面解析

直接调试单个页面：

```bash
npm run debug:page -- "https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID" --raw-chars 1200
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
    "table-page": "https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID",
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

如果你要保存完整原始内容，不要只用默认预览长度，可以改用：

```bash
npm run debug:page -- table-page --full-raw > tmp/debug-page-table-page.txt 2>&1
```

或：

```bash
npm run debug:page -- table-page --raw-chars all > tmp/debug-page-table-page.txt 2>&1
```

### 评估 LLM 对结构化结果的理解

```bash
cp llm-eval.config.example.json llm-eval.config.json
npm run eval:llm
npm run eval:llm -- --variant raw
npm run eval:llm -- --case table-page-summary
```

这个脚本会：

- 按配置里的 `ref` 实时拉取 ONES 文档
- 选择 `llm_view`、`raw` 或 `full` 作为模型输入
- 调用 OpenAI Responses API 回答问题
- 按 `requiredPhrases` 和 `forbiddenPhrases` 输出简单通过率报告

需要额外配置：

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=
```

`llm-eval.config.json` 示例：

```json
{
  "model": "gpt-5.2",
  "variant": "llm_view",
  "maxOutputTokens": 800,
  "refs": {
    "table-page": "https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID"
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

- 人工审查手册：`docs/review/llm-view-manual-review-template.md`
- 审查记录样例：`docs/review/llm-view-manual-review-example.json`

## MCP 工具

### 推荐工作流

对于中长文档，推荐按下面的顺序调用，而不是默认直接取整篇：

1. `get_doc_outline`
2. `get_doc_section` 或 `get_doc_chunks`
3. 调用方在本地保留副本
4. 再把需要的片段提供给 LLM

如果调用方不想自己编排，也可以直接用 `get_doc_context`，让 server 按问题内容自动选择章节或分块。

### 1) `search_docs`

按关键词搜索文档。

示例参数：

```json
{"query":"ONES 登录","limit":5}
```

### 2) `get_doc`

通过上下文引用获取文档，并返回面向 LLM 的结构化视图，按需附带 Markdown 人类阅读视图。

`ref` 支持：

- 完整 ONES 文档 URL，优先
- `#12345` 需求号

可选参数：

- `view`：`"llm"` | `"human"` | `"both"`，默认 `llm`
- `include_raw`：是否返回原始 ONES 内容，默认 `false`
- `include_resources`：是否返回资源清单及 OCR 元数据，默认 `true`

当 `ref` 为 `#12345` 时：

- 服务会先查询需求关联文档
- 按 `updated_at` 取最新一篇，缺失时回退 `created_at`
- 返回该文档正文

示例：

```json
{"ref":"https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID"}
```

```json
{"ref":"#12345"}
```

### 3) `get_doc_outline`

先获取文档目录结构、章节路径和粗略长度，适合在长文场景下做渐进式读取。

示例参数：

```json
{"ref":"#12345"}
```

### 4) `get_doc_section`

按 `section_id` 获取单个章节；可选 `include_descendants=true` 把子章节一起带回。

示例参数：

```json
{"ref":"#12345","section_id":"sec-2","include_descendants":true}
```

### 5) `get_doc_chunks`

按字符预算分页获取文档片段，适合“总结整篇”或“检查全文冲突”这类任务。

示例参数：

```json
{"ref":"#12345","cursor":null,"max_chars":6000}
```

### 6) `get_doc_context`

根据问题自动选择章节或 chunk，适合不想自行编排 outline/section/chunk 工作流的调用方。

示例参数：

```json
{"ref":"#12345","question":"请总结整篇文档的所有权限规则","mode":"auto","max_chars":12000}
```

```json
{"ref":"#12345","view":"both","include_raw":true,"include_resources":true}
```

### 7) 工作项工具

工作项工具用于读取 ONES 需求、任务、bug 和评论事实，服务于需求开发工作流。它们只读，不计算 baseline，也不会自动决定 bug 修复范围。

纯编号入口需要配置 `ONES_TEAM_ID`：

```env
ONES_TEAM_ID=63FL1oSZ
```

如果传入完整 task URL，工具会优先使用 URL 里的 team id。

工具列表：

- `resolve_requirement`：把需求号、task id 或 task URL 解析成标准工作项实体
- `get_requirement_detail`：读取需求正文、字段和关联任务
- `get_execution_tasks`：读取需求关联的执行任务候选
- `resolve_bug`：把 bug 号、task id 或 task URL 解析成标准工作项实体
- `get_bug_detail`：读取 bug 正文、严重级别、优先级和关联任务
- `get_bug_parent_requirement`：从 bug 的关联任务里反查需求
- `list_requirement_bugs`：按需列出需求下的 bug
- `get_task_messages`：读取任务消息或评论
- `extract_requirement_materials`：从需求任务正文和富文本字段中提取 wiki、外部链接、图片资源和完整性提示
- `get_related_wiki_pages`：发现需求关联或正文链接到的 ONES wiki 页面
- `get_task_rich_resources`：提取任务正文里的富文本图片资源
- `download_ones_resource`：使用当前 MCP 登录态下载 ONES 鉴权资源，返回文件元数据和 base64 内容

示例参数：

```json
{"ref":"#794"}
```

```json
{"task_id":"REQ-794"}
```

```json
{"url":"https://ones.example.internal/wiki/api/wiki/editor/team-id/ref-id/resources/mock-image.png"}
```

说明：

- `get_task_rich_resources` 默认只返回资源元数据和 `src`，不会自动下载文件
- 如果图片/附件链接需要 ONES 鉴权，调用 `download_ones_resource`，MCP 会复用当前登录态下载
- 当前下载返回 `content_base64`，是否落盘由调用方自行决定

## 发布流程

仓库当前使用 Changesets 管理版本和发布说明，不再要求本地手工打 tag。

推荐流程：

1. 完成功能后，判断这次改动是否对调用方可感知
2. 如果可感知，运行 `npm run changeset` 生成说明文件
3. 把代码和 `.changeset/*.md` 一起合并到 `main`
4. GitHub Actions 自动创建或更新 Release PR
5. 合并 Release PR 后，Actions 自动发布 npm、创建 tag，并生成 GitHub Release

### 什么时候必须写 changeset

以下改动建议必须写：

- 新增、删除或重命名 MCP 工具
- 工具参数、返回结构、默认行为变化
- 安装方式、运行入口、环境变量契约变化
- 调用方能直接感知到的 bugfix

以下改动通常可以不写：

- 仅文档、测试、注释变更
- 不影响调用方的内部重构
- 仅 CI 或本地开发流程调整

### 去哪里看这次发了什么

- Release PR：看即将发布的版本号和变更摘要
- GitHub Release：看已经发布出去的 changelog
- GitHub Actions 日志：看发布执行过程、失败原因和 npm publish 记录

## 常见问题

1. 登录失败，`AUTH_FAILED`
- 检查 `ONES_BASE_URL`、账号密码是否正确。
- 如果使用会话复用，刷新 `ONES_AUTH_TOKEN` 和 `ONES_COOKIE`。

2. MCP 启动失败，提示 `initialize response` 或连接被关闭
- 先确认客户端实际启动的是哪个版本。
- 如果你使用的是 `npx -y @bakarhythm/get-doc-content@latest`，请确认已升级到包含最新修复的版本。
- 排查时优先查看 MCP 进程 stderr 日志；当前版本会输出 `mcp.startup.begin`、`mcp.startup.ready`、`mcp.startup.failed`、`mcp.runtime.init.failed` 等结构化日志。

3. 输入无效，`INVALID_DOC_REF`
- `get_doc.ref` 仅支持完整 URL 或 `#数字`。

4. 无关联文档，`NO_LINKED_DOC`
- 该需求号下没有关联文档，或当前账号无权限读取。

5. 接口探测失败，`DISCOVERY_FAILED`
- 说明当前 ONES 实例接口与候选路径不匹配，需要补充候选规则。
